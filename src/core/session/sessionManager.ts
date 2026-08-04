/**
 * SessionManager (PRO-001) — PROTOCOL_SPEC §7.4, §8; docs/API_SPEC.md §4.
 *
 * Owns the lifetime of sessions: creation (§8.4), state transitions (§8.3),
 * timeout (§8.9), expiration (§8.10), isolation (§8.11), concurrency (§8.12)
 * and termination (§8.14).
 *
 * Three things this deliberately is not:
 *
 * - **Not transport-aware.** Nothing here knows about QR codes, cameras or
 *   frames. §8 describes sessions in terms of protocol state only, and the
 *   engine stays transport-agnostic.
 * - **Not a clock.** `now` and `generateSessionId` are injected. A manager
 *   that read `Date.now()` or `crypto.randomUUID()` directly could not be
 *   tested deterministically, and PROTOCOL_SPEC §2.4 requires deterministic
 *   behaviour.
 * - **Not an event publisher.** Core may not import the event bus. The manager
 *   reports what happened in its return values, and the service layer above it
 *   turns those into events.
 *
 * Persistence is likewise absent: §8.15 says a session MAY persist for history,
 * which is an application concern owned by a repository.
 */
import { AppError, ErrorCode } from '@core/errors';

import {
  createSession,
  SessionState,
  withState,
  type Capability,
  type Session,
} from '@domain/session';
import { sessionId as toSessionId, type ProtocolVersion, type SessionId } from '@domain/ids';

import { createSessionRegistry, type SessionRegistry } from '@core/registry/sessionRegistry';

import { canTransition, isActive, isLive, isTerminal } from './transitions';

/**
 * Default session timeout.
 *
 * §8.9 states that timeout values MAY be implementation-specific, so this is a
 * choice rather than a protocol constant: fifteen minutes is long enough that a
 * user fumbling with two phones does not lose a transfer, and short enough that
 * an abandoned session does not hold packet storage indefinitely (§8.10).
 */
export const DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1000;

export interface SessionManagerOptions {
  /** Epoch milliseconds. Injected so behaviour is deterministic under test. */
  readonly now: () => number;
  /**
   * Produces a globally unique session id (§8.4).
   *
   * Must return a UUID: PACKET_SPEC §5 gives the field 16 bytes. Injected
   * because generating one requires randomness, which the protocol engine
   * must not contain if it is to stay deterministic.
   */
  readonly generateSessionId: () => string;
  /** Protocol version new sessions are created with. */
  readonly protocolVersion: ProtocolVersion;
  /** Inactivity before a session expires (§8.9). */
  readonly timeoutMs?: number;
  /**
   * Where live sessions are held.
   *
   * Injected so the manager contains protocol semantics and the registry
   * contains storage. Defaults to a fresh in-memory registry.
   */
  readonly registry?: SessionRegistry;
}

export interface CreateSessionOptions {
  /** Capabilities enabled for this session (§8.4, §8.7). */
  readonly capabilities?: readonly Capability[];
}

/** Why a transition was refused. */
export const TransitionRefusal = {
  UnknownSession: 'UNKNOWN_SESSION',
  IllegalTransition: 'ILLEGAL_TRANSITION',
  SessionTerminal: 'SESSION_TERMINAL',
} as const;

export type TransitionRefusal = (typeof TransitionRefusal)[keyof typeof TransitionRefusal];

export type TransitionResult =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly reason: TransitionRefusal };

export interface SessionManager {
  /** Creates a session in the `Created` state (§8.4, §7.4). */
  createSession(options?: CreateSessionOptions): Session;

  /** The session with this id, or `undefined`. */
  getSession(id: SessionId): Session | undefined;

  /** Every session the manager holds, newest first. */
  listSessions(): readonly Session[];

  /** Whether the session exists and is transmitting (§8.8, API_SPEC §4). */
  isSessionActive(id: SessionId): boolean;

  /**
   * Moves a session to a new state, if §8.3 permits it.
   *
   * Refuses rather than throws: an illegal transition is a decision the caller
   * has to handle, not an exceptional condition.
   */
  transition(id: SessionId, to: SessionState): TransitionResult;

  /**
   * Records protocol activity, restarting the timeout countdown (§8.9).
   *
   * Returns `false` for an unknown or terminal session.
   */
  touch(id: SessionId): boolean;

  /**
   * Whether this session may accept a packet carrying `packetSessionId`.
   *
   * §8.11: packets belonging to one session SHALL NEVER be accepted into
   * another, and expired sessions SHALL reject incoming packets (§8.10).
   */
  acceptsPacketFrom(id: SessionId, packetSessionId: SessionId): boolean;

  /**
   * Expires every session idle for longer than the timeout (§8.9, §8.10).
   *
   * Called by the layer that owns scheduling; the engine holds no timers of
   * its own, which keeps it deterministic and transport-agnostic.
   *
   * @returns The sessions that expired.
   */
  expireIdleSessions(): readonly Session[];

  /**
   * Terminates a session (§8.14).
   *
   * Completed sessions become `Completed`; anything else becomes `Expired`.
   * Terminating an already-terminal session is a no-op.
   */
  closeSession(id: SessionId): Session | undefined;

  /** Forgets terminal sessions, releasing their bookkeeping (§8.10, §8.14). */
  releaseTerminated(): readonly SessionId[];
}

/**
 * Creates a session manager.
 *
 * Supports multiple concurrent sessions (§8.12); each keeps independent state
 * and one session's behaviour never affects another's.
 */
export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const { now, generateSessionId, protocolVersion } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'Session timeout must be a positive number of milliseconds.',
      { details: { timeoutMs } },
    );
  }

  const registry = options.registry ?? createSessionRegistry();

  return {
    createSession(createOptions = {}) {
      const raw = generateSessionId();
      // Fails loudly rather than producing a session that cannot be
      // serialized: PACKET_SPEC §5 carries the id in 16 bytes.
      const id = toSessionId(raw);

      // §8.17.2 and §3.4: the id uniquely identifies the transfer. A generator
      // that repeats would silently merge two transfers (§8.11).
      if (registry.has(id)) {
        throw new AppError(ErrorCode.INVALID_CONFIGURATION, 'Generated a duplicate session id.', {
          details: { sessionId: id },
        });
      }

      const timestamp = now();
      const session = createSession({
        id,
        protocolVersion,
        createdAt: timestamp,
        state: SessionState.Created,
        ...(createOptions.capabilities === undefined
          ? {}
          : { capabilities: createOptions.capabilities }),
      });

      registry.record(session, timestamp);
      return session;
    },

    getSession(id) {
      return registry.getSession(id);
    },

    listSessions() {
      return registry.sessions();
    },

    isSessionActive(id) {
      const record = registry.get(id);
      return record !== undefined && isActive(record.session.state);
    },

    transition(id, to) {
      const record = registry.get(id);

      if (record === undefined) {
        return { ok: false, reason: TransitionRefusal.UnknownSession };
      }

      const from = record.session.state;

      if (isTerminal(from)) {
        // §8.17.8: a completed session SHALL NOT return to Active.
        return { ok: false, reason: TransitionRefusal.SessionTerminal };
      }

      if (!canTransition(from, to)) {
        return { ok: false, reason: TransitionRefusal.IllegalTransition };
      }

      const session = withState(record.session, to);
      registry.record(session, now());

      return { ok: true, session };
    },

    touch(id) {
      const record = registry.get(id);

      if (record === undefined || isTerminal(record.session.state)) {
        return false;
      }

      registry.record(record.session, now());
      return true;
    },

    acceptsPacketFrom(id, packetSessionId) {
      const record = registry.get(id);

      if (record === undefined) {
        return false;
      }

      // §8.10: expired sessions reject incoming packets. §8.11: isolation is
      // enforced using the session id.
      return isLive(record.session.state) && record.session.id === packetSessionId;
    },

    expireIdleSessions() {
      const deadline = now() - timeoutMs;
      const expired: Session[] = [];

      for (const record of registry.entries()) {
        if (isTerminal(record.session.state) || record.lastActivityAt > deadline) {
          continue;
        }

        const session = withState(record.session, SessionState.Expired);
        registry.record(session, record.lastActivityAt);
        expired.push(session);
      }

      return expired;
    },

    closeSession(id) {
      const record = registry.get(id);

      if (record === undefined) {
        return undefined;
      }

      if (isTerminal(record.session.state)) {
        return record.session;
      }

      const session = withState(record.session, SessionState.Expired);
      registry.record(session, now());

      return session;
    },

    releaseTerminated() {
      const released: SessionId[] = [];

      for (const record of registry.entries()) {
        if (isTerminal(record.session.state)) {
          registry.delete(record.session.id);
          released.push(record.session.id);
        }
      }

      return released;
    },
  };
}
