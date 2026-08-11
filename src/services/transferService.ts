/**
 * TransferService.
 *
 * Composes the protocol engine with the QR transport to produce the frames a
 * send screen displays. `planning/DEPENDENCIES.md` §5 fixes its collaborators:
 * SessionManager, ManifestManager, PacketManager and the QR side of the
 * transport — all injected, none constructed here.
 *
 * The division of labour is the whole point of this layer:
 *
 * - The **protocol engine** decides what a packet is and when a session may
 *   send one. It knows nothing about QR.
 * - The **QR adapter** turns bytes into frames. It knows nothing about
 *   sessions.
 * - **This service** is the only place that knows both, which is why it is the
 *   only place a transfer can be started.
 *
 * It contains no protocol rules of its own. Every decision it makes is
 * delegated; what it adds is sequence.
 */
import type { Clock, IdGenerator } from '@core/contracts';
import type { ManifestManager } from '@core/manifest/manifestManager';
import type { PacketManager } from '@core/packet/packetManager';
import { serializePacket, toWirePacket } from '@core/packet/serializer';
import type { SessionManager } from '@core/session/sessionManager';
import { AppError, ErrorCode } from '@core/errors';

import { createFileMetadata, type FileMetadata } from '@domain/fileMetadata';
import { fileId as toFileId, type FileId, type SessionId } from '@domain/ids';
import type { Manifest, ManifestConfiguration } from '@domain/manifest';
import { SessionState } from '@domain/session';

import {
  createFrameScheduler,
  lazyFrameSource,
  type FrameRate,
  type FrameScheduler,
  type FrameSource,
} from '@qr/frameScheduler';
import { createQrEncoder, type ErrorCorrectionLevel, type QrFrame } from '@qr/qrEncoder';

/** A file the user chose to send, before the protocol has seen it. */
export interface SelectedFile {
  readonly name: string;
  readonly mimeType?: string;
  readonly extension?: string;
  /** The file's bytes. Streaming arrives with the performance work. */
  readonly content: Uint8Array;
}

/** Everything a send screen needs to display a transfer. */
export interface PreparedTransfer {
  readonly sessionId: SessionId;
  readonly manifest: Manifest;
  /**
   * One frame per packet, in transmission order (QR_SPEC §8).
   *
   * A **lazy** sequence: each frame is encoded when first displayed and only
   * the most recent few are kept. Encoding every frame during `prepare` held
   * one QR bitmap per packet, so peak memory grew with file size — TRD §34
   * caps it at 150 MB regardless. Iterating the whole sequence still works and
   * still produces every frame, in order.
   */
  readonly frames: FrameSource<QrFrame>;
  /** Paces the frames. The screen drives it; the service does not. */
  readonly scheduler: FrameScheduler<QrFrame>;
  readonly totalPackets: number;
}

export interface PrepareOptions {
  readonly files: readonly SelectedFile[];
  readonly packetSize: number;
  readonly level?: ErrorCorrectionLevel;
  readonly rate?: FrameRate;
  /** Integrity algorithm named in the manifest (§10.5). */
  readonly integrityAlgorithm: string;
  /** Hashes the file content. Injected — the service computes no digests. */
  readonly hashFile: (content: Uint8Array) => string;
}

export interface TransferServiceOptions {
  readonly sessions: SessionManager;
  readonly manifests: ManifestManager;
  readonly packets: PacketManager;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly protocolVersion: number;
}

export interface TransferService {
  /**
   * Prepares a transfer: creates the session, builds the manifest, packetizes
   * every file and encodes each packet as a frame.
   *
   * Does not start transmitting. Display is the screen's job, and a service
   * that owned a render loop could not be tested without one.
   */
  prepare(options: PrepareOptions): PreparedTransfer;

  /** Moves a prepared session into transmission (§8.8). */
  begin(id: SessionId): boolean;

  /**
   * Returns a paused session to transmission (§26.4).
   *
   * Distinct from `begin`, which walks a *newly prepared* session up from
   * Waiting. A paused session is already past those states, so `begin` would
   * ask it for a transition the FSM rightly refuses — §26.4 permits
   * `Paused → Active` directly, and that is what resuming means.
   */
  resume(id: SessionId): boolean;

  /** Pauses transmission, preserving everything (§14.5, §14.6). */
  pause(id: SessionId): boolean;

  /** Ends a transfer and releases its packets (§8.14, §11.19). */
  cancel(id: SessionId): void;
}

export function createTransferService(options: TransferServiceOptions): TransferService {
  const { sessions, manifests, packets, clock, idGenerator, protocolVersion } = options;
  const encoder = createQrEncoder();

  return {
    prepare(prepareOptions) {
      const { files, packetSize, integrityAlgorithm, hashFile } = prepareOptions;

      if (files.length === 0) {
        throw new AppError(ErrorCode.TRANSFER_FAILED, 'A transfer must include at least one file.');
      }

      const session = sessions.createSession();
      const sessionId = session.id;

      // Each selected file becomes a domain FileMetadata with an identity of
      // its own. The id generator is the session manager's, so ids across the
      // transfer come from one source.
      const described: {
        readonly id: FileId;
        readonly file: FileMetadata;
        readonly content: Uint8Array;
      }[] = files.map((file) => {
        const id = toFileId(idGenerator.next());

        return {
          id,
          content: file.content,
          file: createFileMetadata({
            id,
            name: file.name,
            size: file.content.byteLength,
            hash: hashFile(file.content),
            ...(file.extension === undefined ? {} : { extension: file.extension }),
            ...(file.mimeType === undefined ? {} : { mimeType: file.mimeType }),
          }),
        };
      });

      const configuration: ManifestConfiguration = {
        packetSize,
        recoveryMethod: 'NATURAL_REPETITION',
        integrityAlgorithm,
        transportCapabilities: ['QR'],
      };

      const manifest = manifests.createManifest({
        sessionId,
        protocolVersion: protocolVersion as never,
        createdAt: clock.now(),
        files: described.map((entry) => entry.file),
        configuration,
      });

      manifests.accept(manifest);

      // Packetizing is eager: the packets are what the manifest counts, they
      // are small, and the registry owns them either way. **Encoding** is what
      // is deferred — a QR bitmap is orders of magnitude larger than the packet
      // it carries, and only one is on screen at a time.
      //
      // The serialized bytes are kept in packet order so a frame can be
      // produced from its index without re-walking the file.
      const serialized: Uint8Array[] = [];

      for (const entry of described) {
        const produced = packets.packetize({
          sessionId,
          fileId: entry.id,
          stream: entry.content,
          packetSize,
        });

        for (const packet of produced) {
          const wire = toWirePacket(packet, {
            protocolVersion,
            totalPackets: produced.length,
          });

          serialized.push(serializePacket(wire.header, wire.payload));
        }
      }

      // One frame per packet (QR_SPEC §5), in packet order (§8).
      const frames = lazyFrameSource(serialized.length, (index) =>
        encoder.encode(serialized[index] as Uint8Array, {
          ...(prepareOptions.level === undefined ? {} : { level: prepareOptions.level }),
        }),
      );

      return {
        sessionId,
        manifest,
        frames,
        scheduler: createFrameScheduler({
          frames,
          ...(prepareOptions.rate === undefined ? {} : { rate: prepareOptions.rate }),
        }),
        totalPackets: manifest.totalPacketCount,
      };
    },

    begin(id) {
      // §8.3: a prepared session walks Created → Waiting → Handshake → Active.
      // Each step is the session manager's decision, not this service's.
      for (const state of [SessionState.Waiting, SessionState.Handshake, SessionState.Active]) {
        if (!sessions.transition(id, state).ok) {
          return false;
        }
      }
      return true;
    },

    resume(id) {
      // §8.8: previously validated packets are preserved, so nothing is
      // rebuilt — the session simply becomes active again.
      return sessions.transition(id, SessionState.Active).ok;
    },

    pause(id) {
      return sessions.transition(id, SessionState.Paused).ok;
    },

    cancel(id) {
      // §8.14 termination, then §11.19 packet release.
      sessions.closeSession(id);
      packets.releaseSession(id);
      manifests.release(id);
    },
  };
}
