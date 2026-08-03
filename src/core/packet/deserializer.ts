/**
 * Packet deserializer (PKT-004) — PACKET_SPEC §5, §6, §11.
 *
 * §11 fixes the parse order:
 *
 * ```text
 * Header → Header Validation → Payload → Footer → Integrity Validation
 * ```
 *
 * That order is load-bearing, not stylistic. The header carries the payload
 * length, so validating it *before* reading the payload is what stops a
 * corrupted length field from causing a huge allocation from a hostile or
 * garbled frame. This module follows the order exactly.
 *
 * Packets failing validation SHALL be discarded (§11). This returns a result
 * describing the failure and lets the caller discard it; nothing here throws
 * for a bad packet, because bad packets are expected — an optical link
 * produces them continuously.
 */
import { ByteReader } from './bytes';
import {
  createPacketFooter,
  footerSize,
  MINIMAL_FOOTER,
  SHA256_SIZE,
  type FooterLayout,
} from './footer';
import {
  bitsToFlags,
  createPacketHeader,
  HEADER_SIZE,
  isKnownPacketType,
  type PacketHeader,
  type PacketTypeId,
} from './header';
import {
  mergeResults,
  PacketRejection,
  validateChecksum,
  validateFlagBits,
  validateHeader,
  type HeaderValidationOptions,
  type ValidationResult,
} from './validator';

import type { WirePacket } from './serializer';

export interface DeserializeOptions extends HeaderValidationOptions {
  /** Footer layout agreed for the session. Defaults to CRC only. */
  readonly footerLayout?: FooterLayout;
}

/** A parse that produced a packet, whether or not it validated. */
export interface DeserializeSuccess {
  readonly ok: true;
  readonly packet: WirePacket;
  readonly validation: ValidationResult;
}

/** A parse that could not produce a packet at all. */
export interface DeserializeFailure {
  readonly ok: false;
  readonly validation: ValidationResult;
}

export type DeserializeResult = DeserializeSuccess | DeserializeFailure;

function failure(...rejections: readonly PacketRejection[]): DeserializeFailure {
  return Object.freeze({
    ok: false,
    validation: Object.freeze({ valid: false, rejections: Object.freeze([...rejections]) }),
  });
}

/**
 * Reads the 50-byte header (PACKET_SPEC §5).
 *
 * Returns the header alongside the raw flag bits, which the caller needs in
 * order to check the reserved bits before they are discarded (§8).
 */
function readHeader(reader: ByteReader): { header: PacketHeader; flagBits: number } | undefined {
  const magic = reader.uint16();
  const protocolVersion = reader.uint8();
  const packetType = reader.uint8();
  const flagBits = reader.uint16();
  const sessionId = reader.uuid();
  const fileId = reader.uuid();
  const packetIndex = reader.uint32();
  const totalPackets = reader.uint32();
  const payloadLength = reader.uint32();

  // An unregistered type cannot be represented by `createPacketHeader`, but it
  // is a validation failure rather than a parse failure, so it is reported
  // through the normal path instead of throwing.
  if (!isKnownPacketType(packetType)) {
    return undefined;
  }

  const header = createPacketHeader({
    protocolVersion,
    packetType: packetType as PacketTypeId,
    flags: bitsToFlags(flagBits),
    sessionId,
    fileId,
    packetIndex,
    totalPackets,
    payloadLength,
  });

  // `createPacketHeader` always stamps the correct magic, so a wrong magic
  // would otherwise be silently corrected. Carry the value that was read.
  return { header: Object.freeze({ ...header, magic }), flagBits };
}

/**
 * Parses one packet from a buffer.
 *
 * @param bytes A complete encoded packet.
 * @param options Session expectations used during validation.
 */
export function deserializePacket(
  bytes: Uint8Array,
  options: DeserializeOptions = {},
): DeserializeResult {
  const layout = options.footerLayout ?? MINIMAL_FOOTER;

  if (bytes.byteLength < HEADER_SIZE) {
    return failure(PacketRejection.Truncated);
  }

  const reader = new ByteReader(bytes);

  // 1. Header.
  const read = readHeader(reader);

  if (read === undefined) {
    return failure(PacketRejection.UnknownPacketType);
  }

  const { header, flagBits } = read;

  // 2. Header validation — before the payload is read, so a corrupt length
  //    field cannot drive an oversized read.
  const headerValidation = mergeResults(
    validateHeader(header, options),
    validateFlagBits(flagBits),
  );

  const declaredTotal = HEADER_SIZE + header.payloadLength + footerSize(layout);

  if (bytes.byteLength < declaredTotal) {
    return Object.freeze({
      ok: false,
      validation: mergeResults(headerValidation, {
        valid: false,
        rejections: [PacketRejection.Truncated],
      }),
    });
  }

  // 3. Payload.
  const payload = reader.bytes(header.payloadLength);

  // 4. Footer.
  const checksum = reader.uint32();
  const digest = layout.includeDigest ? reader.bytes(SHA256_SIZE) : undefined;

  // 5. Integrity validation.
  const integrity = validateChecksum(bytes, header.payloadLength, checksum);

  return Object.freeze({
    ok: true,
    packet: Object.freeze({
      header,
      payload,
      footer: createPacketFooter(checksum, digest),
    }),
    validation: mergeResults(headerValidation, integrity),
  });
}

/**
 * Parses a packet and returns it only if it validated.
 *
 * The convenience form of "packets failing validation SHALL be discarded"
 * (§11), for callers that do not need to know why.
 */
export function tryDeserializePacket(
  bytes: Uint8Array,
  options: DeserializeOptions = {},
): WirePacket | undefined {
  const result = deserializePacket(bytes, options);
  return result.ok && result.validation.valid ? result.packet : undefined;
}
