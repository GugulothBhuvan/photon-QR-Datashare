/**
 * ReceiveService.
 *
 * The mirror of `TransferService`: composes the camera adapter with the packet
 * layer and the protocol engine to turn frames into validated packets, and
 * eventually into files.
 *
 * `planning/DEPENDENCIES.md` §5 requires `CameraService` to depend on the
 * camera adapter and **not** on packet serialization. That rule is honoured by
 * splitting responsibilities:
 *
 * - `src/camera` produces payload bytes and knows nothing of packets.
 * - The packet layer parses those bytes.
 * - This service is where the two meet, which is a *service* concern, not an
 *   adapter one.
 *
 * The receive loop is driven by frames arriving from the camera. Nothing here
 * polls, sleeps or schedules — the camera pushes, and this reacts.
 */
import type { CameraAdapter, CameraFrame } from '@camera/cameraPort';
import type { QrDecoder } from '@camera/qrDecoder';

import { deserializePacket } from '@core/packet/deserializer';
import type { PacketManager } from '@core/packet/packetManager';
import { buildFile } from '@core/reconstruction/fileBuilder';
import { createPacketMap, type PacketMap } from '@core/reconstruction/packetMap';
import { verifyFile, type IntegrityResult } from '@core/reconstruction/integrityChecker';
import type { IntegrityVerifier } from '@core/contracts';
import type { ManifestManager } from '@core/manifest/manifestManager';

import type { FileId, SessionId } from '@domain/ids';
import type { Manifest } from '@domain/manifest';

/** What happened to one captured frame. */
export const FrameOutcome = {
  /** No QR symbol, or exposure too poor to try. */
  NoPacket: 'NO_PACKET',
  /** Decoded but rejected by packet validation (§11.15). */
  Rejected: 'REJECTED',
  /** A valid packet already held at this position (§11.13). */
  Duplicate: 'DUPLICATE',
  /** A new validated packet was stored. */
  Accepted: 'ACCEPTED',
} as const;

export type FrameOutcome = (typeof FrameOutcome)[keyof typeof FrameOutcome];

/** Progress across the whole transfer, for the receive screen. */
export interface ReceiveProgress {
  readonly sessionId: SessionId;
  readonly totalPackets: number;
  readonly collectedPackets: number;
  /** Packets the manifest expects that have not been validated (§11.14). */
  readonly missingPackets: number;
  readonly framesSeen: number;
  readonly framesDecoded: number;
  readonly complete: boolean;
}

/** A file that has been reassembled and verified. */
export interface CompletedFile {
  readonly fileId: FileId;
  readonly name: string;
  readonly stream: Uint8Array;
  readonly integrity: IntegrityResult;
}

export interface ReceiveServiceOptions {
  readonly camera: CameraAdapter;
  readonly decoder: QrDecoder;
  readonly packets: PacketManager;
  readonly manifests: ManifestManager;
  readonly verifier: IntegrityVerifier;
}

export interface ReceiveSession {
  /** Stops consuming frames. Idempotent. */
  stop(): void;
  /** Current progress. */
  progress(): ReceiveProgress;
  /** The packet map for a file (§13.16). */
  mapFor(file: FileId): PacketMap | undefined;
  /**
   * Reassembles and verifies every complete file (§13.11, §3.24).
   *
   * Returns only files that are complete; an incomplete file is omitted rather
   * than returned partially built.
   */
  finish(): readonly CompletedFile[];
}

export interface ReceiveService {
  /**
   * Begins consuming frames for a session whose manifest has been accepted.
   *
   * @param onProgress Called after each frame that changed something, so a
   *   screen can render without polling.
   */
  start(sessionId: SessionId, onProgress?: (progress: ReceiveProgress) => void): ReceiveSession;
}

export function createReceiveService(options: ReceiveServiceOptions): ReceiveService {
  const { camera, decoder, packets, manifests, verifier } = options;

  return {
    start(sessionId, onProgress) {
      const manifest = manifests.getManifest(sessionId) as Manifest | undefined;

      if (manifest === undefined) {
        throw new Error('Cannot receive without an accepted manifest.');
      }

      // §13.16: one packet map per file, since indices mean nothing across
      // files (§13.13).
      const maps = new Map<FileId, PacketMap>(
        manifest.entries.map((entry) => [entry.file.id, createPacketMap(entry.packetCount)]),
      );

      let framesSeen = 0;
      let framesDecoded = 0;
      let stopped = false;

      function progress(): ReceiveProgress {
        let total = 0;
        let collected = 0;

        for (const entry of manifest!.entries) {
          total += entry.packetCount;
          collected += packets.storedCount(sessionId, entry.file.id);
        }

        return {
          sessionId,
          totalPackets: total,
          collectedPackets: collected,
          missingPackets: total - collected,
          framesSeen,
          framesDecoded,
          complete: total === collected,
        };
      }

      function consume(frame: CameraFrame): FrameOutcome {
        framesSeen += 1;

        const decoded = decoder.decode(frame);
        if (!decoded.ok) {
          return FrameOutcome.NoPacket;
        }

        framesDecoded += 1;

        // §11.12: parse, then validate, then store. The packet layer does the
        // first two; this only routes the result.
        const parsed = deserializePacket(decoded.payload, { expectedSessionId: sessionId });

        if (!parsed.ok) {
          return FrameOutcome.Rejected;
        }

        const { header, payload } = parsed.packet;
        const file = header.fileId as FileId;
        const map = maps.get(file);

        if (!parsed.validation.valid) {
          // §13.16 records the corrupted copy; §11.15 discards the packet.
          map?.markCorrupted(header.packetIndex);
          return FrameOutcome.Rejected;
        }

        const result = packets.accept(
          {
            sessionId,
            type: 'DATA',
            fileId: file,
            index: header.packetIndex,
            payload,
            size: payload.byteLength,
          },
          { sessionId, integrityVerified: true },
        );

        if (result.outcome === 'STORED') {
          map?.markReceived(header.packetIndex);
          return FrameOutcome.Accepted;
        }

        if (result.outcome === 'DUPLICATE') {
          map?.markReceived(header.packetIndex);
          return FrameOutcome.Duplicate;
        }

        return FrameOutcome.Rejected;
      }

      const unsubscribe = camera.onFrame((frame) => {
        if (stopped) {
          return;
        }

        consume(frame);

        // Reported for **every** frame, including those that yielded nothing.
        //
        // An earlier version reported only when a packet was stored or
        // rejected, to save re-renders. That made §5.3's frame counters wrong
        // in the one situation they exist for: a receiver pointed at a code it
        // cannot read saw "0 frames" and could not tell that from a camera
        // pointed at a wall. A counter that only moves when something else
        // moved is not a counter.
        onProgress?.(progress());
      });

      return {
        stop() {
          if (stopped) {
            return;
          }
          stopped = true;
          unsubscribe();
        },

        progress,

        mapFor(file) {
          return maps.get(file);
        },

        finish() {
          const completed: CompletedFile[] = [];

          for (const entry of manifest.entries) {
            const built = buildFile(packets.orderedPackets(sessionId, entry.file.id), {
              expectedPackets: entry.packetCount,
            });

            if (!built.ok) {
              continue;
            }

            // §3.24: integrity verified before a transfer is complete.
            completed.push({
              fileId: entry.file.id,
              name: entry.file.name,
              stream: built.stream,
              integrity: verifyFile({
                stream: built.stream,
                expectedHash: entry.file.hash,
                expectedSize: entry.file.size,
                algorithm: manifest.configuration.integrityAlgorithm,
                verifier,
              }),
            });
          }

          return completed;
        },
      };
    },
  };
}
