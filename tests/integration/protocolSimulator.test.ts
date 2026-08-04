/**
 * Protocol simulator — Phase 4 exit criterion.
 *
 * `planning/IMPLEMENTATION_PLAN.md` P4 requires "protocol simulator passes".
 * This drives a complete transfer through the assembled engine — session,
 * manifest, packet, resume and recovery — over a simulated optical channel
 * that loses, duplicates, reorders and corrupts packets the way a real one
 * does.
 *
 * There is **no transport here**: no QR codes, no camera, no bytes on a wire.
 * The channel hands domain packets from one side to the other, which is
 * exactly the point — PROTOCOL_SPEC §2.2 and §15.14.7 require the protocol to
 * work independently of how packets are carried, and a simulator that needed a
 * camera would not be testing the protocol.
 *
 * Every run is deterministic: the clock, the id generator and the channel's
 * "randomness" are all injected and seeded, so a failure here reproduces
 * exactly (§2.4).
 */
import type { Clock, IdGenerator } from '@core/contracts';
import { createManifestManager, type ManifestManager } from '@core/manifest/manifestManager';
import { createPacketManager, type PacketManager } from '@core/packet/packetManager';
import { createRecoveryEngine, RecoveryStrategy } from '@core/recovery/recoveryEngine';
import { createResumeEngine } from '@core/resume/resumeEngine';
import { createSessionManager, type SessionManager } from '@core/session/sessionManager';
import { createFileMetadata } from '@domain/fileMetadata';
import { fileId, protocolVersion, type SessionId } from '@domain/ids';
import type { ManifestConfiguration } from '@domain/manifest';
import type { Packet } from '@domain/packet';
import { SessionState } from '@domain/session';

const VERSION = protocolVersion(1);
const PACKET_SIZE = 8;

const FILE_A = fileId('f1000000-0000-4000-8000-000000000001');
const FILE_B = fileId('f1000000-0000-4000-8000-000000000002');

const configuration: ManifestConfiguration = {
  packetSize: PACKET_SIZE,
  recoveryMethod: RecoveryStrategy.NaturalRepetition,
  integrityAlgorithm: 'SHA-256',
  transportCapabilities: ['QR'],
};

/** Deterministic pseudo-random source, so channel behaviour is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32 — small, deterministic, and adequate for choosing which
    // packets a simulated channel drops.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

function makeClock(start = 1_700_000_000_000): Clock & { advance(ms: number): void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/**
 * Deterministic UUID generator.
 *
 * `prefix` distinguishes independent devices. Without it two senders built the
 * same way would generate the same first id and would not be different
 * sessions at all — which is exactly what the foreign-session test needs to
 * avoid.
 */
function makeIds(prefix = '00000000'): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `${prefix}-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
  };
}

/** A file's contents, distinct per file so misrouting would be visible. */
function contentFor(marker: number, length: number): Uint8Array {
  return Uint8Array.from({ length }, (_unused, index) => (marker * 31 + index) & 0xff);
}

interface Channel {
  /** Whether this transmission of a packet reaches the receiver. */
  delivers(): boolean;
  /** Whether the receiver's integrity check passes for it. */
  intact(): boolean;
}

/**
 * A lossy optical channel.
 *
 * @param lossRate Fraction of transmissions that never arrive.
 * @param corruptionRate Fraction of arrivals that fail integrity.
 */
function makeChannel(seed: number, lossRate: number, corruptionRate: number): Channel {
  const random = seededRandom(seed);

  return {
    delivers: () => random() >= lossRate,
    intact: () => random() >= corruptionRate,
  };
}

interface Sender {
  readonly sessionId: SessionId;
  readonly packets: readonly Packet[];
  readonly sessions: SessionManager;
  readonly manifests: ManifestManager;
}

/** Builds a sender: session, manifest and the packets for two files (§7.4). */
function makeSender(
  files: readonly { id: typeof FILE_A; content: Uint8Array }[],
  idPrefix = '00000000',
): Sender {
  const clock = makeClock();
  const sessions = createSessionManager({
    clock,
    idGenerator: makeIds(idPrefix),
    protocolVersion: VERSION,
  });
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
        hash: `hash-${index}`,
      }),
    ),
    configuration,
  });

  manifests.accept(manifest);

  // §11.11: the sender transmits sequentially by packet index.
  const all = files.flatMap((file) =>
    packets.packetize({
      sessionId,
      fileId: file.id,
      stream: file.content,
      packetSize: PACKET_SIZE,
    }),
  );

  return { sessionId, packets: all, sessions, manifests };
}

interface Receiver {
  readonly sessions: SessionManager;
  readonly manifests: ManifestManager;
  readonly packets: PacketManager;
}

/** Builds a receiver that has accepted the sender's manifest and gone active. */
function makeReceiver(sender: Sender): Receiver {
  const clock = makeClock();
  const sessions = createSessionManager({
    clock,
    // The receiver joins the sender's session rather than creating one, so its
    // generator is never used for this transfer.
    idGenerator: makeIds(),
    protocolVersion: VERSION,
  });
  const manifests = createManifestManager();
  const packets = createPacketManager();

  // The receiver's session mirrors the sender's identity — §8.17.3 has every
  // packet reference exactly one session, and §14.17.3 keeps it constant.
  const manifest = sender.manifests.getManifest(sender.sessionId);

  if (manifest === undefined) {
    throw new Error('sender has no manifest');
  }

  manifests.accept(manifest);

  return { sessions, manifests, packets };
}

/** Reassembles a file's payloads in index order, for the byte-identity check. */
function reassemble(packets: PacketManager, id: SessionId, file: typeof FILE_A): Uint8Array {
  // §11.10 and §11.18: merged by packet index, never by arrival order.
  const ordered = packets.orderedPackets(id, file);
  const total = ordered.reduce((sum, packet) => sum + packet.size, 0);
  const out = new Uint8Array(total);

  let offset = 0;
  for (const packet of ordered) {
    out.set(packet.payload, offset);
    offset += packet.size;
  }

  return out;
}

describe('protocol simulator', () => {
  const contentA = contentFor(3, 40); // 5 packets
  const contentB = contentFor(7, 20); // 3 packets

  const files = [
    { id: FILE_A, content: contentA },
    { id: FILE_B, content: contentB },
  ];

  it('transfers two files byte-identically over a perfect channel', () => {
    const sender = makeSender(files);
    const receiver = makeReceiver(sender);
    const expectations = { sessionId: sender.sessionId, integrityVerified: true };

    for (const packet of sender.packets) {
      receiver.packets.accept(packet, expectations);
    }

    // §3.9: the reconstructed binary stream is identical to the original.
    expect(Array.from(reassemble(receiver.packets, sender.sessionId, FILE_A))).toEqual(
      Array.from(contentA),
    );
    expect(Array.from(reassemble(receiver.packets, sender.sessionId, FILE_B))).toEqual(
      Array.from(contentB),
    );
  });

  it('recovers a lossy transfer by natural repetition (§15.6 Strategy 1)', () => {
    const sender = makeSender(files);
    const receiver = makeReceiver(sender);
    const recovery = createRecoveryEngine({
      sessions: receiver.sessions,
      manifests: receiver.manifests,
      packets: receiver.packets,
    });
    const expectations = { sessionId: sender.sessionId, integrityVerified: true };

    // 40% loss, 20% of arrivals corrupted — far worse than a real optical link.
    const channel = makeChannel(0xc0ffee, 0.4, 0.2);

    let loops = 0;

    // §11.11: the sender MAY loop packets until the transfer completes.
    while (!recovery.isComplete(sender.sessionId) && loops < 50) {
      for (const packet of sender.packets) {
        if (!channel.delivers()) {
          continue;
        }

        receiver.packets.accept(packet, {
          ...expectations,
          // A corrupted arrival fails integrity and is discarded (§11.15).
          integrityVerified: channel.intact(),
        });
      }
      loops += 1;
    }

    expect(recovery.isComplete(sender.sessionId)).toBe(true);
    expect(loops).toBeGreaterThan(1);

    // Byte-identical despite loss, corruption and repetition.
    expect(Array.from(reassemble(receiver.packets, sender.sessionId, FILE_A))).toEqual(
      Array.from(contentA),
    );
    expect(Array.from(reassemble(receiver.packets, sender.sessionId, FILE_B))).toEqual(
      Array.from(contentB),
    );
  });

  it('produces the same result as an uninterrupted transfer after a pause and resume (§14.17.10)', () => {
    const sender = makeSender(files);
    const receiver = makeReceiver(sender);
    const resume = createResumeEngine({
      sessions: receiver.sessions,
      manifests: receiver.manifests,
      packets: receiver.packets,
    });
    const expectations = { sessionId: sender.sessionId, integrityVerified: true };

    // The receiver's own session must be live for resume to act on it.
    const session = receiver.sessions.createSession();
    const localId = session.id;
    receiver.sessions.transition(localId, SessionState.Waiting);
    receiver.sessions.transition(localId, SessionState.Handshake);
    receiver.sessions.transition(localId, SessionState.Active);

    // Half the packets arrive, then the transfer is interrupted.
    const half = Math.floor(sender.packets.length / 2);

    for (const packet of sender.packets.slice(0, half)) {
      receiver.packets.accept(packet, expectations);
    }

    expect(resume.pause(localId)).toBe(true);

    // The remainder arrives after resuming.
    resume.requestResume(localId);
    resume.completeResume(localId);

    for (const packet of sender.packets.slice(half)) {
      receiver.packets.accept(packet, expectations);
    }

    // §14.17.10: a resumed transfer produces the same reconstructed file as an
    // uninterrupted one.
    expect(Array.from(reassemble(receiver.packets, sender.sessionId, FILE_A))).toEqual(
      Array.from(contentA),
    );
    expect(Array.from(reassemble(receiver.packets, sender.sessionId, FILE_B))).toEqual(
      Array.from(contentB),
    );
  });

  it('ignores packets from a foreign session throughout (§8.11)', () => {
    const first = makeSender(files);
    const second = makeSender(files, 'bbbbbbbb');
    const receiver = makeReceiver(first);

    for (const packet of second.packets) {
      receiver.packets.accept(packet, {
        sessionId: first.sessionId,
        integrityVerified: true,
      });
    }

    // Not one packet from the other session was stored.
    expect(receiver.packets.storedCount(first.sessionId, FILE_A)).toBe(0);
    expect(receiver.packets.storedCount(second.sessionId, FILE_A)).toBe(0);
  });

  it('is deterministic — the same seed produces the same transfer', () => {
    const run = (): number => {
      const sender = makeSender(files);
      const receiver = makeReceiver(sender);
      const recovery = createRecoveryEngine({
        sessions: receiver.sessions,
        manifests: receiver.manifests,
        packets: receiver.packets,
      });
      const channel = makeChannel(0x5eed, 0.5, 0.1);
      let loops = 0;

      while (!recovery.isComplete(sender.sessionId) && loops < 50) {
        for (const packet of sender.packets) {
          if (channel.delivers()) {
            receiver.packets.accept(packet, {
              sessionId: sender.sessionId,
              integrityVerified: channel.intact(),
            });
          }
        }
        loops += 1;
      }

      return loops;
    };

    expect(run()).toBe(run());
  });

  it('reaches completion with every packet accounted for exactly once (§11.18)', () => {
    const sender = makeSender(files);
    const receiver = makeReceiver(sender);
    const expectations = { sessionId: sender.sessionId, integrityVerified: true };

    // Deliver everything three times over; duplicates must not accumulate.
    for (let pass = 0; pass < 3; pass += 1) {
      for (const packet of sender.packets) {
        receiver.packets.accept(packet, expectations);
      }
    }

    expect(receiver.packets.storedCount(sender.sessionId, FILE_A)).toBe(5);
    expect(receiver.packets.storedCount(sender.sessionId, FILE_B)).toBe(3);
    expect(Array.from(reassemble(receiver.packets, sender.sessionId, FILE_A))).toEqual(
      Array.from(contentA),
    );
  });

  it('drives the session through its full lifecycle (§7.2, §26.4)', () => {
    const sender = makeSender(files);
    const observed: SessionState[] = [];
    const id = sender.sessionId;

    const record = (): void => {
      const state = sender.sessions.getSession(id)?.state;
      if (state !== undefined) {
        observed.push(state);
      }
    };

    record();
    sender.sessions.transition(id, SessionState.Waiting);
    record();
    sender.sessions.transition(id, SessionState.Handshake);
    record();
    sender.sessions.transition(id, SessionState.Active);
    record();
    sender.sessions.transition(id, SessionState.Completed);
    record();

    expect(observed).toEqual([
      SessionState.Created,
      SessionState.Waiting,
      SessionState.Handshake,
      SessionState.Active,
      SessionState.Completed,
    ]);

    // §8.17.8: a completed session does not return to Active.
    expect(sender.sessions.transition(id, SessionState.Active).ok).toBe(false);
  });
});
