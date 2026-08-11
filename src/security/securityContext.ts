/**
 * Session security context (SEC-002) — SECURITY.md §7, §8, §9.
 *
 * §7 requires every transfer to have an **independent** security context, that
 * security information is never shared across sessions, and that session
 * termination destroys temporary security state. §8 requires key management to
 * be isolated from protocol execution and keys never to be embedded in
 * packets. §9 asks that temporary data be deleted immediately after use.
 *
 * This module is that isolation, made structural:
 *
 * - A context is keyed by session id and reachable only by that id, so §7's
 *   "SHALL NOT be shared across Sessions" is not a rule anyone has to remember.
 * - Nothing here is reachable from the packet layer. The lint boundary stops
 *   `src/core` importing `@security/*` at all, so §8's "keys SHALL never be
 *   embedded in protocol packets" cannot be violated by an import.
 * - Destroying a context **overwrites its secret bytes before dropping the
 *   reference**, so the material does not sit in a buffer waiting for a
 *   garbage collector that may never run.
 *
 * **What this is not.** It is not secure storage. Secrets live in ordinary
 * memory, because no secure-storage capability exists in this build — the
 * platform's keystore needs a native module the technology stack does not list
 * (TRD §3). Recorded as A14-03. §9 says secrets SHOULD be stored securely,
 * which this does not yet satisfy; it says so rather than implying otherwise.
 */
import type { SessionId } from '@domain/ids';

/**
 * Secret material belonging to one session.
 *
 * Deliberately minimal: this build negotiates no keys (SI-012), so the only
 * thing a context carries today is the algorithm agreed for the session and
 * whatever bytes an application chose to associate with it. The shape exists so
 * that when a key exchange is specified, keys have somewhere to live that is
 * already isolated, already destroyed on termination, and already unreachable
 * from the protocol engine.
 */
export interface SessionSecrets {
  /** The encryption algorithm agreed for this session (§19.12). */
  readonly algorithm: string;
  /**
   * Key material, when a session has any.
   *
   * Held as bytes rather than a string because a string cannot be overwritten
   * in JavaScript — an immutable one would survive destruction.
   */
  readonly key?: Uint8Array;
}

export interface SecurityContextStore {
  /**
   * Establishes the context for a session (§19.7).
   *
   * @returns `false` when the session already has one. §19.12 requires
   *   negotiated parameters to stay unchanged for the session's lifetime, so
   *   replacing a context silently would break that invariant.
   */
  establish(session: SessionId, secrets: SessionSecrets): boolean;

  /** The context for a session, or `undefined` when none was established. */
  get(session: SessionId): SessionSecrets | undefined;

  /** Whether a session has a context. */
  has(session: SessionId): boolean;

  /**
   * Destroys a session's context (§7).
   *
   * Overwrites any key material before dropping it.
   *
   * @returns Whether a context was destroyed.
   */
  destroy(session: SessionId): boolean;

  /** Sessions currently holding a context. */
  sessions(): readonly SessionId[];

  /** Destroys every context. */
  destroyAll(): void;
}

/** Overwrites secret bytes in place, so the material does not linger. */
function wipe(secrets: SessionSecrets): void {
  secrets.key?.fill(0);
}

export function createSecurityContextStore(): SecurityContextStore {
  const contexts = new Map<SessionId, SessionSecrets>();

  return {
    establish(session, secrets) {
      if (contexts.has(session)) {
        return false;
      }

      contexts.set(session, secrets);
      return true;
    },

    get(session) {
      return contexts.get(session);
    },

    has(session) {
      return contexts.has(session);
    },

    destroy(session) {
      const secrets = contexts.get(session);

      if (secrets === undefined) {
        return false;
      }

      wipe(secrets);
      contexts.delete(session);
      return true;
    },

    sessions() {
      return [...contexts.keys()];
    },

    destroyAll() {
      for (const secrets of contexts.values()) {
        wipe(secrets);
      }

      contexts.clear();
    },
  };
}
