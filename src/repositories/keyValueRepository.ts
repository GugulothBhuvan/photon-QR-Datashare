/**
 * Generic repository backed by a key-value storage adapter (ARC-003).
 *
 * Proves the pattern end to end in Phase 1: a repository depends on a storage
 * *port*, never on a platform SDK (planning/DEPENDENCIES.md §4).
 *
 * Serialization and validation are injected rather than assumed, so a stored
 * record that no longer parses is a domain decision — this module never
 * guesses at a shape.
 */
import { AppError, ErrorCode } from '@utils/errors';

import type { KeyValueStore } from '@storage/ports';

import type { Repository } from './repository';

export interface EntityCodec<TId, TEntity> {
  /** Stable id for an entity. Used to derive its storage key. */
  readonly idOf: (entity: TEntity) => TId;
  /** Serializes for storage. */
  readonly encode: (entity: TEntity) => string;
  /**
   * Parses a stored record.
   *
   * Returns `undefined` for anything it does not recognise; the repository
   * treats that as a corrupt record rather than crashing the caller.
   */
  readonly decode: (raw: string) => TEntity | undefined;
}

export interface KeyValueRepositoryOptions<TId, TEntity> {
  /** Adapter to persist through. Injected — never constructed here. */
  readonly store: KeyValueStore;
  /** Key prefix isolating this repository's records from every other's. */
  readonly namespace: string;
  readonly codec: EntityCodec<TId, TEntity>;
}

/**
 * Creates a repository over a key-value store.
 *
 * Records are stored under `<namespace>:<id>`, so one adapter can back many
 * repositories without collision.
 */
export function createKeyValueRepository<TId, TEntity>(
  options: KeyValueRepositoryOptions<TId, TEntity>,
): Repository<TId, TEntity> {
  const { store, namespace, codec } = options;
  const prefix = `${namespace}:`;

  const keyFor = (id: TId): string => `${prefix}${String(id)}`;
  const ownKeys = (): readonly string[] => store.keys().filter((key) => key.startsWith(prefix));

  function decodeOrThrow(key: string, raw: string): TEntity {
    const entity = codec.decode(raw);

    if (entity === undefined) {
      throw new AppError(ErrorCode.STORAGE_ERROR, `Corrupt record at "${key}".`, {
        details: { key },
      });
    }

    return entity;
  }

  return {
    async get(id) {
      const key = keyFor(id);
      const raw = store.get(key);
      return raw === undefined ? undefined : decodeOrThrow(key, raw);
    },

    async getAll() {
      const entities: TEntity[] = [];

      for (const key of ownKeys()) {
        const raw = store.get(key);
        if (raw !== undefined) {
          entities.push(decodeOrThrow(key, raw));
        }
      }

      return entities;
    },

    async save(entity) {
      store.set(keyFor(codec.idOf(entity)), codec.encode(entity));
    },

    async delete(id) {
      store.delete(keyFor(id));
    },

    async clear() {
      for (const key of ownKeys()) {
        store.delete(key);
      }
    },
  };
}
