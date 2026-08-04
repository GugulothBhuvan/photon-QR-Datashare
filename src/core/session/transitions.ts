/**
 * Session state transitions (PRO-001, reconciled in PRO-004) —
 * PROTOCOL_SPEC §8.3, §8.8, §8.9, §26.4 and docs/STATE_MACHINES.md §6.
 *
 * The transition table is separated from the manager for the same reason the
 * packet layout is separated from the serializer: the rules are a value that
 * can be inspected and tested on its own, and the manager applies them.
 *
 * ## Reconciling three descriptions
 *
 * Three documents describe this machine and they do not agree:
 *
 * | Source | States | Notes |
 * | --- | --- | --- |
 * | §8.3, §8.8 | Created, Waiting, Handshake, Active, Paused, Resuming, Completed, Expired | Narrative; defines each state's meaning |
 * | §26.4 Session FSM | Idle, Created, Waiting, Handshake, Active, Paused, Completed, Expired | Explicit allowed-transition list; **no Resuming**, `Paused → Active` direct |
 * | STATE_MACHINES.md §6 | Created, Handshake, Active, Paused, Resumed, Completed, Expired | Linear chain; **no Waiting**, and "Resumed" rather than "Resuming" |
 *
 * Resolved as follows:
 *
 * 1. **PROTOCOL_SPEC wins over STATE_MACHINES.md.** AGENTS.md §3 makes
 *    PROTOCOL_SPEC the canonical source of protocol behaviour and forbids
 *    redefining it elsewhere. STATE_MACHINES.md §6's omission of `Waiting` and
 *    its "Resumed" spelling are therefore not authoritative.
 *
 * 2. **§26.4's explicit allowed list is honoured in full.** Every transition it
 *    permits is permitted here, including `Paused → Active` directly.
 *
 * 3. **`Resuming` is kept.** §8.8 defines it with distinct semantics ("only
 *    missing packets SHALL require further transmission") and §8.3 lists it in
 *    the lifecycle. §26.4 omitting it is read as the FSM showing the shortest
 *    path, not as deleting a state that §8.8 defines. Both routes out of
 *    `Paused` are therefore allowed.
 *
 * 4. **Every live state may expire.** §26.4 lists only `Active → Expired` and
 *    `Paused → Expired`, but §8.9 states that a session **SHALL** terminate
 *    automatically after exceeding its timeout, with no qualification by state.
 *    Under the §4.6 precedence rule — a SHALL outranks an unkeyworded list — the
 *    §8.9 requirement governs. Without it, a session abandoned before any
 *    receiver joined could never expire, which §8.10 plainly does not intend.
 *
 * 5. **`Idle` is not a `SessionState`.** §26.4 starts at `Idle → Created`, but
 *    §7.3 describes Idle as the phase in which "no protocol state exists" and
 *    "no active session". A session that does not exist has no state; Idle is
 *    modelled as the absence of a session in the registry, not as a value the
 *    `Session` model can hold.
 *
 * Changes from the pre-reconciliation table are recorded in
 * docs/IMPLEMENTATION_NOTES.md (A4-01, A4-02).
 */
import { SessionState } from '@domain/session';

/**
 * States a session may move to from each state.
 *
 * Per-state reasoning:
 *
 * - `Created → Waiting` (§26.4).
 * - `Waiting → Handshake` (§26.4), when a receiver joins.
 * - `Handshake → Active` (§26.4), on success.
 * - `Active → Paused | Completed | Expired` (§26.4), the exits §8.8 lists.
 * - `Paused → Active` (§26.4) or `Paused → Resuming` (§8.3, §8.8).
 * - `Resuming → Active` (§8.8), once communication is restored.
 * - Every live state may also expire (§8.9; see note 4 above).
 * - `Completed` and `Expired` are terminal (§26.4, §8.17.8, §8.17.9).
 */
const ALLOWED: Readonly<Record<SessionState, readonly SessionState[]>> = Object.freeze({
  [SessionState.Created]: Object.freeze([SessionState.Waiting, SessionState.Expired]),
  [SessionState.Waiting]: Object.freeze([SessionState.Handshake, SessionState.Expired]),
  [SessionState.Handshake]: Object.freeze([SessionState.Active, SessionState.Expired]),
  [SessionState.Active]: Object.freeze([
    SessionState.Paused,
    SessionState.Completed,
    SessionState.Expired,
  ]),
  [SessionState.Paused]: Object.freeze([
    SessionState.Resuming,
    SessionState.Active,
    SessionState.Expired,
  ]),
  [SessionState.Resuming]: Object.freeze([SessionState.Active, SessionState.Expired]),
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

/**
 * Whether a session is interrupted and could be resumed.
 *
 * §8.8 has `Paused` preserving previously validated packets and discarding no
 * session information, which is the state the Resume Protocol acts on.
 */
export function isInterrupted(state: SessionState): boolean {
  return state === SessionState.Paused;
}
