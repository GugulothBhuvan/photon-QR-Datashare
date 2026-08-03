/**
 * Session model (MOD-001) — PROTOCOL_SPEC §3.3, §8.
 */
import { protocolVersion, sessionId } from '@domain/ids';
import {
  Capability,
  createSession,
  hasCapability,
  sessionEquals,
  SessionState,
  withState,
} from '@domain/session';
import { AppError } from '@utils/errors';

const baseInput = {
  id: sessionId('s-1'),
  protocolVersion: protocolVersion(1),
  createdAt: 1_700_000_000_000,
};

describe('createSession', () => {
  it('starts in the Created state (§8.8)', () => {
    expect(createSession(baseInput).state).toBe(SessionState.Created);
  });

  it('accepts an explicit state', () => {
    expect(createSession({ ...baseInput, state: SessionState.Active }).state).toBe(
      SessionState.Active,
    );
  });

  it('is frozen', () => {
    const session = createSession(baseInput);

    expect(Object.isFrozen(session)).toBe(true);
    (session as { state: SessionState }).state = SessionState.Expired;
    expect(session.state).toBe(SessionState.Created);
  });

  it('is deterministic — no clock is read', () => {
    const first = createSession(baseInput);
    const second = createSession(baseInput);

    expect(sessionEquals(first, second)).toBe(true);
    expect(first.createdAt).toBe(baseInput.createdAt);
  });

  it('rejects an invalid creation timestamp', () => {
    expect(() => createSession({ ...baseInput, createdAt: -1 })).toThrow(AppError);
    expect(() => createSession({ ...baseInput, createdAt: Number.NaN })).toThrow(AppError);
  });

  describe('capabilities', () => {
    it('defaults to none', () => {
      expect(createSession(baseInput).capabilities).toEqual([]);
    });

    it('deduplicates and sorts, so declaration order does not affect identity', () => {
      const first = createSession({
        ...baseInput,
        capabilities: [Capability.Recovery, Capability.Compression, Capability.Recovery],
      });
      const second = createSession({
        ...baseInput,
        capabilities: [Capability.Compression, Capability.Recovery],
      });

      expect(first.capabilities).toEqual([Capability.Compression, Capability.Recovery]);
      expect(sessionEquals(first, second)).toBe(true);
    });

    it('reports membership', () => {
      const session = createSession({ ...baseInput, capabilities: [Capability.Encryption] });

      expect(hasCapability(session, Capability.Encryption)).toBe(true);
      expect(hasCapability(session, Capability.Compression)).toBe(false);
    });
  });
});

describe('withState', () => {
  it('returns a new session and leaves the original untouched', () => {
    const session = createSession(baseInput);
    const active = withState(session, SessionState.Active);

    expect(active.state).toBe(SessionState.Active);
    expect(session.state).toBe(SessionState.Created);
    expect(active).not.toBe(session);
  });

  it('preserves identity — the session id is immutable for its lifetime (§8.5)', () => {
    const session = createSession(baseInput);
    const active = withState(session, SessionState.Active);

    expect(active.id).toBe(session.id);
    expect(active.createdAt).toBe(session.createdAt);
    expect(active.protocolVersion).toBe(session.protocolVersion);
  });

  it('returns the same reference when the state is unchanged', () => {
    const session = createSession(baseInput);
    expect(withState(session, SessionState.Created)).toBe(session);
  });

  it("does not judge whether a transition is legal — that is the engine's job", () => {
    // Completed -> Active violates §8.17.8, and this value object deliberately
    // does not know that. The session FSM enforces it in a later phase.
    const completed = createSession({ ...baseInput, state: SessionState.Completed });
    expect(withState(completed, SessionState.Active).state).toBe(SessionState.Active);
  });
});

describe('sessionEquals', () => {
  it('compares structurally', () => {
    expect(sessionEquals(createSession(baseInput), createSession(baseInput))).toBe(true);
  });

  it.each([
    ['id', { id: sessionId('s-2') }],
    ['state', { state: SessionState.Active }],
    ['createdAt', { createdAt: 1 }],
    ['protocolVersion', { protocolVersion: protocolVersion(2) }],
  ])('detects a difference in %s', (_label, change) => {
    expect(
      sessionEquals(createSession(baseInput), createSession({ ...baseInput, ...change })),
    ).toBe(false);
  });

  it('detects a difference in capabilities', () => {
    expect(
      sessionEquals(
        createSession(baseInput),
        createSession({ ...baseInput, capabilities: [Capability.Recovery] }),
      ),
    ).toBe(false);
  });
});
