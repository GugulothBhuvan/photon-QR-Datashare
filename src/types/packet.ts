/**
 * Packet — the smallest transferable protocol unit (MOD-002).
 *
 * PROTOCOL_SPEC §3.10–§3.15.
 *
 * **Domain model only.** A packet's binary layout — header fields, flags, CRC,
 * field widths — is specified in PACKET_SPEC.md and implemented in Phase 3.
 * Nothing here serializes, and nothing here knows a byte offset. What this
 * model captures is what a packet *is*: a payload that belongs to exactly one
 * session (§3.10) and sits at a known index within one file's sequence (§3.13).
 *
 * Packets are immutable (§3.12: payload contents remain unchanged throughout
 * transmission).
 */
import { AppError, ErrorCode } from '@core/errors';

import { type FileId, type SessionId } from './ids';

/**
 * Packet kinds.
 *
 * Attested by PROTOCOL_SPEC §8.5, which requires the Session ID in the
 * Manifest Packet, Data Packets and Recovery Packets, and by the mandatory
 * ordering in §10.10. §11.4 enumerates them formally and is read in the phase
 * that implements packet processing.
 */
export const PacketType = {
  Manifest: 'MANIFEST',
  Data: 'DATA',
  Recovery: 'RECOVERY',
} as const;

export type PacketType = (typeof PacketType)[keyof typeof PacketType];

export interface Packet {
  /** Every packet belongs to exactly one session (§3.10, §8.17.3). */
  readonly sessionId: SessionId;
  readonly type: PacketType;
  /**
   * The file this packet carries a chunk of.
   *
   * `undefined` for a manifest packet, which describes the transfer rather
   * than belonging to any one file.
   */
  readonly fileId: FileId | undefined;
  /** Zero-based position within the file's packet sequence (§3.13). */
  readonly index: number;
  /** A chunk of the original binary stream (§3.15), or the manifest's bytes. */
  readonly payload: Uint8Array;
  /** Convenience mirror of `payload.byteLength`. */
  readonly size: number;
}

export interface PacketInput {
  readonly sessionId: SessionId;
  readonly index: number;
  readonly payload: Uint8Array;
  readonly type?: PacketType;
  readonly fileId?: FileId;
}

/**
 * Creates a packet.
 *
 * The payload is **copied**, not referenced. Senders build packets from a
 * reused chunk buffer, and a packet that aliases that buffer would change
 * behind its owner's back — which §3.12 forbids.
 *
 * The returned object is frozen, so the reference cannot be swapped. The bytes
 * themselves are a `Uint8Array` and cannot be frozen; treat `payload` as
 * read-only, and use `copyPayload` when a caller needs a buffer it may write to.
 */
export function createPacket(input: PacketInput): Packet {
  if (!Number.isInteger(input.index) || input.index < 0) {
    throw new AppError(ErrorCode.INVALID_PACKET, 'Packet index must be a non-negative integer.', {
      details: { index: input.index },
    });
  }

  const type = input.type ?? PacketType.Data;

  // §3.13 places a packet index within a *file* transfer, so a data packet
  // without a file has no well-defined position.
  if (type === PacketType.Data && input.fileId === undefined) {
    throw new AppError(ErrorCode.INVALID_PACKET, 'A data packet must reference a file.', {
      details: { index: input.index },
    });
  }

  const payload = Uint8Array.from(input.payload);

  return Object.freeze({
    sessionId: input.sessionId,
    type,
    fileId: input.fileId,
    index: input.index,
    payload,
    size: payload.byteLength,
  });
}

/** Returns a copy of the payload, safe for the caller to mutate. */
export function copyPayload(packet: Packet): Uint8Array {
  return Uint8Array.from(packet.payload);
}

/**
 * Whether two packets occupy the same position in the same file of the same
 * session — the definition of a duplicate (§3.25).
 *
 * Deliberately does not compare payloads: a duplicate is identified by its
 * index, and whether its contents are also identical is an integrity question.
 */
export function isSamePosition(left: Packet, right: Packet): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.fileId === right.fileId &&
    left.type === right.type &&
    left.index === right.index
  );
}

/** Full structural equality, payload bytes included. */
export function packetEquals(left: Packet, right: Packet): boolean {
  if (!isSamePosition(left, right) || left.size !== right.size) {
    return false;
  }

  for (let i = 0; i < left.payload.length; i += 1) {
    if (left.payload[i] !== right.payload[i]) {
      return false;
    }
  }

  return true;
}
