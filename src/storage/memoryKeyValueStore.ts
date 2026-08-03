/**
 * In-memory key-value store.
 *
 * A real adapter that happens to have no platform dependency. It backs the
 * repository tests, and it is the default registration until the MMKV adapter
 * lands, so the composition root is never left holding a null.
 */
import type { KeyValueStore } from './ports';

export function createMemoryKeyValueStore(
  seed: Readonly<Record<string, string>> = {},
): KeyValueStore {
  const entries = new Map<string, string>(Object.entries(seed));

  return {
    get(key) {
      return entries.get(key);
    },

    set(key, value) {
      entries.set(key, value);
    },

    delete(key) {
      entries.delete(key);
    },

    keys() {
      return [...entries.keys()];
    },

    clear() {
      entries.clear();
    },
  };
}
