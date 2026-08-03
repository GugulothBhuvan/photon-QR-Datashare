/**
 * Protocol identifiers.
 *
 * Identifiers are branded UUID strings. Two properties matter:
 *
 * 1. **Branding.** `SessionId` and `FileId` are both strings at runtime, but
 *    the compiler refuses to substitute one for the other. Passing a file id
 *    where a session id belongs is exactly the mistake that causes
 *    cross-session packet mixing, which PROTOCOL_SPEC §8.11 calls a protocol
 *    violation.
 *
 * 2. **UUID shape.** PACKET_SPEC §5 gives the Session ID and File ID fields 16
 *    bytes each, encoded per §3 as UUIDs. The domain model matches the
 *    protocol: an identifier that cannot be put on the wire cannot be
 *    constructed at all, so the failure happens where the mistake is rather
 *    than at serialization time.
 *
 * Every identifier is created through a factory that enforces its invariant, so
 * an identifier that exists is an identifier that is valid.
 *
 * Generating identifiers is deliberately absent: it requires randomness, which
 * is not deterministic, so a generator is injected where one is needed.
 */
import { AppError, ErrorCode } from '@core/errors';

declare const brand: unique symbol;

type Branded<TValue, TBrand extends string> = TValue & { readonly [brand]: TBrand };

/**
 * Canonical UUID form: 8-4-4-4-12 lowercase hexadecimal.
 *
 * Version and variant bits are deliberately not checked. The protocol needs 16
 * unique bytes; it does not care how they were generated, and rejecting a v1 or
 * v7 UUID would exclude valid identifiers for no protocol reason.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The all-zero UUID, used where a 16-byte id field carries no value. */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Whether a string is a canonical 36-character UUID. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Globally unique identifier for a session (PROTOCOL_SPEC §3.4).
 *
 * Immutable for the lifetime of the transfer (§8.5).
 */
export type SessionId = Branded<string, 'SessionId'>;

/** Identifier for a transfer. Referenced by the manifest (§10.5). */
export type TransferId = Branded<string, 'TransferId'>;

/** Identifier for one file within a session. Unique per session (§10.15.5). */
export type FileId = Branded<string, 'FileId'>;

/**
 * Protocol version (PROTOCOL_SPEC §3.29): a numeric identifier for the
 * supported version of OSP.
 *
 * PACKET_SPEC §5 gives the field one byte, so the range is 0–255.
 */
export type ProtocolVersion = Branded<number, 'ProtocolVersion'>;

/** Largest protocol version the one-byte header field can carry. */
export const MAX_PROTOCOL_VERSION = 255;

function requireUuid(value: string, label: string): void {
  if (!isUuid(value)) {
    throw new AppError(ErrorCode.INVALID_CONFIGURATION, `${label} must be a UUID.`, {
      details: { label, length: value.length },
    });
  }
}

/**
 * Creates a `SessionId`.
 *
 * Normalises to lowercase so that two spellings of the same UUID are the same
 * identifier — session isolation (§8.11) is enforced by comparing these.
 */
export function sessionId(value: string): SessionId {
  requireUuid(value, 'SessionId');
  return value.toLowerCase() as SessionId;
}

/** Creates a `TransferId`. Throws unless the value is a UUID. */
export function transferId(value: string): TransferId {
  requireUuid(value, 'TransferId');
  return value.toLowerCase() as TransferId;
}

/** Creates a `FileId`. Throws unless the value is a UUID. */
export function fileId(value: string): FileId {
  requireUuid(value, 'FileId');
  return value.toLowerCase() as FileId;
}

/** Creates a `ProtocolVersion`. Throws unless the value fits the header field. */
export function protocolVersion(value: number): ProtocolVersion {
  if (!Number.isInteger(value) || value < 0 || value > MAX_PROTOCOL_VERSION) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      `ProtocolVersion must be an integer between 0 and ${MAX_PROTOCOL_VERSION}.`,
      { details: { value } },
    );
  }
  return value as ProtocolVersion;
}
