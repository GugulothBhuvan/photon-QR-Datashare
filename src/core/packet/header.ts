/**
 * Packet header (PKT-001) — PACKET_SPEC §4, §5, §7, §8.
 *
 * The header is 50 bytes and identical for every packet type (§4); only the
 * payload varies. This module owns its *shape*: the field layout, the packet
 * registry, the flag bits, and the range invariants each field must satisfy.
 * Turning a header into bytes is the serializer's job (PKT-003).
 *
 * This layer wraps the Phase 2 `Packet` domain model rather than replacing it.
 * The domain model says what a packet *is*; this says how one is laid out.
 */
import { AppError, ErrorCode } from '@core/errors';

import { isUuid, NIL_UUID, UINT32_MAX, UINT8_MAX } from './bytes';

/**
 * Magic number identifying an OSP packet (PACKET_SPEC §5).
 *
 * `0x4F53` is ASCII "OS".
 */
export const MAGIC_NUMBER = 0x4f53;

/** Fixed header size in bytes (PACKET_SPEC §5). */
export const HEADER_SIZE = 50;

/**
 * Field offsets within the header (PACKET_SPEC §5).
 *
 * Declared once here so no other module computes an offset.
 */
export const HeaderOffset = {
  Magic: 0,
  ProtocolVersion: 2,
  PacketType: 3,
  Flags: 4,
  SessionId: 6,
  FileId: 22,
  PacketIndex: 38,
  TotalPackets: 42,
  PayloadLength: 46,
} as const;

/**
 * Packet registry (PACKET_SPEC §7).
 *
 * The wire format defines thirteen packet types. The Phase 2 domain model
 * names the three that carry a transfer's data; the rest are protocol control
 * messages whose semantics live in PROTOCOL_SPEC.md. The header must be able
 * to carry any of them, so all thirteen are registered here.
 */
export const PacketTypeId = {
  Handshake: 0x01,
  HandshakeResponse: 0x02,
  Manifest: 0x03,
  ManifestContinuation: 0x04,
  Data: 0x05,
  Recovery: 0x06,
  Resume: 0x07,
  ResumeResponse: 0x08,
  Complete: 0x09,
  Error: 0x0a,
  Cancel: 0x0b,
  KeepAlive: 0x0c,
  Capability: 0x0d,
} as const;

export type PacketTypeId = (typeof PacketTypeId)[keyof typeof PacketTypeId];

const KNOWN_TYPE_IDS: ReadonlySet<number> = new Set<number>(Object.values(PacketTypeId));

/** Whether a byte corresponds to a registered packet type. */
export function isKnownPacketType(value: number): value is PacketTypeId {
  return KNOWN_TYPE_IDS.has(value);
}

/**
 * Packet flags (PACKET_SPEC §8).
 *
 * Bits 6–15 are reserved and SHALL be zero.
 */
export const FlagBit = {
  CompressionEnabled: 0,
  EncryptionEnabled: 1,
  FinalPacket: 2,
  RecoveryPacket: 3,
  ResumePacket: 4,
  HighPriority: 5,
} as const;

/** Mask covering the six defined bits; everything above is reserved. */
export const DEFINED_FLAGS_MASK = 0b0000_0000_0011_1111;

export interface PacketFlags {
  readonly compressionEnabled: boolean;
  readonly encryptionEnabled: boolean;
  readonly finalPacket: boolean;
  readonly recoveryPacket: boolean;
  readonly resumePacket: boolean;
  readonly highPriority: boolean;
}

export const noFlags: PacketFlags = Object.freeze({
  compressionEnabled: false,
  encryptionEnabled: false,
  finalPacket: false,
  recoveryPacket: false,
  resumePacket: false,
  highPriority: false,
});

/** Packs flags into the header's 16-bit field. Reserved bits are left zero. */
export function flagsToBits(flags: PacketFlags): number {
  return (
    (flags.compressionEnabled ? 1 << FlagBit.CompressionEnabled : 0) |
    (flags.encryptionEnabled ? 1 << FlagBit.EncryptionEnabled : 0) |
    (flags.finalPacket ? 1 << FlagBit.FinalPacket : 0) |
    (flags.recoveryPacket ? 1 << FlagBit.RecoveryPacket : 0) |
    (flags.resumePacket ? 1 << FlagBit.ResumePacket : 0) |
    (flags.highPriority ? 1 << FlagBit.HighPriority : 0)
  );
}

/**
 * Unpacks the header's flag field.
 *
 * Reserved bits are ignored here rather than rejected: whether a packet with
 * dirty reserved bits is acceptable is a validation question (PKT-005), and a
 * reader that throws cannot report *why* it threw.
 */
export function bitsToFlags(bits: number): PacketFlags {
  const isSet = (bit: number): boolean => (bits & (1 << bit)) !== 0;

  return Object.freeze({
    compressionEnabled: isSet(FlagBit.CompressionEnabled),
    encryptionEnabled: isSet(FlagBit.EncryptionEnabled),
    finalPacket: isSet(FlagBit.FinalPacket),
    recoveryPacket: isSet(FlagBit.RecoveryPacket),
    resumePacket: isSet(FlagBit.ResumePacket),
    highPriority: isSet(FlagBit.HighPriority),
  });
}

/** Whether any reserved bit (6–15) is set (PACKET_SPEC §8). */
export function hasReservedBitsSet(bits: number): boolean {
  return (bits & ~DEFINED_FLAGS_MASK) !== 0;
}

/**
 * The 50-byte common header.
 *
 * Identifiers are carried as canonical UUID strings and encoded to 16 bytes
 * each by the serializer.
 */
export interface PacketHeader {
  readonly magic: number;
  readonly protocolVersion: number;
  readonly packetType: PacketTypeId;
  readonly flags: PacketFlags;
  /** Canonical UUID (§3, §5: 16 bytes). */
  readonly sessionId: string;
  /** Canonical UUID. `NIL_UUID` when the packet belongs to no single file. */
  readonly fileId: string;
  readonly packetIndex: number;
  readonly totalPackets: number;
  readonly payloadLength: number;
}

export interface PacketHeaderInput {
  readonly protocolVersion: number;
  readonly packetType: PacketTypeId;
  readonly sessionId: string;
  readonly packetIndex: number;
  readonly totalPackets: number;
  readonly payloadLength: number;
  readonly fileId?: string;
  readonly flags?: PacketFlags;
}

function requireUint(value: number, max: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new AppError(ErrorCode.INVALID_PACKET, `Header field "${field}" is out of range.`, {
      details: { field, value, max },
    });
  }
}

/**
 * Creates a header, enforcing every field's width from PACKET_SPEC §5.
 *
 * A header that exists is a header that fits on the wire: the protocol version
 * is one byte, the counters are four, and both identifiers are UUIDs.
 */
export function createPacketHeader(input: PacketHeaderInput): PacketHeader {
  requireUint(input.protocolVersion, UINT8_MAX, 'protocolVersion');
  requireUint(input.packetIndex, UINT32_MAX, 'packetIndex');
  requireUint(input.totalPackets, UINT32_MAX, 'totalPackets');
  requireUint(input.payloadLength, UINT32_MAX, 'payloadLength');

  if (!isKnownPacketType(input.packetType)) {
    throw new AppError(ErrorCode.INVALID_PACKET, 'Unknown packet type.', {
      details: { packetType: input.packetType },
    });
  }

  const fileId = input.fileId ?? NIL_UUID;

  if (!isUuid(input.sessionId)) {
    throw new AppError(ErrorCode.INVALID_PACKET, 'Header sessionId must be a UUID.');
  }

  if (!isUuid(fileId)) {
    throw new AppError(ErrorCode.INVALID_PACKET, 'Header fileId must be a UUID.');
  }

  return Object.freeze({
    magic: MAGIC_NUMBER,
    protocolVersion: input.protocolVersion,
    packetType: input.packetType,
    flags: input.flags ?? noFlags,
    sessionId: input.sessionId,
    fileId,
    packetIndex: input.packetIndex,
    totalPackets: input.totalPackets,
    payloadLength: input.payloadLength,
  });
}

/** Whether the header's file id is the nil UUID, i.e. it belongs to no file. */
export function hasFile(header: PacketHeader): boolean {
  return header.fileId !== NIL_UUID;
}

/** Structural equality. */
export function headerEquals(left: PacketHeader, right: PacketHeader): boolean {
  return (
    left.magic === right.magic &&
    left.protocolVersion === right.protocolVersion &&
    left.packetType === right.packetType &&
    left.sessionId === right.sessionId &&
    left.fileId === right.fileId &&
    left.packetIndex === right.packetIndex &&
    left.totalPackets === right.totalPackets &&
    left.payloadLength === right.payloadLength &&
    flagsToBits(left.flags) === flagsToBits(right.flags)
  );
}
