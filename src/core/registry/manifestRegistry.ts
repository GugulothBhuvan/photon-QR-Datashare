/**
 * ManifestRegistry — storage for accepted manifests.
 *
 * PROTOCOL_SPEC §10.14 requires a receiver to retain a validated manifest for
 * the duration of its session; this is where it is retained.
 *
 * Storage only. The rules that a manifest is immutable once accepted (§10.9)
 * and SHALL NOT be regenerated during an active session (§10.14) are protocol
 * semantics, enforced by the ManifestManager. This registry offers
 * `setIfAbsent` so the manager can express that rule without reaching for a
 * `Map`, but it does not decide the rule.
 */
import type { SessionId } from '@domain/ids';
import type { Manifest } from '@domain/manifest';

import { createRegistry, type Registry } from './registry';

export interface ManifestRegistry {
  /** The manifest held for a session, or `undefined`. */
  get(id: SessionId): Manifest | undefined;

  /** Whether a manifest is held for a session. */
  has(id: SessionId): boolean;

  /** Stores a manifest, replacing any already held for its session. */
  set(manifest: Manifest): void;

  /**
   * Stores a manifest only if the session has none.
   *
   * @returns `false` when one is already held.
   */
  setIfAbsent(manifest: Manifest): boolean;

  /** Forgets the manifest held for a session. */
  delete(id: SessionId): boolean;

  /** Every manifest held, in insertion order. */
  values(): readonly Manifest[];

  /** How many manifests are held. */
  size(): number;

  /** Forgets every manifest. */
  clear(): void;
}

/** Creates an empty manifest registry. */
export function createManifestRegistry(): ManifestRegistry {
  const registry: Registry<SessionId, Manifest> = createRegistry();

  return {
    get(id) {
      return registry.get(id);
    },

    has(id) {
      return registry.has(id);
    },

    set(manifest) {
      registry.set(manifest.sessionId, manifest);
    },

    setIfAbsent(manifest) {
      return registry.setIfAbsent(manifest.sessionId, manifest);
    },

    delete(id) {
      return registry.delete(id);
    },

    values() {
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
