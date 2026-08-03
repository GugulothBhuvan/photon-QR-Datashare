/**
 * Protocol identifiers.
 *
 * Identifiers are branded strings: `SessionId` and `FileId` are both strings at
 * runtime, but the compiler refuses to substitute one for the other. Passing a
 * file id where a session id belongs is exactly the class of mistake that
 * causes cross-session packet mixing, which PROTOCOL_SPEC §8.11 calls a
 * protocol violation.
 *
 * Every identifier is created through a factory that enforces its invariant, so
 * an identifier that exists is an identifier that is valid.
 */
import { AppError, ErrorCode } from '@core/errors';

declare const brand: unique symbol;

type Branded<TValue, TBrand extends string> = TValue & { readonly [brand]: TBrand };

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
 * Modelled as a number because §3.29 defines it as numeric. PROTOCOL_SPEC §23
 * defines the version *format* and is not read until the negotiation work in a
 * later phase; if it refines this into a structured value, this type changes
 * with it.
 */
export type ProtocolVersion = Branded<number, 'ProtocolVersion'>;

function requireNonEmpty(value: string, label: string): void {
  if (value.length === 0 || value.trim().length === 0) {
    throw new AppError(ErrorCode.INVALID_CONFIGURATION, `${label} must not be empty.`, {
      details: { label },
    });
  }
}

/** Creates a `SessionId`. Throws when the value is empty or blank. */
export function sessionId(value: string): SessionId {
  requireNonEmpty(value, 'SessionId');
  return value as SessionId;
}

/** Creates a `TransferId`. Throws when the value is empty or blank. */
export function transferId(value: string): TransferId {
  requireNonEmpty(value, 'TransferId');
  return value as TransferId;
}

/** Creates a `FileId`. Throws when the value is empty or blank. */
export function fileId(value: string): FileId {
  requireNonEmpty(value, 'FileId');
  return value as FileId;
}

/** Creates a `ProtocolVersion`. Throws unless the value is a non-negative integer. */
export function protocolVersion(value: number): ProtocolVersion {
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'ProtocolVersion must be a non-negative integer.',
      { details: { value } },
    );
  }
  return value as ProtocolVersion;
}
