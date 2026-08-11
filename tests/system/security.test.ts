/**
 * Security validation (TST-003) — TEST_SPEC §8, §12, invariant §15.7.
 *
 * §8 lists six areas: CRC validation, SHA-256 verification, encryption, session
 * isolation, replay protection and invalid packet rejection. §12 makes "no
 * critical security failures" a release gate, and §15.7 requires security
 * validation to execute automatically — which is why these are a named suite
 * rather than assertions scattered through other files.
 *
 * **Two of the six cannot be tested yet, and are not faked.** SHA-256
 * verification and encryption are governed by PROTOCOL_SPEC §20, which is
 * unread, and neither is implemented — the build ships a placeholder digest
 * that names itself (A12-04). What *is* tested is the property that makes the
 * gap safe: an unsupported algorithm is reported as unverified rather than as
 * verified. A test that hashed with the placeholder and called it SHA-256
 * would satisfy §8 on paper and mislead every reader of this file.
 *
 * The four that can be tested are tested against the real packet layer, not a
 * model of it.
 */
import { createQrDecoder } from '@camera/qrDecoder';
import { deserializePacket } from '@core/packet/deserializer';
import { createPacketHeader, PacketTypeId } from '@core/packet/header';
import {
  createPacketManager,
  AcceptOutcome,
  PacketProtocolRejection,
} from '@core/packet/packetManager';
import { serializePacket } from '@core/packet/serializer';
import { PacketRejection } from '@core/packet/validator';
import { verifyFile } from '@core/reconstruction/integrityChecker';
import type { IntegrityVerifier } from '@core/contracts';
import { createPacket } from '@domain/packet';
import { fileId, sessionId } from '@domain/ids';

import { captureOf, createHarness } from '../support/opticalHarness';

const OURS = sessionId('11111111-1111-4111-8111-111111111111');
const THEIRS = sessionId('22222222-2222-4222-8222-222222222222');
const FILE = fileId('f1000000-0000-4000-8000-000000000001');

/** A real serialized packet: header, payload, CRC footer. */
function serialized(index = 0, payloadSize = 32, session = OURS): Uint8Array {
  const payload = Uint8Array.from({ length: payloadSize }, (_u, i) => (i * 7 + index) & 0xff);

  return serializePacket(
    createPacketHeader({
      protocolVersion: 1,
      packetType: PacketTypeId.Data,
      sessionId: session,
      fileId: FILE,
      packetIndex: index,
      totalPackets: 8,
      payloadLength: payload.byteLength,
    }),
    payload,
  );
}

describe('CRC validation (§8)', () => {
  it('accepts a packet whose checksum matches', () => {
    const parsed = deserializePacket(serialized(), { expectedSessionId: OURS });

    expect(parsed.ok).toBe(true);
    expect(parsed.validation.valid).toBe(true);
  });

  it.each([
    ['a payload byte', 60],
    ['the last payload byte', 81],
  ])('rejects a packet with %s flipped', (_what, offset) => {
    const bytes = serialized();
    bytes[offset] = (bytes[offset]! ^ 0xff) & 0xff;

    const parsed = deserializePacket(bytes, { expectedSessionId: OURS });

    // The checksum is what catches this. A parser that only checked structure
    // would happily hand these bytes to reconstruction.
    expect(parsed.validation.rejections).toContain(PacketRejection.BadChecksum);
  });

  it('rejects a packet whose checksum itself was altered', () => {
    // A flipped CRC and a flipped payload are the same failure to a receiver,
    // and both must be refused — an implementation that trusted the stored CRC
    // over the computed one would pass the previous test and fail this one.
    const bytes = serialized();
    bytes[bytes.length - 1] = (bytes[bytes.length - 1]! ^ 0xff) & 0xff;

    const parsed = deserializePacket(bytes, { expectedSessionId: OURS });

    expect(parsed.validation.rejections).toContain(PacketRejection.BadChecksum);
  });

  it('detects damage anywhere in the packet, not only in the payload', () => {
    // Sweeping every byte is the only way to know the checksum covers the whole
    // packet rather than a convenient part of it.
    const clean = serialized(0, 16);
    let undetected = 0;

    for (let offset = 0; offset < clean.length; offset += 1) {
      const bytes = Uint8Array.from(clean);
      bytes[offset] = (bytes[offset]! ^ 0x01) & 0xff;

      const parsed = deserializePacket(bytes, { expectedSessionId: OURS });

      if (parsed.ok && parsed.validation.valid) {
        undetected += 1;
      }
    }

    expect(undetected).toBe(0);
  });
});

describe('invalid packet rejection (§8)', () => {
  it('rejects a packet with the wrong magic', () => {
    const bytes = serialized();
    // The magic is the first two bytes; flipping one is enough to break it.
    bytes[0] = (bytes[0]! ^ 0xff) & 0xff;

    expect(deserializePacket(bytes, { expectedSessionId: OURS }).validation.rejections).toContain(
      PacketRejection.BadMagic,
    );
  });

  it('rejects a truncated packet rather than reading past its end', () => {
    const bytes = serialized().slice(0, 20);
    const parsed = deserializePacket(bytes, { expectedSessionId: OURS });

    expect(parsed.ok).toBe(false);
    expect(parsed.validation.rejections).toContain(PacketRejection.Truncated);
  });

  it('rejects an unsupported protocol version', () => {
    const payload = Uint8Array.from([1, 2, 3]);
    const bytes = serializePacket(
      createPacketHeader({
        protocolVersion: 99,
        packetType: PacketTypeId.Data,
        sessionId: OURS,
        fileId: FILE,
        packetIndex: 0,
        totalPackets: 1,
        payloadLength: payload.byteLength,
      }),
      payload,
    );

    expect(
      deserializePacket(bytes, { expectedSessionId: OURS, supportedVersions: [1] }).validation
        .rejections,
    ).toContain(PacketRejection.UnsupportedVersion);
  });

  it('never stores a packet that failed validation (§11.15, §15.5)', () => {
    const packets = createPacketManager();

    const result = packets.accept(
      createPacket({ sessionId: OURS, fileId: FILE, index: 0, payload: Uint8Array.from([1]) }),
      { sessionId: OURS, integrityVerified: false },
    );

    expect(result.outcome).toBe(AcceptOutcome.Rejected);
    expect(result.validation.rejections).toContain(PacketProtocolRejection.IntegrityFailed);

    // The decisive part: rejected means *not stored*, not merely reported.
    expect(packets.storedCount(OURS, FILE)).toBe(0);
  });

  it('rejects an index beyond what the manifest declares (§11.10)', () => {
    const packets = createPacketManager();

    const result = packets.accept(
      createPacket({ sessionId: OURS, fileId: FILE, index: 99, payload: Uint8Array.from([1]) }),
      { sessionId: OURS, integrityVerified: true, expectedCounts: { [FILE]: 4 } },
    );

    expect(result.outcome).toBe(AcceptOutcome.Rejected);
    expect(result.validation.rejections).toContain(PacketProtocolRejection.BadPacketIndex);
  });

  it('rejects a packet for a file the manifest does not describe (§11.14)', () => {
    const packets = createPacketManager();
    const unknown = fileId('f1000000-0000-4000-8000-0000000000ff');

    const result = packets.accept(
      createPacket({ sessionId: OURS, fileId: unknown, index: 0, payload: Uint8Array.from([1]) }),
      { sessionId: OURS, integrityVerified: true, expectedCounts: { [FILE]: 4 } },
    );

    expect(result.outcome).toBe(AcceptOutcome.Rejected);
    expect(result.validation.rejections).toContain(PacketProtocolRejection.UnknownFile);
  });
});

describe('session isolation (§8)', () => {
  it('refuses a packet naming another session (§11.5, §8.11)', () => {
    const packets = createPacketManager();

    const result = packets.accept(
      createPacket({ sessionId: THEIRS, fileId: FILE, index: 0, payload: Uint8Array.from([1]) }),
      { sessionId: OURS, integrityVerified: true },
    );

    expect(result.outcome).toBe(AcceptOutcome.Rejected);
    expect(result.validation.rejections).toContain(PacketProtocolRejection.ForeignSession);
    expect(packets.storedCount(OURS, FILE)).toBe(0);
  });

  it('refuses a foreign packet at the wire layer too', () => {
    // Two independent gates: the binary layer checks the header's session id,
    // and the protocol layer checks the packet's. Either alone would be enough
    // until someone bypasses that layer.
    const parsed = deserializePacket(serialized(0, 32, THEIRS), { expectedSessionId: OURS });

    expect(parsed.validation.rejections).toContain(PacketRejection.ForeignSession);
  });

  it('keeps two concurrent sessions’ packets entirely separate', () => {
    const packets = createPacketManager();

    packets.accept(
      createPacket({ sessionId: OURS, fileId: FILE, index: 0, payload: Uint8Array.from([1]) }),
      { sessionId: OURS, integrityVerified: true },
    );
    packets.accept(
      createPacket({ sessionId: THEIRS, fileId: FILE, index: 0, payload: Uint8Array.from([2]) }),
      { sessionId: THEIRS, integrityVerified: true },
    );

    // Same file id, same index, different sessions: neither may see the other.
    expect(packets.storedCount(OURS, FILE)).toBe(1);
    expect(packets.storedCount(THEIRS, FILE)).toBe(1);
    expect(packets.orderedPackets(OURS, FILE)[0]?.payload[0]).toBe(1);
    expect(packets.orderedPackets(THEIRS, FILE)[0]?.payload[0]).toBe(2);
  });

  it('releasing one session leaves the other intact (§11.19)', () => {
    const packets = createPacketManager();

    for (const session of [OURS, THEIRS]) {
      packets.accept(
        createPacket({ sessionId: session, fileId: FILE, index: 0, payload: Uint8Array.from([1]) }),
        { sessionId: session, integrityVerified: true },
      );
    }

    packets.releaseSession(OURS);

    expect(packets.storedCount(OURS, FILE)).toBe(0);
    expect(packets.storedCount(THEIRS, FILE)).toBe(1);
  });
});

describe('replay protection (§8)', () => {
  it('ignores a replayed packet without overwriting the original (§11.13)', () => {
    const packets = createPacketManager();
    const original = createPacket({
      sessionId: OURS,
      fileId: FILE,
      index: 0,
      payload: Uint8Array.from([1, 1, 1]),
    });

    expect(packets.accept(original, { sessionId: OURS, integrityVerified: true }).outcome).toBe(
      AcceptOutcome.Stored,
    );

    // The same position replayed with *different* content. If a replay could
    // overwrite, an attacker who captured one frame could substitute bytes into
    // a file that still passed every structural check.
    const replayed = createPacket({
      sessionId: OURS,
      fileId: FILE,
      index: 0,
      payload: Uint8Array.from([9, 9, 9]),
    });

    expect(packets.accept(replayed, { sessionId: OURS, integrityVerified: true }).outcome).toBe(
      AcceptOutcome.Duplicate,
    );

    expect(packets.orderedPackets(OURS, FILE)[0]?.payload[0]).toBe(1);
    expect(packets.storedCount(OURS, FILE)).toBe(1);
  });

  it('reports a replay as a duplicate, distinct from a rejection', () => {
    // The two must stay distinguishable: a duplicate is expected under §11.11
    // looping, while a rejection means something was wrong. Collapsing them
    // would make a receiver unable to tell repetition from attack.
    const packets = createPacketManager();
    const packet = createPacket({
      sessionId: OURS,
      fileId: FILE,
      index: 0,
      payload: Uint8Array.from([1]),
    });

    packets.accept(packet, { sessionId: OURS, integrityVerified: true });

    const again = packets.accept(packet, { sessionId: OURS, integrityVerified: true });

    expect(again.outcome).toBe(AcceptOutcome.Duplicate);
    expect(again.validation.valid).toBe(true);
    expect(again.validation.rejections).toHaveLength(0);
  });

  it('survives an entire transfer replayed from an earlier session', async () => {
    // The realistic attack: a whole sequence captured off one screen and shown
    // to a receiver collecting for a different session.
    const victim = createHarness({ packetSize: 128, idPrefix: '0a000000' });
    const attacker = createHarness({ packetSize: 128, idPrefix: '0b000000' });

    const content = Uint8Array.from({ length: 600 }, (_u, i) => i & 0xff);

    victim.graph.send.addFiles([{ name: 'mine.bin', content }]);
    victim.graph.send.prepare();
    attacker.graph.send.addFiles([{ name: 'theirs.bin', content }]);
    attacker.graph.send.prepare();

    const mine = victim.graph.send.prepared()!;
    const theirs = attacker.graph.send.prepared()!;

    victim.graph.send.start();
    await victim.graph.receive.start(mine.sessionId);

    for (const frame of theirs.frames) {
      victim.camera.push(captureOf(frame));
    }
    victim.camera.emitAll();

    const state = victim.graph.receive.state.getState();

    // Every replayed frame was seen and decoded, and not one was accepted.
    expect(state.framesSeen).toBe(theirs.frames.length);
    expect(state.collectedPackets).toBe(0);
    expect(victim.graph.receive.finish()).toHaveLength(0);
  });

  it('a replayed frame decodes but does not survive validation', () => {
    // Proof that the refusal above is a protocol decision, not an accident of
    // the frames being unreadable.
    const harness = createHarness({ packetSize: 128, idPrefix: '0c000000' });
    harness.graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from([1, 2, 3, 4]) }]);
    harness.graph.send.prepare();

    const frame = harness.graph.send.prepared()!.frames[0]!;
    const decoded = createQrDecoder().decode(captureOf(frame));

    expect(decoded.ok).toBe(true);

    if (decoded.ok) {
      const parsed = deserializePacket(decoded.payload, { expectedSessionId: THEIRS });
      expect(parsed.validation.valid).toBe(false);
    }
  });
});

describe('integrity verification (§8)', () => {
  const stream = Uint8Array.from([1, 2, 3, 4, 5]);

  const verifier: IntegrityVerifier = {
    algorithm: 'TEST-DIGEST',
    digest: (bytes) => Uint8Array.from([bytes.length & 0xff, bytes[0] ?? 0]),
    verify: () => true,
  };

  it('passes when the digest and size match', () => {
    const result = verifyFile({
      stream,
      expectedHash: '0501',
      expectedSize: stream.byteLength,
      algorithm: verifier.algorithm,
      verifier,
    });

    expect(result.verified).toBe(true);
  });

  it('fails when the content changed', () => {
    const result = verifyFile({
      stream: Uint8Array.from([9, 2, 3, 4, 5]),
      expectedHash: '0501',
      expectedSize: stream.byteLength,
      algorithm: verifier.algorithm,
      verifier,
    });

    expect(result.verified).toBe(false);
  });

  it('reports an unsupported algorithm as unverified, never as verified', () => {
    // The property that keeps the SHA-256 gap safe. "Verification was skipped"
    // and "verification passed" must never be the same value (A11-04): a
    // receiver told SHA-256 by a manifest must refuse rather than accept a
    // weaker check silently.
    const result = verifyFile({
      stream,
      expectedHash: '0501',
      expectedSize: stream.byteLength,
      algorithm: 'SHA-256',
      verifier,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

/*
 * §8 items not verifiable in this build, and why:
 *
 * - **SHA-256 verification.** PROTOCOL_SPEC §20 owns integrity algorithms and
 *   is unread; the build ships `PHOTON-PLACEHOLDER-32` (A12-04), which names
 *   itself precisely so it cannot be mistaken for a cryptographic digest. What
 *   is tested above is that an unsupported algorithm fails closed.
 * - **Encryption.** §19 is unread and no encryption exists. The Send and
 *   Settings screens report it as unavailable rather than offering a toggle
 *   that does nothing.
 *
 * Both become testable in the security phase. Until then, recording them as
 * untested is the honest reading of §15.7 — a suite that pretended otherwise
 * would be worse than the gap it hid.
 */
