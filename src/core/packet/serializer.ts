/**
 * Packet serializer (PKT-003) — PACKET_SPEC §4, §5, §6, §10.
 *
 * §10 fixes the order: header, then payload, then footer. Every field is
 * written exactly once, and field ordering is fixed.
 *
 * The CRC-32 covers the header and payload — everything preceding it — which
 * is the only definition under which a receiver can verify a packet it has not
 * yet fully trusted. The digest field, when the layout includes it, is carried
 * as given; computing it belongs to the security phase.
 *
 * This module *wraps* the Phase 2 `Packet` domain model. `toWirePacket`
 * transforms a domain packet into wire form; the domain model is unchanged.
 */
import { AppError, ErrorCode } from '@core/errors';

import { PacketType, type Packet } from '@domain/packet';

import { ByteWriter, NIL_UUID } from './bytes';
import { crc32 } from './crc32';
import {
  createPacketFooter,
  footerSize,
  MINIMAL_FOOTER,
  type FooterLayout,
  type PacketFooter,
} from './footer';
import {
  createPacketHeader,
  flagsToBits,
  HEADER_SIZE,
  PacketTypeId,
  type PacketFlags,
  type PacketHeader,
} from './header';

/** A packet in wire form: the parts a serializer writes and a parser reads. */
export interface WirePacket {
  readonly header: PacketHeader;
  readonly payload: Uint8Array;
  readonly footer: PacketFooter;
}

export interface SerializeOptions {
  /** Footer layout for the session. Defaults to CRC only. */
  readonly footerLayout?: FooterLayout;
  /** 32-byte SHA-256 digest, required when the layout includes one. */
  readonly digest?: Uint8Array;
}

/** Total encoded size of a packet with the given payload length and layout. */
export function packetSize(payloadLength: number, layout: FooterLayout = MINIMAL_FOOTER): number {
  return HEADER_SIZE + payloadLength + footerSize(layout);
}

/**
 * Maps a domain packet type to its registry id (PACKET_SPEC §7).
 *
 * The domain model names the three types that carry a transfer; the registry
 * holds thirteen. This is the seam between them.
 */
export function packetTypeIdOf(type: PacketType): PacketTypeId {
  switch (type) {
    case PacketType.Manifest:
      return PacketTypeId.Manifest;
    case PacketType.Data:
      return PacketTypeId.Data;
    case PacketType.Recovery:
      return PacketTypeId.Recovery;
    default: {
      // Exhaustive: adding a domain packet type without mapping it is a
      // compile error here rather than a malformed packet at run time.
      const unexpected: never = type;
      throw new AppError(ErrorCode.INVALID_PACKET, `Unmapped packet type: ${String(unexpected)}.`);
    }
  }
}

/**
 * Writes a header into a buffer at the current cursor (PACKET_SPEC §5).
 *
 * Exactly 50 bytes, in the order the offset table defines.
 */
function writeHeader(writer: ByteWriter, header: PacketHeader): void {
  writer
    .uint16(header.magic)
    .uint8(header.protocolVersion)
    .uint8(header.packetType)
    .uint16(flagsToBits(header.flags))
    .uuid(header.sessionId)
    .uuid(header.fileId)
    .uint32(header.packetIndex)
    .uint32(header.totalPackets)
    .uint32(header.payloadLength);
}

/**
 * Serializes a header, payload and footer into a single buffer.
 *
 * The checksum in `footer` is ignored and recomputed: a serializer that
 * accepted a caller's checksum would happily emit a packet that fails its own
 * validation.
 */
export function serializePacket(
  header: PacketHeader,
  payload: Uint8Array,
  options: SerializeOptions = {},
): Uint8Array {
  const layout = options.footerLayout ?? MINIMAL_FOOTER;

  if (header.payloadLength !== payload.byteLength) {
    throw new AppError(
      ErrorCode.INVALID_PACKET,
      'Header payloadLength does not match the payload.',
      { details: { declared: header.payloadLength, actual: payload.byteLength } },
    );
  }

  if (layout.includeDigest && options.digest === undefined) {
    throw new AppError(
      ErrorCode.INVALID_PACKET,
      'Footer layout requires a digest, but none was supplied.',
    );
  }

  const buffer = new Uint8Array(packetSize(payload.byteLength, layout));
  const writer = new ByteWriter(buffer);

  // §10: header, then payload, then footer.
  writeHeader(writer, header);
  writer.bytes(payload);

  // The checksum covers everything written so far — header and payload.
  const checksum = crc32(buffer, 0, writer.offset);
  writer.uint32(checksum);

  if (layout.includeDigest) {
    const digest = options.digest as Uint8Array;
    // Validated for length by createPacketFooter below; write after checking.
    createPacketFooter(checksum, digest);
    writer.bytes(digest);
  }

  return buffer;
}

/** Serializes a `WirePacket`, recomputing its checksum. */
export function serializeWirePacket(packet: WirePacket): Uint8Array {
  const options: SerializeOptions = {
    footerLayout: packet.footer.digest === undefined ? MINIMAL_FOOTER : { includeDigest: true },
    ...(packet.footer.digest === undefined ? {} : { digest: packet.footer.digest }),
  };

  return serializePacket(packet.header, packet.payload, options);
}

export interface ToWireOptions {
  readonly protocolVersion: number;
  /** Total packets in this file's sequence, for the header's counter field. */
  readonly totalPackets: number;
  readonly flags?: PacketFlags;
}

/**
 * Transforms a Phase 2 domain `Packet` into wire form.
 *
 * The domain model carries identifiers as opaque non-empty strings, while
 * PACKET_SPEC §5 gives each 16 bytes — a UUID (§3). Ids that are not UUIDs are
 * rejected here, at the boundary, rather than by widening the domain model.
 *
 * A packet belonging to no single file — a manifest packet — is encoded with
 * the nil UUID, since §5 makes the File ID field mandatory.
 */
export function toWirePacket(packet: Packet, options: ToWireOptions): WirePacket {
  const header = createPacketHeader({
    protocolVersion: options.protocolVersion,
    packetType: packetTypeIdOf(packet.type),
    sessionId: packet.sessionId,
    fileId: packet.fileId ?? NIL_UUID,
    packetIndex: packet.index,
    totalPackets: options.totalPackets,
    payloadLength: packet.size,
    ...(options.flags === undefined ? {} : { flags: options.flags }),
  });

  const bytes = serializePacket(header, packet.payload);
  const checksum = crc32(bytes, 0, HEADER_SIZE + packet.size);

  return Object.freeze({
    header,
    payload: packet.payload,
    footer: createPacketFooter(checksum),
  });
}
