/**
 * End-to-end transfer — Phase 7 exit criterion.
 *
 * `planning/IMPLEMENTATION_PLAN.md` P7 requires "transferred files are
 * byte-identical". This runs a whole transfer through every layer built so
 * far, with nothing stubbed except the light between two screens:
 *
 * ```text
 * files → manifest → packetize → serialize → QR encode → rasterise
 *   ‖ simulated optical channel: loss, corruption, repetition, reordering ‖
 *   → decode → parse → validate → packet map → reassemble → verify integrity
 * ```
 *
 * Both the sender and receiver run the real managers. The channel is seeded, so
 * a failure reproduces exactly.
 */
import type { Clock, IdGenerator, IntegrityVerifier } from '@core/contracts';
import { createManifestManager } from '@core/manifest/manifestManager';
import { deserializePacket } from '@core/packet/deserializer';
import { createPacketManager } from '@core/packet/packetManager';
import { serializePacket, toWirePacket } from '@core/packet/serializer';
import { createRecoveryEngine, RecoveryStrategy } from '@core/recovery/recoveryEngine';
import { buildFile } from '@core/reconstruction/fileBuilder';
import { createPacketMap } from '@core/reconstruction/packetMap';
import { verifyFile } from '@core/reconstruction/integrityChecker';
import { createSessionManager } from '@core/session/sessionManager';
import { createQrDecoder } from '@camera/qrDecoder';
import { PixelFormat, type CameraFrame } from '@camera/cameraPort';
import { createFileMetadata } from '@domain/fileMetadata';
import { fileId, protocolVersion, type FileId } from '@domain/ids';
import type { ManifestConfiguration } from '@domain/manifest';
import { SessionState } from '@domain/session';
import { createQrEncoder } from '@qr/qrEncoder';
import { rasterizeFrame } from '@qr/qrRenderer';
import { bytesToHex } from '@utils/hex';

const VERSION = protocolVersion(1);
const PACKET_SIZE = 96;

const FILE_A = fileId('f1000000-0000-4000-8000-000000000001');
const FILE_B = fileId('f1000000-0000-4000-8000-000000000002');

const encoder = createQrEncoder();
const decoder = createQrDecoder();

/**
 * A deterministic stand-in for the real digest.
 *
 * §20 owns integrity algorithms and is unread; Phase 11 supplies SHA-256. What
 * this test proves is that reconstruction feeds the verifier the right bytes —
 * which holds for any digest function.
 */
const verifier: IntegrityVerifier = {
  algorithm: 'TEST-DIGEST',
  digest: (bytes) => {
    let a = 7;
    let b = 11;
    for (const byte of bytes) {
      a = (a * 31 + byte) & 0xff;
      b = (b + a) & 0xff;
    }
    return Uint8Array.from([a, b, bytes.length & 0xff, (bytes.length >> 8) & 0xff]);
  },
  verify: () => true,
};

const configuration: ManifestConfiguration = {
  packetSize: PACKET_SIZE,
  recoveryMethod: RecoveryStrategy.NaturalRepetition,
  integrityAlgorithm: verifier.algorithm,
  transportCapabilities: ['QR'],
};

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

const clock: Clock = { now: () => 1_700_000_000_000 };

function ids(prefix = '00000000'): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `${prefix}-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
  };
}

function contentOf(marker: number, length: number): Uint8Array {
  return Uint8Array.from({ length }, (_u, index) => (index * marker + 17) & 0xff);
}

/** Renders serialized packet bytes as the frame a camera would capture. */
function captureOf(bytes: Uint8Array): CameraFrame {
  const raster = rasterizeFrame(encoder.encode(bytes), 3);
  return {
    width: raster.width,
    height: raster.height,
    format: PixelFormat.Rgba,
    data: raster.data,
    timestamp: 0,
  };
}

describe('a complete transfer', () => {
  const files = [
    { id: FILE_A, content: contentOf(3, 400) },
    { id: FILE_B, content: contentOf(11, 250) },
  ];

  /** Builds a sender: session, manifest, and one QR frame per packet. */
  function makeSender() {
    const sessions = createSessionManager({ clock, idGenerator: ids(), protocolVersion: VERSION });
    const manifests = createManifestManager();
    const packets = createPacketManager();

    const session = sessions.createSession();
    const sessionId = session.id;

    const manifest = manifests.createManifest({
      sessionId,
      protocolVersion: VERSION,
      createdAt: clock.now(),
      files: files.map((file, index) =>
        createFileMetadata({
          id: file.id,
          name: `file-${index}.bin`,
          size: file.content.byteLength,
          hash: bytesToHex(verifier.digest(file.content)),
        }),
      ),
      configuration,
    });
    manifests.accept(manifest);

    sessions.transition(sessionId, SessionState.Waiting);
    sessions.transition(sessionId, SessionState.Handshake);
    sessions.transition(sessionId, SessionState.Active);

    // Every file's packets, each rendered to a capturable frame.
    const frames = files.flatMap((file) => {
      const produced = packets.packetize({
        sessionId,
        fileId: file.id,
        stream: file.content,
        packetSize: PACKET_SIZE,
      });

      return produced.map((packet) => {
        const wire = toWirePacket(packet, {
          protocolVersion: 1,
          totalPackets: produced.length,
        });
        return captureOf(serializePacket(wire.header, wire.payload));
      });
    });

    return { sessions, manifests, sessionId, manifest, frames };
  }

  it('reconstructs both files byte-identically over a lossy channel', () => {
    const sender = makeSender();
    const { sessionId, manifest } = sender;

    const receiverSessions = createSessionManager({
      clock,
      idGenerator: ids('bbbbbbbb'),
      protocolVersion: VERSION,
    });
    const receiverManifests = createManifestManager();
    const receiverPackets = createPacketManager();
    receiverManifests.accept(manifest);

    const recovery = createRecoveryEngine({
      sessions: receiverSessions,
      manifests: receiverManifests,
      packets: receiverPackets,
    });

    // The receiver's own session, so recovery may run.
    const localSession = receiverSessions.createSession();
    receiverSessions.transition(localSession.id, SessionState.Waiting);
    receiverSessions.transition(localSession.id, SessionState.Handshake);
    receiverSessions.transition(localSession.id, SessionState.Active);

    // A packet map per file (§13.16).
    const maps = new Map<FileId, ReturnType<typeof createPacketMap>>(
      manifest.entries.map((entry) => [entry.file.id, createPacketMap(entry.packetCount)]),
    );

    const random = seededRandom(0xbadc0de);
    let loops = 0;

    // §11.11 and §15.6: the sender loops until the receiver has everything.
    while (
      manifest.entries.some(
        (entry) => !receiverPackets.isFileComplete(sessionId, entry.file.id, entry.packetCount),
      ) &&
      loops < 40
    ) {
      for (const frame of sender.frames) {
        // 35% of transmissions never arrive.
        if (random() < 0.35) {
          continue;
        }

        const decoded = decoder.decode(frame);
        if (!decoded.ok) {
          continue;
        }

        // 15% of arrivals are corrupted in flight.
        const intact = random() >= 0.15;
        const parsed = deserializePacket(decoded.payload, { expectedSessionId: sessionId });

        if (!parsed.ok) {
          continue;
        }

        const { header, payload } = parsed.packet;
        const file = header.fileId as FileId;
        const map = maps.get(file);

        if (!intact || !parsed.validation.valid) {
          // §13.16: a corrupted copy is recorded but never stored (§11.15).
          map?.markCorrupted(header.packetIndex);
          continue;
        }

        const result = receiverPackets.accept(
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
        } else if (result.outcome === 'DUPLICATE') {
          // Recorded so the map shows what the link actually did (§13.16).
          map?.markReceived(header.packetIndex);
        }
      }

      loops += 1;
    }

    // Every packet arrived, despite the channel.
    expect(recovery.isComplete(sessionId)).toBe(true);
    expect(loops).toBeGreaterThan(1);

    for (const entry of manifest.entries) {
      const map = maps.get(entry.file.id);
      expect(map?.isComplete()).toBe(true);

      // §13.12: reassembled in ascending index order.
      const built = buildFile(receiverPackets.orderedPackets(sessionId, entry.file.id), {
        expectedPackets: entry.packetCount,
      });

      expect(built.ok).toBe(true);
      if (!built.ok) {
        continue;
      }

      // The exit criterion: byte-identical.
      const original = files.find((file) => file.id === entry.file.id)?.content as Uint8Array;
      expect(Array.from(built.stream)).toEqual(Array.from(original));

      // §3.24: integrity verified before the transfer is complete.
      const integrity = verifyFile({
        stream: built.stream,
        expectedHash: entry.file.hash,
        expectedSize: entry.file.size,
        algorithm: configuration.integrityAlgorithm,
        verifier,
      });

      expect(integrity.verified).toBe(true);
    }

    // Only now may the session complete (§7.14.7).
    expect(receiverSessions.transition(localSession.id, SessionState.Completed).ok).toBe(true);
  });

  it('reconstructs identically over a perfect channel', () => {
    const sender = makeSender();
    const receiverPackets = createPacketManager();

    for (const frame of sender.frames) {
      const decoded = decoder.decode(frame);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) {
        continue;
      }

      const parsed = deserializePacket(decoded.payload, { expectedSessionId: sender.sessionId });
      if (!parsed.ok) {
        continue;
      }

      receiverPackets.accept(
        {
          sessionId: sender.sessionId,
          type: 'DATA',
          fileId: parsed.packet.header.fileId as FileId,
          index: parsed.packet.header.packetIndex,
          payload: parsed.packet.payload,
          size: parsed.packet.payload.byteLength,
        },
        { sessionId: sender.sessionId, integrityVerified: parsed.validation.valid },
      );
    }

    for (const entry of sender.manifest.entries) {
      const built = buildFile(receiverPackets.orderedPackets(sender.sessionId, entry.file.id), {
        expectedPackets: entry.packetCount,
      });

      const original = files.find((file) => file.id === entry.file.id)?.content as Uint8Array;

      expect(built.ok && Array.from(built.stream)).toEqual(Array.from(original));
    }
  });

  it('detects a corrupted reconstruction through integrity verification (§3.24)', () => {
    const sender = makeSender();
    const entry = sender.manifest.entries[0]!;

    // A file that reassembled but is not the file that was sent — the case
    // §15.14.10 forbids ever being reported as complete.
    const wrong = Uint8Array.from(files[0]!.content);
    wrong[10] = (wrong[10]! ^ 0xff) & 0xff;

    const integrity = verifyFile({
      stream: wrong,
      expectedHash: entry.file.hash,
      expectedSize: entry.file.size,
      algorithm: configuration.integrityAlgorithm,
      verifier,
    });

    expect(integrity.verified).toBe(false);
  });

  it('is deterministic — the same seed gives the same transfer', () => {
    const run = (): number => {
      const sender = makeSender();
      const packets = createPacketManager();
      const random = seededRandom(0x5eed);
      let delivered = 0;

      for (const frame of sender.frames) {
        if (random() < 0.5) {
          continue;
        }

        const decoded = decoder.decode(frame);
        if (!decoded.ok) {
          continue;
        }

        const parsed = deserializePacket(decoded.payload, {
          expectedSessionId: sender.sessionId,
        });
        if (!parsed.ok) {
          continue;
        }

        packets.accept(
          {
            sessionId: sender.sessionId,
            type: 'DATA',
            fileId: parsed.packet.header.fileId as FileId,
            index: parsed.packet.header.packetIndex,
            payload: parsed.packet.payload,
            size: parsed.packet.payload.byteLength,
          },
          { sessionId: sender.sessionId, integrityVerified: true },
        );
        delivered += 1;
      }

      return delivered;
    };

    expect(run()).toBe(run());
  });
});
