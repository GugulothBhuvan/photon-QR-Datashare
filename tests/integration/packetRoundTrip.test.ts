/**
 * Packet serialization round trip (PKT-003, PKT-004, PKT-005).
 *
 * PACKET_SPEC §10, §11, §12. This is Phase 3's exit criterion executed: a
 * packet that is serialized and parsed back must be byte-identical, and a
 * packet that has been altered must be rejected.
 */
import { createPacket, PacketType } from '@domain/packet';
import { fileId, sessionId } from '@domain/ids';
import { deserializePacket, tryDeserializePacket } from '@core/packet/deserializer';
import { crc32 } from '@core/packet/crc32';
import { DIGEST_FOOTER, SHA256_SIZE } from '@core/packet/footer';
import {
  createPacketHeader,
  HEADER_SIZE,
  HeaderOffset,
  MAGIC_NUMBER,
  noFlags,
  PacketTypeId,
} from '@core/packet/header';
import { packetSize, packetTypeIdOf, serializePacket, toWirePacket } from '@core/packet/serializer';
import { PacketRejection } from '@core/packet/validator';

const SESSION = '0f9e8d7c-6b5a-4938-8271-605f4e3d2c1b';
const FILE = '11111111-2222-3333-4444-555555555555';

const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02]);

const header = createPacketHeader({
  protocolVersion: 1,
  packetType: PacketTypeId.Data,
  sessionId: SESSION,
  fileId: FILE,
  packetIndex: 3,
  totalPackets: 10,
  payloadLength: payload.byteLength,
});

describe('serialization order (§10)', () => {
  it('writes header, then payload, then footer', () => {
    const bytes = serializePacket(header, payload);

    // Header first.
    expect(bytes[HeaderOffset.Magic]).toBe(0x4f);
    expect(bytes[HeaderOffset.Magic + 1]).toBe(0x53);
    // Payload immediately after the 50-byte header.
    expect(Array.from(bytes.slice(HEADER_SIZE, HEADER_SIZE + payload.byteLength))).toEqual(
      Array.from(payload),
    );
    // Footer last.
    expect(bytes.byteLength).toBe(HEADER_SIZE + payload.byteLength + 4);
  });

  it('produces the size the layout predicts', () => {
    expect(serializePacket(header, payload).byteLength).toBe(packetSize(payload.byteLength));
    expect(packetSize(payload.byteLength, DIGEST_FOOTER)).toBe(
      HEADER_SIZE + payload.byteLength + 36,
    );
  });

  it('places each header field at its specified offset (§5)', () => {
    const view = new DataView(serializePacket(header, payload).buffer);

    expect(view.getUint16(HeaderOffset.Magic)).toBe(MAGIC_NUMBER);
    expect(view.getUint8(HeaderOffset.ProtocolVersion)).toBe(1);
    expect(view.getUint8(HeaderOffset.PacketType)).toBe(PacketTypeId.Data);
    expect(view.getUint16(HeaderOffset.Flags)).toBe(0);
    expect(view.getUint32(HeaderOffset.PacketIndex)).toBe(3);
    expect(view.getUint32(HeaderOffset.TotalPackets)).toBe(10);
    expect(view.getUint32(HeaderOffset.PayloadLength)).toBe(payload.byteLength);
  });

  it('checksums the header and payload, not the footer', () => {
    const bytes = serializePacket(header, payload);
    const view = new DataView(bytes.buffer);
    const written = view.getUint32(HEADER_SIZE + payload.byteLength);

    expect(written).toBe(crc32(bytes, 0, HEADER_SIZE + payload.byteLength));
  });

  it('is deterministic — the same input always produces the same bytes', () => {
    expect(Array.from(serializePacket(header, payload))).toEqual(
      Array.from(serializePacket(header, payload)),
    );
  });

  it('rejects a payload that disagrees with the declared length', () => {
    expect(() => serializePacket(header, new Uint8Array(3))).toThrow();
  });
});

describe('round trip (§10, §11)', () => {
  it('recovers the payload byte for byte', () => {
    const result = deserializePacket(serializePacket(header, payload));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.validation.valid).toBe(true);
    expect(Array.from(result.packet.payload)).toEqual(Array.from(payload));
  });

  it('recovers every header field', () => {
    const result = deserializePacket(serializePacket(header, payload));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.packet.header).toEqual(header);
  });

  it('round-trips an empty payload', () => {
    const empty = createPacketHeader({
      protocolVersion: 1,
      packetType: PacketTypeId.KeepAlive,
      sessionId: SESSION,
      packetIndex: 0,
      totalPackets: 1,
      payloadLength: 0,
    });

    const packet = tryDeserializePacket(serializePacket(empty, new Uint8Array()));

    expect(packet?.payload.byteLength).toBe(0);
  });

  it('round-trips a payload containing every byte value', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) {
      all[i] = i;
    }

    const wide = createPacketHeader({
      protocolVersion: 1,
      packetType: PacketTypeId.Data,
      sessionId: SESSION,
      fileId: FILE,
      packetIndex: 0,
      totalPackets: 1,
      payloadLength: all.byteLength,
    });

    const packet = tryDeserializePacket(serializePacket(wide, all));

    expect(Array.from(packet?.payload ?? [])).toEqual(Array.from(all));
  });

  it('round-trips flags', () => {
    const flagged = createPacketHeader({
      protocolVersion: 1,
      packetType: PacketTypeId.Data,
      sessionId: SESSION,
      fileId: FILE,
      packetIndex: 9,
      totalPackets: 10,
      payloadLength: payload.byteLength,
      flags: { ...noFlags, finalPacket: true, compressionEnabled: true },
    });

    const packet = tryDeserializePacket(serializePacket(flagged, payload));

    expect(packet?.header.flags.finalPacket).toBe(true);
    expect(packet?.header.flags.compressionEnabled).toBe(true);
    expect(packet?.header.flags.encryptionEnabled).toBe(false);
  });

  it('round-trips a footer carrying the optional digest', () => {
    const digest = new Uint8Array(SHA256_SIZE).fill(0xab);
    const bytes = serializePacket(header, payload, { footerLayout: DIGEST_FOOTER, digest });

    expect(bytes.byteLength).toBe(HEADER_SIZE + payload.byteLength + 36);

    const packet = tryDeserializePacket(bytes, { footerLayout: DIGEST_FOOTER });

    expect(packet?.footer.digest).toEqual(digest);
  });

  it('requires a digest when the layout declares one', () => {
    expect(() => serializePacket(header, payload, { footerLayout: DIGEST_FOOTER })).toThrow();
  });
});

describe('validation (§12)', () => {
  const encoded = (): Uint8Array => serializePacket(header, payload);

  it('accepts an untouched packet', () => {
    expect(deserializePacket(encoded()).validation.valid).toBe(true);
  });

  it('rejects a corrupted payload byte', () => {
    const bytes = encoded();
    bytes[HEADER_SIZE + 2] = (bytes[HEADER_SIZE + 2] as number) ^ 0xff;

    const result = deserializePacket(bytes);

    expect(result.validation.valid).toBe(false);
    expect(result.validation.rejections).toContain(PacketRejection.BadChecksum);
  });

  it('rejects a corrupted header byte', () => {
    const bytes = encoded();
    bytes[HeaderOffset.PacketIndex + 3] = 9;

    expect(deserializePacket(bytes).validation.rejections).toContain(PacketRejection.BadChecksum);
  });

  it('rejects a bad magic number', () => {
    const bytes = encoded();
    bytes[0] = 0x00;

    const result = deserializePacket(bytes);

    expect(result.validation.rejections).toContain(PacketRejection.BadMagic);
  });

  it('rejects an unregistered packet type', () => {
    const bytes = encoded();
    bytes[HeaderOffset.PacketType] = 0x99;

    const result = deserializePacket(bytes);

    expect(result.ok).toBe(false);
    expect(result.validation.rejections).toContain(PacketRejection.UnknownPacketType);
  });

  it('rejects an unsupported protocol version', () => {
    const result = deserializePacket(encoded(), { supportedVersions: [2, 3] });

    expect(result.validation.rejections).toContain(PacketRejection.UnsupportedVersion);
  });

  it('rejects a packet from another session (§8.11)', () => {
    const result = deserializePacket(encoded(), {
      expectedSessionId: '99999999-9999-9999-9999-999999999999',
    });

    expect(result.validation.rejections).toContain(PacketRejection.ForeignSession);
  });

  it('accepts a packet from the expected session', () => {
    expect(deserializePacket(encoded(), { expectedSessionId: SESSION }).validation.valid).toBe(
      true,
    );
  });

  it('rejects an index at or beyond the declared total', () => {
    const outOfRange = createPacketHeader({
      protocolVersion: 1,
      packetType: PacketTypeId.Data,
      sessionId: SESSION,
      fileId: FILE,
      packetIndex: 10,
      totalPackets: 10,
      payloadLength: payload.byteLength,
    });

    const result = deserializePacket(serializePacket(outOfRange, payload));

    expect(result.validation.rejections).toContain(PacketRejection.BadPacketIndex);
  });

  it('rejects reserved flag bits (§8)', () => {
    const bytes = encoded();
    // Set bit 6, which is reserved, then repair the checksum so that the
    // reserved-bit rule is what fails rather than the CRC.
    new DataView(bytes.buffer).setUint16(HeaderOffset.Flags, 0b0100_0000);
    new DataView(bytes.buffer).setUint32(
      HEADER_SIZE + payload.byteLength,
      crc32(bytes, 0, HEADER_SIZE + payload.byteLength),
    );

    const result = deserializePacket(bytes);

    expect(result.validation.rejections).toContain(PacketRejection.ReservedFlagsSet);
    expect(result.validation.rejections).not.toContain(PacketRejection.BadChecksum);
  });

  it('rejects a payload longer than the manifest allows', () => {
    const result = deserializePacket(encoded(), { maxPayloadLength: 4 });

    expect(result.validation.rejections).toContain(PacketRejection.BadPayloadLength);
  });

  it.each([0, 1, HEADER_SIZE - 1, HEADER_SIZE, HEADER_SIZE + 2])(
    'reports a %p-byte buffer as truncated rather than crashing',
    (length) => {
      const result = deserializePacket(encoded().slice(0, length));

      expect(result.validation.valid).toBe(false);
      expect(result.validation.rejections).toContain(PacketRejection.Truncated);
    },
  );

  it('collects every reason a packet failed, not just the first', () => {
    const bytes = encoded();
    bytes[0] = 0x00;
    bytes[HeaderOffset.ProtocolVersion] = 9;

    const result = deserializePacket(bytes, { supportedVersions: [1] });

    expect(result.validation.rejections).toEqual(
      expect.arrayContaining([
        PacketRejection.BadMagic,
        PacketRejection.UnsupportedVersion,
        PacketRejection.BadChecksum,
      ]),
    );
  });

  it('discards a failed packet through the convenience form (§11)', () => {
    const bytes = encoded();
    bytes[HEADER_SIZE] = (bytes[HEADER_SIZE] as number) ^ 0xff;

    expect(tryDeserializePacket(bytes)).toBeUndefined();
  });
});

describe('wrapping the Phase 2 domain model', () => {
  it('maps each domain packet type to its registry id (§7)', () => {
    expect(packetTypeIdOf(PacketType.Manifest)).toBe(PacketTypeId.Manifest);
    expect(packetTypeIdOf(PacketType.Data)).toBe(PacketTypeId.Data);
    expect(packetTypeIdOf(PacketType.Recovery)).toBe(PacketTypeId.Recovery);
  });

  it('transforms a domain packet into wire form without altering it', () => {
    const domain = createPacket({
      sessionId: sessionId(SESSION),
      fileId: fileId(FILE),
      index: 2,
      payload,
    });

    const wire = toWirePacket(domain, { protocolVersion: 1, totalPackets: 10 });

    expect(wire.header.packetIndex).toBe(2);
    expect(wire.header.sessionId).toBe(SESSION);
    expect(wire.header.payloadLength).toBe(payload.byteLength);
    // The domain packet is untouched.
    expect(domain.index).toBe(2);
    expect(Array.from(domain.payload)).toEqual(Array.from(payload));
  });

  it('encodes a manifest packet, which belongs to no file, with the nil UUID', () => {
    const domain = createPacket({
      sessionId: sessionId(SESSION),
      index: 0,
      payload,
      type: PacketType.Manifest,
    });

    const wire = toWirePacket(domain, { protocolVersion: 1, totalPackets: 1 });

    expect(wire.header.fileId).toBe('00000000-0000-0000-0000-000000000000');
    expect(wire.header.packetType).toBe(PacketTypeId.Manifest);
  });

  it('rejects a domain identifier that is not a UUID', () => {
    // The domain model admits any non-empty string; the wire format gives the
    // field 16 bytes. The boundary is enforced here, not by widening the model.
    const domain = createPacket({
      sessionId: sessionId('session-1'),
      fileId: fileId(FILE),
      index: 0,
      payload,
    });

    expect(() => toWirePacket(domain, { protocolVersion: 1, totalPackets: 1 })).toThrow();
  });
});
