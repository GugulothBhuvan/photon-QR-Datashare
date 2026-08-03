/**
 * Session — one logical transfer context (MOD-001).
 *
 * PROTOCOL_SPEC §3.3, §8.
 *
 * This is the *value* of a session: its identity, negotiated parameters and
 * current lifecycle state. PROTOCOL_SPEC §8.7 also lists mutable, accumulating
 * members of the Session Context — packet statistics, the packet map, the
 * stored manifest. Those are managed state, owned by the SessionManager in a
 * later phase; putting them here would make a value object that is never equal
 * to itself twice.
 *
 * State transitions are likewise not implemented here: §8.3 defines the
 * lifecycle, and the state machine that walks it belongs to the protocol
 * engine. `withState` produces a new value and enforces no ordering.
 */
import { AppError, ErrorCode } from '@core/errors';

import { type ProtocolVersion, type SessionId } from './ids';

/**
 * Session lifecycle states (PROTOCOL_SPEC §8.3, §8.8).
 *
 * A session SHALL occupy exactly one state at any time (§8.3).
 */
export const SessionState = {
  Created: 'CREATED',
  Waiting: 'WAITING',
  Handshake: 'HANDSHAKE',
  Active: 'ACTIVE',
  Paused: 'PAUSED',
  Resuming: 'RESUMING',
  Completed: 'COMPLETED',
  Expired: 'EXPIRED',
} as const;

export type SessionState = (typeof SessionState)[keyof typeof SessionState];

/**
 * Protocol features an implementation supports (PROTOCOL_SPEC §3.28).
 *
 * The four members are the examples §3.28 gives. Capabilities are exchanged
 * during session establishment; this type only names them.
 */
export const Capability = {
  Compression: 'COMPRESSION',
  Encryption: 'ENCRYPTION',
  Recovery: 'RECOVERY',
  AdaptiveTransport: 'ADAPTIVE_TRANSPORT',
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

export interface Session {
  /** Immutable for the session's lifetime (§8.5). */
  readonly id: SessionId;
  readonly protocolVersion: ProtocolVersion;
  readonly state: SessionState;
  /** Capabilities active for this session (§8.7), sorted and deduplicated. */
  readonly capabilities: readonly Capability[];
  /** Creation time in epoch milliseconds. Supplied by the caller, never read from a clock. */
  readonly createdAt: number;
}

export interface SessionInput {
  readonly id: SessionId;
  readonly protocolVersion: ProtocolVersion;
  readonly createdAt: number;
  /** Defaults to `Created`, the state a new session begins in (§8.8). */
  readonly state?: SessionState;
  readonly capabilities?: readonly Capability[];
}

/**
 * Creates a session.
 *
 * `createdAt` is a parameter rather than a `Date.now()` call: a factory that
 * reads a clock is not deterministic, and PROTOCOL_SPEC §2.4 requires
 * deterministic behaviour.
 */
export function createSession(input: SessionInput): Session {
  if (!Number.isFinite(input.createdAt) || input.createdAt < 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'Session createdAt must be a non-negative timestamp.',
      { details: { createdAt: input.createdAt } },
    );
  }

  // Sorted and deduplicated so that two sessions negotiating the same
  // capabilities compare equal regardless of the order they were listed in.
  const capabilities = [...new Set(input.capabilities ?? [])].sort();

  return Object.freeze({
    id: input.id,
    protocolVersion: input.protocolVersion,
    state: input.state ?? SessionState.Created,
    capabilities: Object.freeze(capabilities),
    createdAt: input.createdAt,
  });
}

/**
 * Returns a session in a new state.
 *
 * Whether a transition is legal is a protocol question (§8.3, and the session
 * FSM), answered by the protocol engine — not by a value object.
 */
export function withState(session: Session, state: SessionState): Session {
  return state === session.state ? session : Object.freeze({ ...session, state });
}

/** Whether a session has the given capability. */
export function hasCapability(session: Session, capability: Capability): boolean {
  return session.capabilities.includes(capability);
}

/** Structural equality. */
export function sessionEquals(left: Session, right: Session): boolean {
  return (
    left.id === right.id &&
    left.protocolVersion === right.protocolVersion &&
    left.state === right.state &&
    left.createdAt === right.createdAt &&
    left.capabilities.length === right.capabilities.length &&
    left.capabilities.every((capability, index) => capability === right.capabilities[index])
  );
}
