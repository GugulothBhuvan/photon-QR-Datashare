/**
 * A single stored value, backed by a key-value adapter (ARC-003).
 *
 * The `ValueRepository` counterpart to `createKeyValueRepository`. Settings are
 * the case it exists for: one record, no id, no collection.
 *
 * Validation is injected, so a stored value that no longer satisfies the
 * application's rules is a domain decision rather than a guess made here. A
 * record written by an older build, or edited by hand, falls back to the
 * default instead of propagating a shape the application would reject later.
 */
import type { KeyValueStore } from '@storage/ports';

import type { ValueRepository } from './repository';

export interface ValueCodec<TValue> {
  readonly encode: (value: TValue) => string;
  /** Parses a stored record. `undefined` for anything unrecognised. */
  readonly decode: (raw: string) => TValue | undefined;
}

export interface ValueRepositoryOptions<TValue> {
  readonly store: KeyValueStore;
  /** The key this value is stored under. */
  readonly key: string;
  readonly codec: ValueCodec<TValue>;
  /** Returned when nothing is stored, or when what is stored does not parse. */
  readonly defaultValue: TValue;
  /**
   * Called when a stored record could not be parsed.
   *
   * Reported rather than swallowed: falling back to defaults is the right
   * behaviour, but doing it silently is how a serialization bug survives a
   * release.
   */
  readonly onUnreadable?: (raw: string) => void;
}

export function createValueRepository<TValue>(
  options: ValueRepositoryOptions<TValue>,
): ValueRepository<TValue> {
  const { store, key, codec, defaultValue, onUnreadable } = options;

  return {
    async get() {
      const raw = store.get(key);

      if (raw === undefined) {
        return defaultValue;
      }

      const decoded = codec.decode(raw);

      if (decoded === undefined) {
        onUnreadable?.(raw);
        return defaultValue;
      }

      return decoded;
    },

    async set(value) {
      store.set(key, codec.encode(value));
    },

    async clear() {
      store.delete(key);
    },
  };
}
