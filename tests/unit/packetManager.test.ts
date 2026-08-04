/**
 * PacketManager (PRO-003) — PROTOCOL_SPEC §11; docs/API_SPEC.md §7.
 */
import {
  AcceptOutcome,
  createPacketManager,
  PacketProtocolRejection,
} from '@core/packet/packetManager';
import { createPacketRegistry, NO_FILE } from '@core/registry/packetRegistry';
import { fileId, sessionId } from '@domain/ids';
import { createPacket, PacketType } from '@domain/packet';

const SESSION = sessionId('11111111-1111-4111-8111-111111111111');
const OTHER_SESSION = sessionId('22222222-2222-4222-8222-222222222222');
const FILE_A = fileId('f1000000-0000-4000-8000-000000000001');
const FILE_B = fileId('f1000000-0000-4000-8000-000000000002');

const payload = (fill: number, length = 4): Uint8Array => new Uint8Array(length).fill(fill);

const dataPacket = (index: number, file = FILE_A, fill = index) =>
  createPacket({ sessionId: SESSION, fileId: file, index, payload: payload(fill) });

/** Expectations that pass, so each test varies one thing. */
const passing = { sessionId: SESSION, integrityVerified: true };

describe('packetize (§11.2, §11.9, API_SPEC §7)', () => {
  const manager = createPacketManager();

  const stream = Uint8Array.from({ length: 10 }, (_unused, index) => index);

  it('divides a stream into packets of the negotiated size', () => {
    const packets = manager.packetize({
      sessionId: SESSION,
      fileId: FILE_A,
      stream,
      packetSize: 4,
    });

    expect(packets).toHaveLength(3);
    expect(packets[0]?.size).toBe(4);
    expect(packets[1]?.size).toBe(4);
  });

  it('lets the final packet be shorter (§11.9)', () => {
    const packets = manager.packetize({
      sessionId: SESSION,
      fileId: FILE_A,
      stream,
      packetSize: 4,
    });

    expect(packets[2]?.size).toBe(2);
  });

  it('assigns contiguous zero-based indices (§11.10)', () => {
    const packets = manager.packetize({
      sessionId: SESSION,
      fileId: FILE_A,
      stream,
      packetSize: 4,
    });

    expect(packets.map((packet) => packet.index)).toEqual([0, 1, 2]);
  });

  it('preserves the stream byte for byte (§11.8, §3.9)', () => {
    const packets = manager.packetize({
      sessionId: SESSION,
      fileId: FILE_A,
      stream,
      packetSize: 4,
    });

    const rejoined = packets.flatMap((packet) => Array.from(packet.payload));

    expect(rejoined).toEqual(Array.from(stream));
  });

  it('produces no packets for an empty stream', () => {
    expect(
      manager.packetize({
        sessionId: SESSION,
        fileId: FILE_A,
        stream: new Uint8Array(),
        packetSize: 4,
      }),
    ).toHaveLength(0);
  });

  it('produces one packet when the stream is exactly one packet long', () => {
    const packets = manager.packetize({
      sessionId: SESSION,
      fileId: FILE_A,
      stream: new Uint8Array(4),
      packetSize: 4,
    });

    expect(packets).toHaveLength(1);
    expect(packets[0]?.size).toBe(4);
  });

  it('gives every packet the same session and file (§11.5)', () => {
    const packets = manager.packetize({
      sessionId: SESSION,
      fileId: FILE_A,
      stream,
      packetSize: 4,
    });

    expect(packets.every((packet) => packet.sessionId === SESSION)).toBe(true);
    expect(packets.every((packet) => packet.fileId === FILE_A)).toBe(true);
  });

  it('produces immutable packets (§11.6, §11.16)', () => {
    const packets = manager.packetize({
      sessionId: SESSION,
      fileId: FILE_A,
      stream,
      packetSize: 4,
    });

    expect(Object.isFrozen(packets[0])).toBe(true);
  });

  it('does not alias the source stream (§11.16: payload bytes are never modified)', () => {
    const mutable = Uint8Array.from([1, 2, 3, 4]);
    const packets = manager.packetize({
      sessionId: SESSION,
      fileId: FILE_A,
      stream: mutable,
      packetSize: 4,
    });

    mutable[0] = 255;

    expect(packets[0]?.payload[0]).toBe(1);
  });

  it('is deterministic', () => {
    const first = manager.packetize({ sessionId: SESSION, fileId: FILE_A, stream, packetSize: 4 });
    const second = manager.packetize({ sessionId: SESSION, fileId: FILE_A, stream, packetSize: 4 });

    expect(first).toEqual(second);
  });

  it.each([0, -1, 1.5])('rejects a packet size of %p', (packetSize) => {
    expect(() =>
      manager.packetize({ sessionId: SESSION, fileId: FILE_A, stream, packetSize }),
    ).toThrow();
  });
});

describe('validatePacket (§11.12)', () => {
  const manager = createPacketManager();

  it('accepts a well-formed packet', () => {
    expect(manager.validatePacket(dataPacket(0), passing).valid).toBe(true);
  });

  it('rejects a packet from another session (§11.5, §8.11)', () => {
    const foreign = createPacket({
      sessionId: OTHER_SESSION,
      fileId: FILE_A,
      index: 0,
      payload: payload(1),
    });

    expect(manager.validatePacket(foreign, passing).rejections).toContain(
      PacketProtocolRejection.ForeignSession,
    );
  });

  it('rejects a packet whose integrity did not verify (§11.12.5)', () => {
    const result = manager.validatePacket(dataPacket(0), { ...passing, integrityVerified: false });

    expect(result.rejections).toContain(PacketProtocolRejection.IntegrityFailed);
  });

  it('rejects a payload longer than the negotiated size (§11.9)', () => {
    const result = manager.validatePacket(dataPacket(0), { ...passing, packetSize: 2 });

    expect(result.rejections).toContain(PacketProtocolRejection.BadPayloadLength);
  });

  it('allows a shorter payload, since the final packet may be short (§11.9)', () => {
    const short = createPacket({
      sessionId: SESSION,
      fileId: FILE_A,
      index: 0,
      payload: payload(1, 2),
    });

    expect(manager.validatePacket(short, { ...passing, packetSize: 4 }).valid).toBe(true);
  });

  it('rejects an index beyond what the manifest declares (§11.14)', () => {
    const result = manager.validatePacket(dataPacket(5), {
      ...passing,
      expectedCounts: { [FILE_A]: 3 },
    });

    expect(result.rejections).toContain(PacketProtocolRejection.BadPacketIndex);
  });

  it('accepts the last declared index', () => {
    expect(
      manager.validatePacket(dataPacket(2), { ...passing, expectedCounts: { [FILE_A]: 3 } }).valid,
    ).toBe(true);
  });

  it('rejects a packet for a file the manifest does not describe (§11.14)', () => {
    const result = manager.validatePacket(dataPacket(0, FILE_B), {
      ...passing,
      expectedCounts: { [FILE_A]: 3 },
    });

    expect(result.rejections).toContain(PacketProtocolRejection.UnknownFile);
  });

  it('accepts a manifest packet, which belongs to no file (§10.1)', () => {
    const manifestPacket = createPacket({
      sessionId: SESSION,
      index: 0,
      payload: payload(1),
      type: PacketType.Manifest,
    });

    expect(manager.validatePacket(manifestPacket, passing).valid).toBe(true);
  });

  it('reports every failure, not just the first', () => {
    const foreign = createPacket({
      sessionId: OTHER_SESSION,
      fileId: FILE_A,
      index: 9,
      payload: payload(1),
    });

    const result = manager.validatePacket(foreign, {
      sessionId: SESSION,
      integrityVerified: false,
      expectedCounts: { [FILE_A]: 3 },
    });

    expect(result.rejections).toEqual(
      expect.arrayContaining([
        PacketProtocolRejection.ForeignSession,
        PacketProtocolRejection.IntegrityFailed,
        PacketProtocolRejection.BadPacketIndex,
      ]),
    );
  });
});

describe('accept (§11.12, §11.13, §11.15)', () => {
  it('stores the first valid copy (§11.12.8)', () => {
    const manager = createPacketManager();
    const result = manager.accept(dataPacket(0), passing);

    expect(result.outcome).toBe(AcceptOutcome.Stored);
    expect(manager.storedCount(SESSION, FILE_A)).toBe(1);
  });

  it('ignores a duplicate after the first valid copy (§11.13)', () => {
    const manager = createPacketManager();

    manager.accept(dataPacket(0), passing);
    const second = manager.accept(dataPacket(0), passing);

    expect(second.outcome).toBe(AcceptOutcome.Duplicate);
    expect(manager.storedCount(SESSION, FILE_A)).toBe(1);
  });

  it('never lets a duplicate overwrite the stored packet (§11.13, §11.20.7)', () => {
    const manager = createPacketManager();
    const original = dataPacket(0, FILE_A, 1);
    const impostor = dataPacket(0, FILE_A, 9);

    manager.accept(original, passing);
    manager.accept(impostor, passing);

    expect(manager.orderedPackets(SESSION, FILE_A)[0]?.payload[0]).toBe(1);
  });

  it('discards a corrupted packet without storing it (§11.15, §11.20.8)', () => {
    const manager = createPacketManager();
    const result = manager.accept(dataPacket(0), { ...passing, integrityVerified: false });

    expect(result.outcome).toBe(AcceptOutcome.Rejected);
    expect(manager.storedCount(SESSION, FILE_A)).toBe(0);
  });

  it('discards a foreign packet without storing it (§8.11)', () => {
    const manager = createPacketManager();
    const foreign = createPacket({
      sessionId: OTHER_SESSION,
      fileId: FILE_A,
      index: 0,
      payload: payload(1),
    });

    manager.accept(foreign, passing);

    expect(manager.storedCount(OTHER_SESSION, FILE_A)).toBe(0);
  });

  it('reports the reasons alongside the outcome', () => {
    const manager = createPacketManager();
    const result = manager.accept(dataPacket(0), { ...passing, integrityVerified: false });

    expect(result.validation.rejections).toContain(PacketProtocolRejection.IntegrityFailed);
  });

  it('reports whether a position is already filled', () => {
    const manager = createPacketManager();

    expect(manager.isDuplicate(dataPacket(0))).toBe(false);

    manager.accept(dataPacket(0), passing);

    expect(manager.isDuplicate(dataPacket(0))).toBe(true);
  });
});

describe('ordering (§11.10, §11.18)', () => {
  it('orders stored packets by index regardless of arrival order', () => {
    const manager = createPacketManager();

    // Arrive out of order, as an optical link would deliver them.
    for (const index of [3, 0, 2, 1]) {
      manager.accept(dataPacket(index), passing);
    }

    expect(manager.orderedPackets(SESSION, FILE_A).map((packet) => packet.index)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('reports stored indices ascending', () => {
    const manager = createPacketManager();

    for (const index of [5, 1, 3]) {
      manager.accept(dataPacket(index), passing);
    }

    expect(manager.storedIndices(SESSION, FILE_A)).toEqual([1, 3, 5]);
  });

  it('keeps files independent (§11.5)', () => {
    const manager = createPacketManager();

    manager.accept(dataPacket(0, FILE_A), passing);
    manager.accept(dataPacket(0, FILE_B), passing);

    expect(manager.storedCount(SESSION, FILE_A)).toBe(1);
    expect(manager.storedCount(SESSION, FILE_B)).toBe(1);
  });

  it('keeps sessions independent (§8.12)', () => {
    const manager = createPacketManager();
    const other = createPacket({
      sessionId: OTHER_SESSION,
      fileId: FILE_A,
      index: 0,
      payload: payload(1),
    });

    manager.accept(dataPacket(0), passing);
    manager.accept(other, { sessionId: OTHER_SESSION, integrityVerified: true });

    expect(manager.storedCount(SESSION, FILE_A)).toBe(1);
    expect(manager.storedCount(OTHER_SESSION, FILE_A)).toBe(1);
  });
});

describe('missing packets (§11.14)', () => {
  it('reports the gaps against the manifest count', () => {
    const manager = createPacketManager();

    manager.accept(dataPacket(0), passing);
    manager.accept(dataPacket(2), passing);

    expect(manager.missingIndices(SESSION, FILE_A, 4)).toEqual([1, 3]);
  });

  it('reports every index missing when nothing has arrived', () => {
    const manager = createPacketManager();

    expect(manager.missingIndices(SESSION, FILE_A, 3)).toEqual([0, 1, 2]);
  });

  it('reports none missing once the file is complete', () => {
    const manager = createPacketManager();

    for (const index of [0, 1, 2]) {
      manager.accept(dataPacket(index), passing);
    }

    expect(manager.missingIndices(SESSION, FILE_A, 3)).toEqual([]);
    expect(manager.isFileComplete(SESSION, FILE_A, 3)).toBe(true);
  });

  it('is incomplete while any declared packet is unvalidated (§11.14)', () => {
    const manager = createPacketManager();

    manager.accept(dataPacket(0), passing);

    expect(manager.isFileComplete(SESSION, FILE_A, 3)).toBe(false);
  });

  it('treats a file declaring zero packets as complete', () => {
    const manager = createPacketManager();

    expect(manager.isFileComplete(SESSION, FILE_A, 0)).toBe(true);
  });

  it('does not count a rejected packet towards completeness (§11.15)', () => {
    const manager = createPacketManager();

    manager.accept(dataPacket(0), passing);
    manager.accept(dataPacket(1), { ...passing, integrityVerified: false });

    expect(manager.isFileComplete(SESSION, FILE_A, 2)).toBe(false);
    expect(manager.missingIndices(SESSION, FILE_A, 2)).toEqual([1]);
  });
});

describe('expiration (§11.19)', () => {
  it('discards every packet held for a session', () => {
    const manager = createPacketManager();

    manager.accept(dataPacket(0), passing);
    manager.accept(dataPacket(1), passing);

    expect(manager.releaseSession(SESSION)).toBe(2);
    expect(manager.storedCount(SESSION, FILE_A)).toBe(0);
  });

  it('discards packets for one file without touching another', () => {
    const manager = createPacketManager();

    manager.accept(dataPacket(0, FILE_A), passing);
    manager.accept(dataPacket(0, FILE_B), passing);

    expect(manager.releaseFile(SESSION, FILE_A)).toBe(1);
    expect(manager.storedCount(SESSION, FILE_A)).toBe(0);
    expect(manager.storedCount(SESSION, FILE_B)).toBe(1);
  });

  it('releasing an unknown session releases nothing', () => {
    expect(createPacketManager().releaseSession(OTHER_SESSION)).toBe(0);
  });
});

describe('layer separation', () => {
  it('works entirely on domain objects without a codec', () => {
    const manager = createPacketManager();

    // Every protocol operation is available with no binary layer present.
    expect(manager.accept(dataPacket(0), passing).outcome).toBe(AcceptOutcome.Stored);
    expect(manager.orderedPackets(SESSION, FILE_A)).toHaveLength(1);
  });

  it('refuses to serialize when no codec was injected', () => {
    // The manager coordinates the binary layer; it does not contain one.
    expect(() => createPacketManager().serialize(dataPacket(0))).toThrow();
  });

  it('delegates serialization to the injected codec (API_SPEC §7)', () => {
    const encode = jest.fn(() => new Uint8Array([1, 2, 3]));
    const decode = jest.fn(() => ({ packet: dataPacket(0), integrityVerified: true }));
    const manager = createPacketManager({ codec: { encode, decode } });

    const packet = dataPacket(0);
    expect(Array.from(manager.serialize(packet))).toEqual([1, 2, 3]);
    expect(encode).toHaveBeenCalledWith(packet);

    // The codec reports the integrity verdict alongside the packet, because
    // §11.12 has integrity decided before the protocol layer stores anything.
    expect(manager.deserialize(new Uint8Array([1]))?.integrityVerified).toBe(true);
    expect(decode).toHaveBeenCalled();
  });

  it('accepts an injected registry', () => {
    const registry = createPacketRegistry();
    const manager = createPacketManager({ registry });

    manager.accept(dataPacket(0), passing);

    expect(registry.count(SESSION, FILE_A)).toBe(1);
  });

  it('stores a manifest packet under the no-file key', () => {
    const registry = createPacketRegistry();
    const manager = createPacketManager({ registry });

    manager.accept(
      createPacket({
        sessionId: SESSION,
        index: 0,
        payload: payload(1),
        type: PacketType.Manifest,
      }),
      passing,
    );

    expect(registry.count(SESSION, NO_FILE)).toBe(1);
  });
});
