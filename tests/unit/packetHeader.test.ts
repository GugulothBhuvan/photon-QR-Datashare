/**
 * Packet header (PKT-001) — PACKET_SPEC §5, §7, §8.
 */
import { AppError } from '@core/errors';
import { NIL_UUID } from '@core/packet/bytes';
import {
  bitsToFlags,
  createPacketHeader,
  FlagBit,
  flagsToBits,
  hasFile,
  hasReservedBitsSet,
  headerEquals,
  HeaderOffset,
  HEADER_SIZE,
  isKnownPacketType,
  MAGIC_NUMBER,
  noFlags,
  PacketTypeId,
} from '@core/packet/header';

const SESSION = '0f9e8d7c-6b5a-4938-8271-605f4e3d2c1b';
const FILE = '11111111-2222-3333-4444-555555555555';

const baseInput = {
  protocolVersion: 1,
  packetType: PacketTypeId.Data,
  sessionId: SESSION,
  fileId: FILE,
  packetIndex: 0,
  totalPackets: 10,
  payloadLength: 256,
};

describe('header layout (§5)', () => {
  it('is 50 bytes', () => {
    expect(HEADER_SIZE).toBe(50);
  });

  it('places every field at the specified offset', () => {
    expect(HeaderOffset).toEqual({
      Magic: 0,
      ProtocolVersion: 2,
      PacketType: 3,
      Flags: 4,
      SessionId: 6,
      FileId: 22,
      PacketIndex: 38,
      TotalPackets: 42,
      PayloadLength: 46,
    });
  });

  it('ends exactly where the payload begins', () => {
    // Last field is a UInt32 at offset 46.
    expect(HeaderOffset.PayloadLength + 4).toBe(HEADER_SIZE);
  });

  it('uses the OSP magic number', () => {
    expect(MAGIC_NUMBER).toBe(0x4f53);
  });
});

describe('packet registry (§7)', () => {
  it('registers all thirteen wire types', () => {
    expect(Object.keys(PacketTypeId)).toHaveLength(13);
  });

  it.each([
    ['Handshake', 0x01],
    ['Manifest', 0x03],
    ['Data', 0x05],
    ['Recovery', 0x06],
    ['Capability', 0x0d],
  ])('assigns %s the id %p', (name, id) => {
    expect(PacketTypeId[name as keyof typeof PacketTypeId]).toBe(id);
  });

  it('recognises registered ids and rejects others', () => {
    expect(isKnownPacketType(0x05)).toBe(true);
    expect(isKnownPacketType(0x00)).toBe(false);
    expect(isKnownPacketType(0x0e)).toBe(false);
    expect(isKnownPacketType(0xff)).toBe(false);
  });
});

describe('flags (§8)', () => {
  it('assigns each flag the bit number §8 specifies', () => {
    expect(FlagBit).toEqual({
      CompressionEnabled: 0,
      EncryptionEnabled: 1,
      FinalPacket: 2,
      RecoveryPacket: 3,
      ResumePacket: 4,
      HighPriority: 5,
    });
  });

  it.each([
    ['compressionEnabled', 0b000001],
    ['encryptionEnabled', 0b000010],
    ['finalPacket', 0b000100],
    ['recoveryPacket', 0b001000],
    ['resumePacket', 0b010000],
    ['highPriority', 0b100000],
  ])('packs %s as %p', (flag, bits) => {
    expect(flagsToBits({ ...noFlags, [flag]: true })).toBe(bits);
  });

  it('packs no flags as zero', () => {
    expect(flagsToBits(noFlags)).toBe(0);
  });

  it('round-trips every combination of the six defined bits', () => {
    for (let bits = 0; bits <= 0b111111; bits += 1) {
      expect(flagsToBits(bitsToFlags(bits))).toBe(bits);
    }
  });

  it('leaves reserved bits zero when packing', () => {
    const allSet = flagsToBits({
      compressionEnabled: true,
      encryptionEnabled: true,
      finalPacket: true,
      recoveryPacket: true,
      resumePacket: true,
      highPriority: true,
    });

    expect(hasReservedBitsSet(allSet)).toBe(false);
    expect(allSet).toBe(0b111111);
  });

  it('detects reserved bits 6-15 (§8: reserved bits SHALL be zero)', () => {
    expect(hasReservedBitsSet(0b1000000)).toBe(true);
    expect(hasReservedBitsSet(0x8000)).toBe(true);
    expect(hasReservedBitsSet(0b111111)).toBe(false);
  });
});

describe('createPacketHeader', () => {
  it('stamps the magic number', () => {
    expect(createPacketHeader(baseInput).magic).toBe(MAGIC_NUMBER);
  });

  it('is frozen', () => {
    const header = createPacketHeader(baseInput);

    expect(Object.isFrozen(header)).toBe(true);
    (header as { packetIndex: number }).packetIndex = 99;
    expect(header.packetIndex).toBe(0);
  });

  it('defaults the file id to the nil UUID for packets belonging to no file', () => {
    const { fileId: _omitted, ...withoutFile } = baseInput;
    const header = createPacketHeader(withoutFile);

    expect(header.fileId).toBe(NIL_UUID);
    expect(hasFile(header)).toBe(false);
  });

  it('reports a real file id', () => {
    expect(hasFile(createPacketHeader(baseInput))).toBe(true);
  });

  it('defaults to no flags', () => {
    expect(createPacketHeader(baseInput).flags).toEqual(noFlags);
  });

  describe('field widths (§5)', () => {
    it('accepts the maximum value of each field', () => {
      const header = createPacketHeader({
        ...baseInput,
        protocolVersion: 255,
        packetIndex: 0xffffffff,
        totalPackets: 0xffffffff,
        payloadLength: 0xffffffff,
      });

      expect(header.protocolVersion).toBe(255);
      expect(header.payloadLength).toBe(0xffffffff);
    });

    it.each([
      ['protocolVersion above one byte', { protocolVersion: 256 }],
      ['negative protocolVersion', { protocolVersion: -1 }],
      ['packetIndex above four bytes', { packetIndex: 0x100000000 }],
      ['totalPackets above four bytes', { totalPackets: 0x100000000 }],
      ['payloadLength above four bytes', { payloadLength: 0x100000000 }],
      ['fractional packetIndex', { packetIndex: 1.5 }],
    ])('rejects %s', (_label, change) => {
      expect(() => createPacketHeader({ ...baseInput, ...change })).toThrow(AppError);
    });
  });

  it('rejects an unregistered packet type', () => {
    expect(() => createPacketHeader({ ...baseInput, packetType: 0x99 as never })).toThrow(AppError);
  });

  it.each([
    ['sessionId', { sessionId: 'session-1' }],
    ['fileId', { fileId: 'file-1' }],
  ])('rejects a non-UUID %s, since the field is 16 bytes', (_label, change) => {
    expect(() => createPacketHeader({ ...baseInput, ...change })).toThrow(AppError);
  });
});

describe('headerEquals', () => {
  it('compares structurally', () => {
    expect(headerEquals(createPacketHeader(baseInput), createPacketHeader(baseInput))).toBe(true);
  });

  it.each([
    ['packetIndex', { packetIndex: 1 }],
    ['sessionId', { sessionId: FILE }],
    ['packetType', { packetType: PacketTypeId.Recovery }],
    ['payloadLength', { payloadLength: 1 }],
  ])('detects a difference in %s', (_label, change) => {
    expect(
      headerEquals(createPacketHeader(baseInput), createPacketHeader({ ...baseInput, ...change })),
    ).toBe(false);
  });

  it('detects a difference in flags', () => {
    expect(
      headerEquals(
        createPacketHeader(baseInput),
        createPacketHeader({ ...baseInput, flags: { ...noFlags, finalPacket: true } }),
      ),
    ).toBe(false);
  });
});
