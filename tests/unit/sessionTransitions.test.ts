/**
 * Session transition rules (PRO-001) — PROTOCOL_SPEC §8.3, §8.8, §8.17.
 */
import { SessionState } from '@domain/session';
import {
  allowedTransitions,
  canTransition,
  isActive,
  isInterrupted,
  isLive,
  isTerminal,
} from '@core/session/transitions';

const ALL_STATES = Object.values(SessionState);

describe('the §8.3 happy path', () => {
  it.each([
    [SessionState.Created, SessionState.Waiting],
    [SessionState.Waiting, SessionState.Handshake],
    [SessionState.Handshake, SessionState.Active],
    [SessionState.Active, SessionState.Paused],
    [SessionState.Paused, SessionState.Resuming],
    [SessionState.Resuming, SessionState.Active],
    [SessionState.Active, SessionState.Completed],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
});

describe('reconciliation with §26.4 and STATE_MACHINES.md §6', () => {
  it('permits every transition §26.4 lists as allowed', () => {
    // The explicit allowed-transition list from the Session FSM. `Idle` is
    // omitted: §7.3 has no protocol state in Idle, so it is the absence of a
    // session rather than a state a Session can hold.
    const fsm: readonly (readonly [SessionState, SessionState])[] = [
      [SessionState.Created, SessionState.Waiting],
      [SessionState.Waiting, SessionState.Handshake],
      [SessionState.Handshake, SessionState.Active],
      [SessionState.Active, SessionState.Paused],
      [SessionState.Active, SessionState.Completed],
      [SessionState.Active, SessionState.Expired],
      [SessionState.Paused, SessionState.Active],
      [SessionState.Paused, SessionState.Expired],
    ];

    for (const [from, to] of fsm) {
      expect({ from, to, allowed: canTransition(from, to) }).toEqual({
        from,
        to,
        allowed: true,
      });
    }
  });

  it('allows Paused to reach Active directly, as §26.4 requires', () => {
    expect(canTransition(SessionState.Paused, SessionState.Active)).toBe(true);
  });

  it('also keeps the Resuming route §8.3 and §8.8 define', () => {
    expect(canTransition(SessionState.Paused, SessionState.Resuming)).toBe(true);
    expect(canTransition(SessionState.Resuming, SessionState.Active)).toBe(true);
  });

  it('lets a session expire before any receiver joins (§8.9)', () => {
    // §26.4 lists only Active and Paused expiring, but §8.9 says a session
    // SHALL terminate on timeout without qualifying the state, and a SHALL
    // outranks an unkeyworded list under §4.6.
    expect(canTransition(SessionState.Created, SessionState.Expired)).toBe(true);
    expect(canTransition(SessionState.Waiting, SessionState.Expired)).toBe(true);
    expect(canTransition(SessionState.Handshake, SessionState.Expired)).toBe(true);
  });

  it('reports an interrupted session, which is what Resume acts on (§8.8)', () => {
    expect(isInterrupted(SessionState.Paused)).toBe(true);
    expect(isInterrupted(SessionState.Active)).toBe(false);
    expect(isInterrupted(SessionState.Resuming)).toBe(false);
  });
});

describe('terminal states', () => {
  it.each([SessionState.Completed, SessionState.Expired])('%s is terminal', (state) => {
    expect(isTerminal(state)).toBe(true);
    expect(allowedTransitions(state)).toEqual([]);
  });

  it.each([
    SessionState.Created,
    SessionState.Waiting,
    SessionState.Handshake,
    SessionState.Active,
    SessionState.Paused,
    SessionState.Resuming,
  ])('%s is live', (state) => {
    expect(isTerminal(state)).toBe(false);
    expect(isLive(state)).toBe(true);
  });

  it('forbids a completed session returning to Active (§8.17.8)', () => {
    expect(canTransition(SessionState.Completed, SessionState.Active)).toBe(false);
  });

  it('forbids reusing a terminated session (§8.17.9)', () => {
    for (const to of ALL_STATES) {
      expect(canTransition(SessionState.Expired, to)).toBe(false);
      expect(canTransition(SessionState.Completed, to)).toBe(false);
    }
  });
});

describe('timeout reachability (§8.9)', () => {
  it('lets every live state expire', () => {
    const live = ALL_STATES.filter((state) => isLive(state));

    for (const state of live) {
      expect(canTransition(state, SessionState.Expired)).toBe(true);
    }
  });
});

describe('illegal transitions', () => {
  it.each([
    ['skipping the handshake', SessionState.Waiting, SessionState.Active],
    ['transmitting before a receiver joins', SessionState.Created, SessionState.Active],
    ['completing without transmitting', SessionState.Created, SessionState.Completed],
    ['resuming a session that was never paused', SessionState.Active, SessionState.Resuming],
    [
      'returning to Waiting from Handshake, which §26.4 does not allow',
      SessionState.Handshake,
      SessionState.Waiting,
    ],
    ['pausing before active', SessionState.Handshake, SessionState.Paused],
    ['completing from paused', SessionState.Paused, SessionState.Completed],
  ])('refuses %s', (_label, from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('refuses a self-transition', () => {
    for (const state of ALL_STATES) {
      expect(canTransition(state, state)).toBe(false);
    }
  });
});

describe('isActive', () => {
  it('is true only for Active — only Active transmits packets (§8.8)', () => {
    for (const state of ALL_STATES) {
      expect(isActive(state)).toBe(state === SessionState.Active);
    }
  });
});

describe('the table itself', () => {
  it('covers every state', () => {
    for (const state of ALL_STATES) {
      expect(allowedTransitions(state)).toBeDefined();
    }
  });

  it('never lists a state as its own successor', () => {
    for (const state of ALL_STATES) {
      expect(allowedTransitions(state)).not.toContain(state);
    }
  });

  it('is frozen, so the rules cannot drift at run time', () => {
    expect(Object.isFrozen(allowedTransitions(SessionState.Active))).toBe(true);
  });
});
