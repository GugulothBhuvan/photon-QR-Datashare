/**
 * SessionRegistry — storage for live sessions.
 *
 * Holds each session together with the timestamp of its last protocol
 * activity, which PROTOCOL_SPEC §8.9 uses to start the timeout countdown.
 * That timestamp is bookkeeping, not part of what a session *is*, which is why
 * it lives here rather than in the `Session` value object.
 *
 * The registry stores and retrieves. Which transitions are legal (§8.3), when
 * a session has timed out (§8.9), and whether a packet may be accepted (§8.11)
 * are the SessionManager's questions, not this module's.
 */
import type { SessionId } from '@domain/ids';
import type { Session } from '@domain/session';

import { createRegistry, type Registry } from './registry';

/** A session and when it last saw protocol activity. */
export interface SessionEntry {
  readonly session: Session;
  /** Epoch milliseconds of the last activity (§8.9). */
  readonly lastActivityAt: number;
}

export interface SessionRegistry {
  /** The entry for a session, or `undefined`. */
  get(id: SessionId): SessionEntry | undefined;

  /** The session itself, or `undefined`. */
  getSession(id: SessionId): Session | undefined;

  /** Whether the session is held. */
  has(id: SessionId): boolean;

  /** Stores a session and its activity timestamp, replacing any earlier value. */
  record(session: Session, lastActivityAt: number): void;

  /**
   * Stores a session only if its id is free.
   *
   * @returns `false` when the id is already taken — which, per §8.17.2, means
   *   a generator produced a duplicate.
   */
  recordIfAbsent(session: Session, lastActivityAt: number): boolean;

  /** Forgets a session. Returns whether one was removed. */
  delete(id: SessionId): boolean;

  /** Every session, newest first. */
  sessions(): readonly Session[];

  /** Every entry, oldest first. */
  entries(): readonly SessionEntry[];

  /** How many sessions are held. */
  size(): number;

  /** Forgets every session. */
  clear(): void;
}

/** Creates an empty session registry. */
export function createSessionRegistry(): SessionRegistry {
  const registry: Registry<SessionId, SessionEntry> = createRegistry();

  const entry = (session: Session, lastActivityAt: number): SessionEntry =>
    Object.freeze({ session, lastActivityAt });

  return {
    get(id) {
      return registry.get(id);
    },

    getSession(id) {
      return registry.get(id)?.session;
    },

    has(id) {
      return registry.has(id);
    },

    record(session, lastActivityAt) {
      registry.set(session.id, entry(session, lastActivityAt));
    },

    recordIfAbsent(session, lastActivityAt) {
      return registry.setIfAbsent(session.id, entry(session, lastActivityAt));
    },

    delete(id) {
      return registry.delete(id);
    },

    sessions() {
      return registry
        .values()
        .map((held) => held.session)
        .reverse();
    },

    entries() {
      return registry.values();
    },

    size() {
      return registry.size();
    },

    clear() {
      registry.clear();
    },
  };
}
