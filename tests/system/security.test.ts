/**
 * Security validation (TST-003) — TEST_SPEC §8, §12, invariant §15.7.
 *
 * §8 lists six areas: CRC validation, SHA-256 verification, encryption, session
 * isolation, replay protection and invalid packet rejection. §12 makes "no
 * critical security failures" a release gate, and §15.7 requires security
 * validation to execute automatically — which is why these are a named suite
 * rather than assertions scattered through other files.
 *
 * **Five of the six are implemented and tested here.** Encryption is the
 * exception: §19.1 makes it optional and SI-012 records why it cannot be
 * implemented interoperably. What is tested instead is the refusal — a build
 * that cannot decrypt must say so rather than hand back ciphertext.
 *
 * Everything below runs against the real packet layer and the production
 * SHA-256 verifier, not a model of either.
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
import { createSha256Verifier } from '@security/integrity';
import { bytesToHex } from '@utils/hex';
import { createPacket } from '@domain/packet';
import { fileId, sessionId } from '@domain/ids';

import { createAppGraph, createMemorySettingsRepository } from '@config/appComposition';
import { createMemoryCamera } from '@camera/memoryCamera';

import { captureOf, createHarness, fixedClock, sequentialIds } from '../support/opticalHarness';

const PACKET_SIZE = 128;

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
    expect(state.framesSeen).toBe(theirs.frames.count);
    expect(state.collectedPackets).toBe(0);
    expect(victim.graph.receive.finish()).toHaveLength(0);
  });

  it('a replayed frame decodes but does not survive validation', () => {
    // Proof that the refusal above is a protocol decision, not an accident of
    // the frames being unreadable.
    const harness = createHarness({ packetSize: 128, idPrefix: '0c000000' });
    harness.graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from([1, 2, 3, 4]) }]);
    harness.graph.send.prepare();

    const frame = harness.graph.send.prepared()!.frames.at(0)!;
    const decoded = createQrDecoder().decode(captureOf(frame));

    expect(decoded.ok).toBe(true);

    if (decoded.ok) {
      const parsed = deserializePacket(decoded.payload, { expectedSessionId: THEIRS });
      expect(parsed.validation.valid).toBe(false);
    }
  });
});

describe('integrity verification (§8, §20)', () => {
  const stream = Uint8Array.from([1, 2, 3, 4, 5]);
  const verifier = createSha256Verifier();

  it('is SHA-256, as SECURITY.md §6 requires', () => {
    expect(verifier.algorithm).toBe('SHA-256');
  });

  it('passes when the digest and size match (§20.6)', () => {
    expect(
      verifyFile({
        stream,
        expectedHash: bytesToHex(verifier.digest(stream)),
        expectedSize: stream.byteLength,
        algorithm: verifier.algorithm,
        verifier,
      }).verified,
    ).toBe(true);
  });

  it('fails when one byte of the content changed (§20.10)', () => {
    expect(
      verifyFile({
        stream: Uint8Array.from([9, 2, 3, 4, 5]),
        expectedHash: bytesToHex(verifier.digest(stream)),
        expectedSize: stream.byteLength,
        algorithm: verifier.algorithm,
        verifier,
      }).verified,
    ).toBe(false);
  });

  it('reports an unsupported algorithm as unverified, never as verified', () => {
    // §20.17.4: a transfer SHALL NOT complete unless verification succeeds.
    // "Verification was skipped" and "verification passed" must never be the
    // same value (A11-04) — a receiver told SHA-512 must refuse rather than
    // silently accept a weaker check.
    const result = verifyFile({
      stream,
      expectedHash: bytesToHex(verifier.digest(stream)),
      expectedSize: stream.byteLength,
      algorithm: 'SHA-512',
      verifier,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('verifies a real transfer against a real SHA-256 digest, end to end', async () => {
    // §20.17.10: successful verification guarantees the reconstructed file is
    // byte-for-byte the original. This is the only place that claim is checked
    // against the production digest through the whole pipeline.
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const content = Uint8Array.from({ length: 700 }, (_unused, index) => (index * 31) & 0xff);

    const outcome = await harness.run([{ name: 'verified.bin', content }]);

    expect(outcome.files).toHaveLength(1);
    expect(outcome.files[0]?.integrity.verified).toBe(true);
    expect(harness.graph.integrityAlgorithm).toBe('SHA-256');
    // The manifest records the digest the receiver recomputed (§20.8).
    expect(outcome.files[0]?.integrity.actualHash).toBe(bytesToHex(verifier.digest(content)));
  });
});

describe('confidentiality (§19)', () => {
  it('performs no encryption, and says so in the manifest (§19.8)', () => {
    // Encryption is optional (§19.1). What must never happen is a build that
    // claims encryption it does not perform, so the manifest records NONE.
    const harness = createHarness({ packetSize: PACKET_SIZE });
    harness.graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from([1, 2, 3, 4]) }]);
    harness.graph.send.prepare();

    for (const entry of harness.graph.send.prepared()!.manifest.entries) {
      expect(entry.encryption).toBe('NONE');
    }
  });

  it('leaves protocol metadata readable, as §19.5 requires', () => {
    // §19.5 keeps session id, packet type, packet index and file id in the
    // clear so a receiver can route and validate without decrypting. With no
    // encryption this is trivially true — the test exists so that enabling
    // encryption later cannot quietly break it.
    const harness = createHarness({ packetSize: PACKET_SIZE });
    harness.graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from([1, 2, 3, 4]) }]);
    harness.graph.send.prepare();

    const prepared = harness.graph.send.prepared()!;
    const decoded = createQrDecoder().decode(captureOf(prepared.frames.at(2)!));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }

    const parsed = deserializePacket(decoded.payload, { expectedSessionId: prepared.sessionId });

    expect(parsed.ok).toBe(true);
    expect(parsed.validation.valid).toBe(true);
  });
  it('refuses a transfer configured for an algorithm it cannot perform (§19.14)', async () => {
    // The safety property that matters while no cipher exists: a build asked
    // for encryption must fail rather than transmit plain text under a manifest
    // that claims otherwise.
    const graph = createAppGraph({
      clock: fixedClock,
      idGenerator: sequentialIds('0e000000'),
      camera: createMemoryCamera(),
      settingsRepository: createMemorySettingsRepository(),
      encryptionAlgorithm: 'AES-256-GCM',
    });

    graph.send.addFiles([{ name: 'secret.bin', content: Uint8Array.from([1, 2, 3, 4]) }]);
    graph.send.prepare();

    // Preparation fails, and it fails loudly rather than producing frames.
    expect(graph.send.prepared()).toBeUndefined();
    expect(graph.send.state.getState().stage).toBe('FAILED');
    expect(graph.send.state.getState().errorMessage).toBeTruthy();
  });
});

/*
 * §8 items not verifiable in this build, and why:
 *
 * - **Encryption.** §19 makes it optional and this build performs none, because
 *   §19.7 and SECURITY.md §8 defer key exchange to each other and neither
 *   defines one (SI-012). What is tested is the seam and the refusal: the
 *   manifest records NONE, and a manifest naming an algorithm this build cannot
 *   perform is rejected rather than treated as plain text.
 * - **Authenticity.** An unkeyed SHA-256 proves the bytes match the manifest,
 *   not who wrote the manifest (A14-02). Authenticity needs §19.10
 *   authentication, which needs the keys SI-012 blocks.
 *
 * SHA-256 verification **is** now tested — see `tests/unit/sha256.test.ts` for
 * the algorithm against FIPS 180-4's published vectors, and above for its use
 * through the whole pipeline.
 */
