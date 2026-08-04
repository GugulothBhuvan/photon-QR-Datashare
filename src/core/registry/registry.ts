/**
 * In-memory registry.
 *
 * A registry is where a protocol manager keeps the things it is currently
 * responsible for. Managers own protocol *semantics*; registries own *storage*
 * of live protocol state, so a manager never contains `Map` plumbing and a
 * registry never contains a protocol rule.
 *
 * **In-memory only, deliberately.** This is not the repository layer. A
 * registry holds state for the lifetime of a session and nothing longer;
 * durable storage lives behind `src/repositories` and is reached by the layers
 * above the protocol engine. Keeping the engine free of persistence is what
 * lets it stay deterministic and testable with nothing mocked.
 */

export interface Registry<TKey, TValue> {
  /** The value stored under `key`, or `undefined`. */
  get(key: TKey): TValue | undefined;

  /** Whether anything is stored under `key`. */
  has(key: TKey): boolean;

  /** Stores `value`, replacing anything already under `key`. */
  set(key: TKey, value: TValue): void;

  /**
   * Stores `value` only if `key` is free.
   *
   * @returns `true` when it was stored, `false` when the key was taken.
   */
  setIfAbsent(key: TKey, value: TValue): boolean;

  /** Removes `key`. Returns whether anything was removed. */
  delete(key: TKey): boolean;

  /** Every key, in insertion order. */
  keys(): readonly TKey[];

  /** Every value, in insertion order. */
  values(): readonly TValue[];

  /** Every entry, in insertion order. */
  entries(): readonly (readonly [TKey, TValue])[];

  /** How many entries are held. */
  size(): number;

  /** Removes everything. */
  clear(): void;
}

/** Creates an empty registry. */
export function createRegistry<TKey, TValue>(): Registry<TKey, TValue> {
  const entries = new Map<TKey, TValue>();

  return {
    get(key) {
      return entries.get(key);
    },

    has(key) {
      return entries.has(key);
    },

    set(key, value) {
      entries.set(key, value);
    },

    setIfAbsent(key, value) {
      if (entries.has(key)) {
        return false;
      }
      entries.set(key, value);
      return true;
    },

    delete(key) {
      return entries.delete(key);
    },

    keys() {
      return [...entries.keys()];
    },

    values() {
      return [...entries.values()];
    },

    entries() {
      return [...entries.entries()];
    },

    size() {
      return entries.size;
    },

    clear() {
      entries.clear();
    },
  };
}
