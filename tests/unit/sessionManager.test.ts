/**
 * SessionManager (PRO-001) — PROTOCOL_SPEC §7.4, §8; docs/API_SPEC.md §4.
 *
 * The clock and the id generator are injected, so every test below is
 * deterministic: no timers, no randomness, no waiting.
 */
import { AppError } from '@core/errors';
import {
  createSessionManager,
  DEFAULT_SESSION_TIMEOUT_MS,
  TransitionRefusal,
  type SessionManager,
} from '@core/session/sessionManager';
import type { IdGenerator } from '@core/contracts';
import { protocolVersion, sessionId } from '@domain/ids';
import { Capability, SessionState } from '@domain/session';

const VERSION = protocolVersion(1);

/** A controllable clock, so timeout behaviour is exact rather than flaky. */
function makeClock(start = 1_700_000_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** Deterministic UUID generator, satisfying the IdGenerator contract. */
function makeIdSource(): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
  };
}

/** An IdGenerator that always returns the same value. */
const fixedIds = (value: string): IdGenerator => ({ next: () => value });

function makeManager(overrides: Partial<Parameters<typeof createSessionManager>[0]> = {}) {
  const clock = makeClock();
  const manager = createSessionManager({
    clock,
    idGenerator: makeIdSource(),
    protocolVersion: VERSION,
    ...overrides,
  });

  return { manager, clock };
}

describe('createSession (§8.4, §7.4)', () => {
  it('creates a session in the Created state (§8.8)', () => {
    const { manager } = makeManager();

    expect(manager.createSession().state).toBe(SessionState.Created);
  });

  it('assigns a unique id to every session (§3.4, §8.17.2)', () => {
    const { manager } = makeManager();
    const ids = new Set([
      manager.createSession().id,
      manager.createSession().id,
      manager.createSession().id,
    ]);

    expect(ids.size).toBe(3);
  });

  it("stamps the manager's protocol version (§7.4)", () => {
    const { manager } = makeManager();

    expect(manager.createSession().protocolVersion).toBe(VERSION);
  });

  it('records the creation time from the injected clock', () => {
    const clock = makeClock(5000);
    const manager = createSessionManager({
      clock,
      idGenerator: makeIdSource(),
      protocolVersion: VERSION,
    });

    expect(manager.createSession().createdAt).toBe(5000);
  });

  it('carries the capabilities the session was created with (§8.7)', () => {
    const { manager } = makeManager();
    const session = manager.createSession({
      capabilities: [Capability.Recovery, Capability.Compression],
    });

    expect(session.capabilities).toEqual([Capability.Compression, Capability.Recovery]);
  });

  it('rejects a generator that does not produce a UUID', () => {
    const { manager } = makeManager({ idGenerator: fixedIds('session-1') });

    // PACKET_SPEC §5 carries the id in 16 bytes; failing here beats failing
    // at serialization time.
    expect(() => manager.createSession()).toThrow(AppError);
  });

  it('rejects a generator that repeats an id', () => {
    // A repeated id would silently merge two transfers (§8.11).
    const { manager } = makeManager({
      idGenerator: fixedIds('00000000-0000-4000-8000-000000000001'),
    });

    manager.createSession();
    expect(() => manager.createSession()).toThrow(AppError);
  });
});

describe('lookup (API_SPEC §4)', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = makeManager().manager;
  });

  it('returns a session by id', () => {
    const session = manager.createSession();

    expect(manager.getSession(session.id)).toEqual(session);
  });

  it('returns undefined for an unknown id', () => {
    expect(manager.getSession(sessionId('99999999-9999-4999-8999-999999999999'))).toBeUndefined();
  });

  it('reports whether a session is transmitting (§8.8)', () => {
    const session = manager.createSession();

    expect(manager.isSessionActive(session.id)).toBe(false);

    manager.transition(session.id, SessionState.Waiting);
    manager.transition(session.id, SessionState.Handshake);
    manager.transition(session.id, SessionState.Active);

    expect(manager.isSessionActive(session.id)).toBe(true);
  });

  it('reports an unknown session as inactive rather than throwing', () => {
    expect(manager.isSessionActive(sessionId('99999999-9999-4999-8999-999999999999'))).toBe(false);
  });
});

describe('transitions (§8.3)', () => {
  it('advances a session and returns the new value', () => {
    const { manager } = makeManager();
    const session = manager.createSession();

    const result = manager.transition(session.id, SessionState.Waiting);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.state).toBe(SessionState.Waiting);
      expect(result.session.id).toBe(session.id);
    }
  });

  it('keeps the session id immutable across transitions (§8.5)', () => {
    const { manager } = makeManager();
    const session = manager.createSession();

    manager.transition(session.id, SessionState.Waiting);
    manager.transition(session.id, SessionState.Handshake);

    expect(manager.getSession(session.id)?.id).toBe(session.id);
    expect(manager.getSession(session.id)?.createdAt).toBe(session.createdAt);
  });

  it('refuses an illegal transition instead of throwing', () => {
    const { manager } = makeManager();
    const session = manager.createSession();

    const result = manager.transition(session.id, SessionState.Active);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(TransitionRefusal.IllegalTransition);
    }
  });

  it('leaves the session untouched when a transition is refused', () => {
    const { manager } = makeManager();
    const session = manager.createSession();

    manager.transition(session.id, SessionState.Active);

    expect(manager.getSession(session.id)?.state).toBe(SessionState.Created);
  });

  it('refuses to transition a terminal session (§8.17.8, §8.17.9)', () => {
    const { manager } = makeManager();
    const session = manager.createSession();
    manager.closeSession(session.id);

    const result = manager.transition(session.id, SessionState.Waiting);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(TransitionRefusal.SessionTerminal);
    }
  });

  it('refuses to transition an unknown session', () => {
    const { manager } = makeManager();

    const result = manager.transition(
      sessionId('99999999-9999-4999-8999-999999999999'),
      SessionState.Waiting,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(TransitionRefusal.UnknownSession);
    }
  });
});

describe('isolation (§8.11)', () => {
  it('accepts a packet carrying its own session id', () => {
    const { manager } = makeManager();
    const session = manager.createSession();

    expect(manager.acceptsPacketFrom(session.id, session.id)).toBe(true);
  });

  it('rejects a packet from another session', () => {
    const { manager } = makeManager();
    const first = manager.createSession();
    const second = manager.createSession();

    // §8.11: packets belonging to one session SHALL NEVER be accepted into
    // another.
    expect(manager.acceptsPacketFrom(first.id, second.id)).toBe(false);
    expect(manager.acceptsPacketFrom(second.id, first.id)).toBe(false);
  });

  it('rejects packets once the session has expired (§8.10)', () => {
    const { manager } = makeManager();
    const session = manager.createSession();

    expect(manager.acceptsPacketFrom(session.id, session.id)).toBe(true);

    manager.closeSession(session.id);

    expect(manager.acceptsPacketFrom(session.id, session.id)).toBe(false);
  });

  it('rejects packets for an unknown session', () => {
    const { manager } = makeManager();
    const unknown = sessionId('99999999-9999-4999-8999-999999999999');

    expect(manager.acceptsPacketFrom(unknown, unknown)).toBe(false);
  });
});

describe('timeout and expiration (§8.9, §8.10)', () => {
  it('expires a session idle for longer than the timeout', () => {
    const { manager, clock } = makeManager();
    const session = manager.createSession();

    clock.advance(DEFAULT_SESSION_TIMEOUT_MS + 1);
    const expired = manager.expireIdleSessions();

    expect(expired).toHaveLength(1);
    expect(manager.getSession(session.id)?.state).toBe(SessionState.Expired);
  });

  it('leaves a session inside the timeout alone', () => {
    const { manager, clock } = makeManager();
    const session = manager.createSession();

    clock.advance(DEFAULT_SESSION_TIMEOUT_MS - 1);

    expect(manager.expireIdleSessions()).toHaveLength(0);
    expect(manager.getSession(session.id)?.state).toBe(SessionState.Created);
  });

  it('restarts the countdown on protocol activity (§8.9)', () => {
    const { manager, clock } = makeManager();
    const session = manager.createSession();

    clock.advance(DEFAULT_SESSION_TIMEOUT_MS - 1);
    expect(manager.touch(session.id)).toBe(true);

    clock.advance(2);

    expect(manager.expireIdleSessions()).toHaveLength(0);
  });

  it('treats a state transition as activity', () => {
    const { manager, clock } = makeManager();
    const session = manager.createSession();

    clock.advance(DEFAULT_SESSION_TIMEOUT_MS - 1);
    manager.transition(session.id, SessionState.Waiting);
    clock.advance(2);

    expect(manager.expireIdleSessions()).toHaveLength(0);
  });

  it('honours a configured timeout', () => {
    const clock = makeClock();
    const manager = createSessionManager({
      clock,
      idGenerator: makeIdSource(),
      protocolVersion: VERSION,
      timeoutMs: 1000,
    });
    manager.createSession();

    clock.advance(1001);

    expect(manager.expireIdleSessions()).toHaveLength(1);
  });

  it.each([0, -1, Number.NaN])('rejects a timeout of %p', (timeoutMs) => {
    expect(() =>
      createSessionManager({
        clock: makeClock(),
        idGenerator: makeIdSource(),
        protocolVersion: VERSION,
        timeoutMs,
      }),
    ).toThrow(AppError);
  });

  it('does not re-expire an already terminal session', () => {
    const { manager, clock } = makeManager();
    const session = manager.createSession();
    manager.closeSession(session.id);

    clock.advance(DEFAULT_SESSION_TIMEOUT_MS + 1);

    expect(manager.expireIdleSessions()).toHaveLength(0);
  });

  it('holds no timer of its own — nothing expires until asked', () => {
    const { manager, clock } = makeManager();
    const session = manager.createSession();

    clock.advance(DEFAULT_SESSION_TIMEOUT_MS * 10);

    // Scheduling belongs to the layer above; the engine stays deterministic.
    expect(manager.getSession(session.id)?.state).toBe(SessionState.Created);
  });
});

describe('termination (§8.14)', () => {
  it('expires a live session', () => {
    const { manager } = makeManager();
    const session = manager.createSession();

    expect(manager.closeSession(session.id)?.state).toBe(SessionState.Expired);
  });

  it('leaves a completed session completed', () => {
    const { manager } = makeManager();
    const session = manager.createSession();

    manager.transition(session.id, SessionState.Waiting);
    manager.transition(session.id, SessionState.Handshake);
    manager.transition(session.id, SessionState.Active);
    manager.transition(session.id, SessionState.Completed);

    expect(manager.closeSession(session.id)?.state).toBe(SessionState.Completed);
  });

  it('returns undefined for an unknown session', () => {
    const { manager } = makeManager();

    expect(manager.closeSession(sessionId('99999999-9999-4999-8999-999999999999'))).toBeUndefined();
  });

  it('releases terminal sessions and keeps live ones (§8.10)', () => {
    const { manager } = makeManager();
    const closed = manager.createSession();
    const live = manager.createSession();
    manager.closeSession(closed.id);

    const released = manager.releaseTerminated();

    expect(released).toEqual([closed.id]);
    expect(manager.getSession(closed.id)).toBeUndefined();
    expect(manager.getSession(live.id)).toBeDefined();
  });

  it('does not reuse a released session id — a new transfer creates a new session (§8.15)', () => {
    const { manager } = makeManager();
    const first = manager.createSession();
    manager.closeSession(first.id);
    manager.releaseTerminated();

    expect(manager.createSession().id).not.toBe(first.id);
  });
});

describe('concurrent sessions (§8.12)', () => {
  it('keeps each session independent', () => {
    const { manager } = makeManager();
    const first = manager.createSession();
    const second = manager.createSession();

    manager.transition(first.id, SessionState.Waiting);

    expect(manager.getSession(first.id)?.state).toBe(SessionState.Waiting);
    expect(manager.getSession(second.id)?.state).toBe(SessionState.Created);
  });

  it('expires one session without affecting another', () => {
    const { manager, clock } = makeManager();
    const stale = manager.createSession();

    clock.advance(DEFAULT_SESSION_TIMEOUT_MS - 10);
    const fresh = manager.createSession();
    clock.advance(20);

    const expired = manager.expireIdleSessions();

    expect(expired.map((session) => session.id)).toEqual([stale.id]);
    expect(manager.getSession(fresh.id)?.state).toBe(SessionState.Created);
  });

  it('lists every session it holds', () => {
    const { manager } = makeManager();
    manager.createSession();
    manager.createSession();

    expect(manager.listSessions()).toHaveLength(2);
  });
});
