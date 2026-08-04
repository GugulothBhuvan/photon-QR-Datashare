/**
 * Packet map, file builder and integrity check (REC-001…REC-005) —
 * PROTOCOL_SPEC §13.11–§13.17, §3.24.
 */
import { AppError } from '@core/errors';
import type { IntegrityVerifier } from '@core/contracts';
import { buildFile, BuildFailure } from '@core/reconstruction/fileBuilder';
import { createPacketMap, PacketState } from '@core/reconstruction/packetMap';
import { IntegrityFailure, verifyFile } from '@core/reconstruction/integrityChecker';
import { fileId, sessionId } from '@domain/ids';
import { createPacket } from '@domain/packet';
import { bytesToHex } from '@utils/hex';

const SESSION = sessionId('11111111-1111-4111-8111-111111111111');
const OTHER_SESSION = sessionId('22222222-2222-4222-8222-222222222222');
const FILE = fileId('f1000000-0000-4000-8000-000000000001');
const OTHER_FILE = fileId('f1000000-0000-4000-8000-000000000002');

const packetAt = (index: number, bytes: readonly number[], file = FILE, session = SESSION) =>
  createPacket({
    sessionId: session,
    fileId: file,
    index,
    payload: Uint8Array.from(bytes),
  });

describe('packet map (§13.16)', () => {
  it('starts with every index missing', () => {
    const map = createPacketMap(4);

    expect(map.missing()).toEqual([0, 1, 2, 3]);
    expect(map.isComplete()).toBe(false);
  });

  it('records a received packet', () => {
    const map = createPacketMap(3);

    expect(map.markReceived(1)).toBe(true);
    expect(map.entry(1).state).toBe(PacketState.Received);
    expect(map.has(1)).toBe(true);
  });

  it('distinguishes a recovered packet from a received one (§13.16)', () => {
    const map = createPacketMap(2);

    map.markReceived(0);
    map.markRecovered(1);

    expect(map.entry(0).state).toBe(PacketState.Received);
    expect(map.entry(1).state).toBe(PacketState.Recovered);
  });

  it('counts duplicates without changing the state (§11.13)', () => {
    const map = createPacketMap(2);

    map.markReceived(0);
    expect(map.markReceived(0)).toBe(false);
    expect(map.markReceived(0)).toBe(false);

    expect(map.entry(0).state).toBe(PacketState.Received);
    expect(map.entry(0).duplicates).toBe(2);
  });

  it('counts corrupted copies without receiving the index (§3.27)', () => {
    const map = createPacketMap(2);

    map.markCorrupted(0);
    map.markCorrupted(0);

    // A corrupted copy is not a packet; the index is still missing.
    expect(map.entry(0).state).toBe(PacketState.Missing);
    expect(map.entry(0).corrupted).toBe(2);
    expect(map.missing()).toContain(0);
  });

  it('keeps a corrupted count after a good copy arrives', () => {
    const map = createPacketMap(2);

    map.markCorrupted(0);
    map.markReceived(0);

    // The diagnostic survives: this index took two attempts.
    expect(map.entry(0).state).toBe(PacketState.Received);
    expect(map.entry(0).corrupted).toBe(1);
  });

  it('a corrupted copy arriving after a good one does not un-receive it', () => {
    const map = createPacketMap(2);

    map.markReceived(0);
    map.markCorrupted(0);

    expect(map.entry(0).state).toBe(PacketState.Received);
    expect(map.has(0)).toBe(true);
  });

  it('reports missing and present in ascending order regardless of arrival (§13.12)', () => {
    const map = createPacketMap(5);

    for (const index of [3, 0, 4]) {
      map.markReceived(index);
    }

    expect(map.present()).toEqual([0, 3, 4]);
    expect(map.missing()).toEqual([1, 2]);
  });

  it('is complete once every index holds a valid copy (§13.11)', () => {
    const map = createPacketMap(3);

    map.markReceived(0);
    map.markRecovered(1);
    map.markReceived(2);

    expect(map.isComplete()).toBe(true);
    expect(map.missing()).toEqual([]);
  });

  it('treats a zero-packet file as complete', () => {
    // An empty file is still a file (§3.8).
    expect(createPacketMap(0).isComplete()).toBe(true);
  });

  it.each([-1, 3, 4, 1.5])('rejects an index of %p (§13.17)', (index) => {
    const map = createPacketMap(3);

    expect(() => map.markReceived(index)).toThrow(AppError);
  });

  it('rejects a negative expected count', () => {
    expect(() => createPacketMap(-1)).toThrow(AppError);
  });

  it('summarises the whole file', () => {
    const map = createPacketMap(4);

    map.markReceived(0);
    map.markReceived(0);
    map.markRecovered(2);
    map.markCorrupted(1);

    expect(map.snapshot()).toEqual({
      expectedPackets: 4,
      received: 1,
      recovered: 1,
      missing: [1, 3],
      duplicates: 1,
      corrupted: 1,
      complete: false,
    });
  });

  it('freezes its snapshots and entries', () => {
    const map = createPacketMap(2);
    map.markReceived(0);

    expect(Object.isFrozen(map.snapshot())).toBe(true);
    expect(Object.isFrozen(map.entry(0))).toBe(true);
  });
});

describe('file builder (§13.11, §13.12)', () => {
  const packets = [packetAt(0, [1, 2]), packetAt(1, [3, 4]), packetAt(2, [5, 6])];

  it('reassembles the stream in ascending index order', () => {
    const result = buildFile(packets, { expectedPackets: 3 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.from(result.stream)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('sorts by index itself rather than trusting the caller (§13.12)', () => {
    // Arrival order, decode order and storage order must not matter.
    const shuffled = [packets[2]!, packets[0]!, packets[1]!];
    const result = buildFile(shuffled, { expectedPackets: 3 });

    expect(result.ok && Array.from(result.stream)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('gives the same file for every permutation of arrival', () => {
    const permutations = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];

    const outputs = permutations.map((order) => {
      const result = buildFile(
        order.map((i) => packets[i]!),
        { expectedPackets: 3 },
      );
      return result.ok ? Array.from(result.stream) : null;
    });

    for (const output of outputs) {
      expect(output).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('refuses an incomplete set and names what is missing (§13.11)', () => {
    const result = buildFile([packets[0]!, packets[2]!], { expectedPackets: 3 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(BuildFailure.Incomplete);
      expect(result.missing).toEqual([1]);
    }
  });

  it('accepts an identical duplicate, which is expected (§11.13)', () => {
    const result = buildFile([...packets, packetAt(1, [3, 4])], { expectedPackets: 3 });

    expect(result.ok && Array.from(result.stream)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('refuses a duplicate index with different contents (§13.17)', () => {
    const result = buildFile([...packets, packetAt(1, [9, 9])], { expectedPackets: 3 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(BuildFailure.ConflictingIndex);
    }
  });

  it('refuses an index beyond the declared count (§13.17)', () => {
    const result = buildFile([...packets, packetAt(9, [0])], { expectedPackets: 3 });

    expect(result.ok && 'reason' in result).toBe(false);
    expect((result as { reason: string }).reason).toBe(BuildFailure.IndexOutOfRange);
  });

  it('refuses packets from two files, whose indices share a space (§13.13)', () => {
    const result = buildFile([packets[0]!, packetAt(1, [7, 7], OTHER_FILE)], {
      expectedPackets: 2,
    });

    expect((result as { reason: string }).reason).toBe(BuildFailure.MixedFiles);
  });

  it('refuses packets from two sessions (§8.11)', () => {
    const result = buildFile([packets[0]!, packetAt(1, [7, 7], FILE, OTHER_SESSION)], {
      expectedPackets: 2,
    });

    expect((result as { reason: string }).reason).toBe(BuildFailure.MixedSessions);
  });

  it('builds an empty file from no packets', () => {
    const result = buildFile([], { expectedPackets: 0 });

    expect(result.ok && result.stream).toHaveLength(0);
  });

  it('handles a short final packet (§11.9)', () => {
    const result = buildFile([packetAt(0, [1, 2, 3, 4]), packetAt(1, [5])], {
      expectedPackets: 2,
    });

    expect(result.ok && Array.from(result.stream)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('integrity check (§3.24)', () => {
  /** A deterministic stand-in for the real digest, which Phase 11 supplies. */
  function fakeVerifier(algorithm = 'SHA-256'): IntegrityVerifier {
    return {
      algorithm,
      digest: (bytes) => {
        // A trivially weak but perfectly deterministic 4-byte fingerprint.
        let a = 7;
        let b = 11;
        for (const byte of bytes) {
          a = (a * 31 + byte) & 0xff;
          b = (b + a) & 0xff;
        }
        return Uint8Array.from([a, b, bytes.length & 0xff, (bytes.length >> 8) & 0xff]);
      },
      verify: (bytes, expected) =>
        bytesToHex(fakeVerifier(algorithm).digest(bytes)) === bytesToHex(expected),
    };
  }

  const verifier = fakeVerifier();
  const stream = Uint8Array.from([1, 2, 3, 4, 5]);
  const goodHash = bytesToHex(verifier.digest(stream));

  it('verifies a matching stream', () => {
    const result = verifyFile({
      stream,
      expectedHash: goodHash,
      expectedSize: 5,
      algorithm: 'SHA-256',
      verifier,
    });

    expect(result.verified).toBe(true);
    expect(result.actualHash).toBe(goodHash);
  });

  it('rejects a stream whose digest differs (§3.24)', () => {
    const result = verifyFile({
      stream: Uint8Array.from([1, 2, 3, 4, 6]),
      expectedHash: goodHash,
      algorithm: 'SHA-256',
      verifier,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe(IntegrityFailure.HashMismatch);
  });

  it('rejects a size mismatch before hashing, which localises the fault', () => {
    const result = verifyFile({
      stream,
      expectedHash: goodHash,
      expectedSize: 6,
      algorithm: 'SHA-256',
      verifier,
    });

    expect(result.reason).toBe(IntegrityFailure.SizeMismatch);
  });

  it('refuses an algorithm the verifier cannot perform (§10.7.7)', () => {
    // "Verification was skipped" must never read as "verification passed".
    const result = verifyFile({
      stream,
      expectedHash: goodHash,
      algorithm: 'SHA-512',
      verifier,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe(IntegrityFailure.AlgorithmUnsupported);
  });

  it('compares hashes case-insensitively', () => {
    const result = verifyFile({
      stream,
      expectedHash: goodHash.toUpperCase(),
      algorithm: 'SHA-256',
      verifier,
    });

    expect(result.verified).toBe(true);
  });

  it('verifies an empty file', () => {
    const empty = new Uint8Array();
    const result = verifyFile({
      stream: empty,
      expectedHash: bytesToHex(verifier.digest(empty)),
      expectedSize: 0,
      algorithm: 'SHA-256',
      verifier,
    });

    expect(result.verified).toBe(true);
  });
});

describe('bytesToHex', () => {
  it('encodes bytes as lowercase hex, padded', () => {
    expect(bytesToHex(Uint8Array.from([0, 15, 16, 255]))).toBe('000f10ff');
  });

  it('encodes an empty array as an empty string', () => {
    expect(bytesToHex(new Uint8Array())).toBe('');
  });
});
