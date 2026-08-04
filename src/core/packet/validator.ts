/**
 * Packet validator (PKT-005) — PACKET_SPEC §8, §11, §12.
 *
 * §12 requires every received packet to be validated against seven things:
 * magic number, version, packet type, payload length, session id, CRC and
 * packet index. §11 sequences validation in two stages — the header is
 * validated before the payload is read, and integrity after the footer.
 *
 * Validation *reports* rather than throws. A receiver processing a stream of
 * optically decoded frames needs to know why a packet failed so it can count
 * corrupted packets separately from foreign ones (PROTOCOL_SPEC §3.27, §8.11);
 * an exception per bad frame would be both slower and less informative.
 * Discarding a failed packet (§11) is the caller's decision.
 *
 * Protocol-level validation — whether this session is active, whether the
 * manifest has arrived — follows PROTOCOL_SPEC.md and belongs to the protocol
 * engine, not here.
 */
import { invalid, mergeOutcomes, valid, type ValidationOutcome } from '@core/validation';

import { isUuid, UINT32_MAX, UINT8_MAX } from './bytes';
import { crc32 } from './crc32';
import { HEADER_SIZE, hasReservedBitsSet, isKnownPacketType, MAGIC_NUMBER } from './header';
import type { PacketHeader } from './header';

/** Why a packet was rejected. One code per §12 validation item, plus §8. */
export const PacketRejection = {
  BadMagic: 'BAD_MAGIC',
  UnsupportedVersion: 'UNSUPPORTED_VERSION',
  UnknownPacketType: 'UNKNOWN_PACKET_TYPE',
  BadPayloadLength: 'BAD_PAYLOAD_LENGTH',
  BadSessionId: 'BAD_SESSION_ID',
  ForeignSession: 'FOREIGN_SESSION',
  BadChecksum: 'BAD_CHECKSUM',
  BadPacketIndex: 'BAD_PACKET_INDEX',
  ReservedFlagsSet: 'RESERVED_FLAGS_SET',
  Truncated: 'TRUNCATED',
} as const;

export type PacketRejection = (typeof PacketRejection)[keyof typeof PacketRejection];

/** Packet validation outcome. The shape is shared; the vocabulary is not. */
export type ValidationResult = ValidationOutcome<PacketRejection>;

const VALID: ValidationResult = valid<PacketRejection>();

export interface HeaderValidationOptions {
  /**
   * The session this receiver is collecting for.
   *
   * When given, a packet carrying any other session id is rejected as foreign.
   * PROTOCOL_SPEC §8.11 makes cross-session mixing a protocol violation.
   */
  readonly expectedSessionId?: string;
  /** Protocol versions this implementation accepts. */
  readonly supportedVersions?: readonly number[];
  /** Upper bound on payload length, from the manifest's packet size. */
  readonly maxPayloadLength?: number;
}

/**
 * Validates a header (PACKET_SPEC §12, first stage of §11).
 *
 * Runs every check and collects every failure rather than stopping at the
 * first: a frame that fails three ways is more diagnostic than one that fails
 * once.
 */
export function validateHeader(
  header: PacketHeader,
  options: HeaderValidationOptions = {},
): ValidationResult {
  const rejections: PacketRejection[] = [];

  if (header.magic !== MAGIC_NUMBER) {
    rejections.push(PacketRejection.BadMagic);
  }

  if (
    !Number.isInteger(header.protocolVersion) ||
    header.protocolVersion < 0 ||
    header.protocolVersion > UINT8_MAX ||
    (options.supportedVersions !== undefined &&
      !options.supportedVersions.includes(header.protocolVersion))
  ) {
    rejections.push(PacketRejection.UnsupportedVersion);
  }

  if (!isKnownPacketType(header.packetType)) {
    rejections.push(PacketRejection.UnknownPacketType);
  }

  if (
    !Number.isInteger(header.payloadLength) ||
    header.payloadLength < 0 ||
    header.payloadLength > UINT32_MAX ||
    (options.maxPayloadLength !== undefined && header.payloadLength > options.maxPayloadLength)
  ) {
    rejections.push(PacketRejection.BadPayloadLength);
  }

  if (!isUuid(header.sessionId)) {
    rejections.push(PacketRejection.BadSessionId);
  } else if (
    options.expectedSessionId !== undefined &&
    header.sessionId !== options.expectedSessionId
  ) {
    rejections.push(PacketRejection.ForeignSession);
  }

  // §3.13: indices are zero-based, and §5 gives the counter four bytes. An
  // index at or beyond the declared total cannot address a real packet.
  if (!Number.isInteger(header.packetIndex) || header.packetIndex < 0) {
    rejections.push(PacketRejection.BadPacketIndex);
  } else if (header.totalPackets > 0 && header.packetIndex >= header.totalPackets) {
    rejections.push(PacketRejection.BadPacketIndex);
  }

  return rejections.length === 0 ? VALID : invalid(rejections);
}

/**
 * Validates the raw 16-bit flag field (PACKET_SPEC §8: reserved bits SHALL be
 * zero).
 *
 * Takes the raw value rather than a decoded `PacketFlags`, because decoding
 * discards the reserved bits — by the time flags are an object, the evidence
 * is gone. The parser calls this while it still holds the wire value.
 */
export function validateFlagBits(bits: number): ValidationResult {
  return hasReservedBitsSet(bits) ? invalid([PacketRejection.ReservedFlagsSet]) : VALID;
}

/**
 * Verifies a packet's CRC-32 against its bytes (§12, second stage of §11).
 *
 * The checksum covers the header and payload — every byte before the footer.
 *
 * @param bytes The complete encoded packet.
 * @param payloadLength Declared payload length, from the validated header.
 * @param checksum The checksum read from the footer.
 */
export function validateChecksum(
  bytes: Uint8Array,
  payloadLength: number,
  checksum: number,
): ValidationResult {
  const covered = HEADER_SIZE + payloadLength;

  if (bytes.byteLength < covered) {
    return invalid([PacketRejection.Truncated]);
  }

  return crc32(bytes, 0, covered) === checksum ? VALID : invalid([PacketRejection.BadChecksum]);
}

/** Merges results, preserving order and dropping duplicates. */
export function mergeResults(...results: readonly ValidationResult[]): ValidationResult {
  return mergeOutcomes(...results);
}
