/**
 * Session transition rules (PRO-001) — PROTOCOL_SPEC §8.3, §8.8, §8.17.
 */
import { SessionState } from '@domain/session';
import {
  allowedTransitions,
  canTransition,
  isActive,
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
