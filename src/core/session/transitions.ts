/**
 * Session state transitions (PRO-001) — PROTOCOL_SPEC §8.3, §8.8, §8.17.
 *
 * The transition table is separated from the manager for the same reason the
 * packet layout is separated from the serializer: the rules are a value that
 * can be inspected and tested on its own, and the manager is the thing that
 * applies them.
 *
 * §8.3 gives the lifecycle as a linear progression. It is not literally linear
 * in practice — §8.8 has Active returning from Paused via Resuming, and §8.9
 * lets a timeout expire a session from any live state — so this table encodes
 * what §8.8 and the §8.17 invariants describe, with §8.3 as the happy path.
 */
import { SessionState } from '@domain/session';

/**
 * States a session may move to from each state.
 *
 * Reasoning, per state:
 *
 * - `Created` → `Waiting` is §8.3's path; a session may also be terminated
 *   before it is ever advertised (§8.14, user cancellation).
 * - `Waiting` → `Handshake` when a receiver joins (§8.8).
 * - `Handshake` → `Active` on success (§8.8); back to `Waiting` if it fails
 *   without ending the session, since §8.8 has the sender waiting for
 *   receivers.
 * - `Active` → `Paused` (user pause), `Completed` (transfer done) or
 *   `Expired` (timeout) — the four exits §8.8 lists for Active.
 * - `Paused` → `Resuming` (§8.8) or `Expired` (§8.9).
 * - `Resuming` → `Active` on success, `Paused` if it does not take, or
 *   `Expired`.
 * - `Completed` and `Expired` are terminal: §8.17.8 forbids a completed
 *   session returning to Active, and §8.17.9 forbids reusing a terminated one.
 */
const ALLOWED: Readonly<Record<SessionState, readonly SessionState[]>> = Object.freeze({
  [SessionState.Created]: Object.freeze([SessionState.Waiting, SessionState.Expired]),
  [SessionState.Waiting]: Object.freeze([SessionState.Handshake, SessionState.Expired]),
  [SessionState.Handshake]: Object.freeze([
    SessionState.Active,
    SessionState.Waiting,
    SessionState.Expired,
  ]),
  [SessionState.Active]: Object.freeze([
    SessionState.Paused,
    SessionState.Completed,
    SessionState.Expired,
  ]),
  [SessionState.Paused]: Object.freeze([SessionState.Resuming, SessionState.Expired]),
  [SessionState.Resuming]: Object.freeze([
    SessionState.Active,
    SessionState.Paused,
    SessionState.Expired,
  ]),
  [SessionState.Completed]: Object.freeze([]),
  [SessionState.Expired]: Object.freeze([]),
});

/** Whether a session in `from` may move to `to`. */
export function canTransition(from: SessionState, to: SessionState): boolean {
  return ALLOWED[from].includes(to);
}

/** States reachable in one step from `state`. */
export function allowedTransitions(state: SessionState): readonly SessionState[] {
  return ALLOWED[state];
}

/**
 * Whether a session has finished for good.
 *
 * A terminal session accepts no further transitions and, per §8.17.9, is never
 * reused — a new transfer creates a new session (§8.15).
 */
export function isTerminal(state: SessionState): boolean {
  return ALLOWED[state].length === 0;
}

/**
 * Whether a session is live enough to carry protocol traffic.
 *
 * Only `Active` transmits packets (§8.8). This is the check that answers
 * `isSessionActive()` in docs/API_SPEC.md §4.
 */
export function isActive(state: SessionState): boolean {
  return state === SessionState.Active;
}

/**
 * Whether a session still occupies resources and can still be timed out.
 *
 * Every non-terminal state, since §8.9 lets a timeout invalidate a session
 * whenever protocol activity stops.
 */
export function isLive(state: SessionState): boolean {
  return !isTerminal(state);
}
