/**
 * Repository layer over a storage adapter (ARC-003).
 *
 * Integration rather than unit: the point is that a repository collaborates
 * with a storage *port* and never with a platform SDK
 * (docs/ARCHITECTURE.md §6.8, planning/DEPENDENCIES.md §4).
 */
import { createKeyValueRepository, type EntityCodec } from '@repositories/index';
import { createMemoryKeyValueStore } from '@storage/index';
import { AppError, ErrorCode } from '@utils/errors';

interface HistoryEntry {
  readonly id: string;
  readonly fileName: string;
  readonly completedAt: number;
}

const codec: EntityCodec<string, HistoryEntry> = {
  idOf: (entry) => entry.id,
  encode: (entry) => JSON.stringify(entry),
  decode: (raw) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as HistoryEntry).id === 'string'
      ) {
        return parsed as HistoryEntry;
      }
      return undefined;
    } catch {
      return undefined;
    }
  },
};

function makeRepository(store = createMemoryKeyValueStore()) {
  return {
    store,
    repository: createKeyValueRepository({ store, namespace: 'history', codec }),
  };
}

const entry: HistoryEntry = { id: 'h1', fileName: 'photo.jpg', completedAt: 1_700_000_000 };

describe('createKeyValueRepository', () => {
  it('round-trips an entity through storage', async () => {
    const { repository } = makeRepository();

    await repository.save(entry);

    expect(await repository.get('h1')).toEqual(entry);
  });

  it('returns undefined for an absent entity rather than throwing', async () => {
    const { repository } = makeRepository();
    expect(await repository.get('missing')).toBeUndefined();
  });

  it('replaces on save, because entities are immutable', async () => {
    const { repository } = makeRepository();

    await repository.save(entry);
    await repository.save({ ...entry, fileName: 'renamed.jpg' });

    expect(await repository.getAll()).toHaveLength(1);
    expect((await repository.get('h1'))?.fileName).toBe('renamed.jpg');
  });

  it('lists only its own records', async () => {
    const store = createMemoryKeyValueStore();
    const { repository } = makeRepository(store);
    const other = createKeyValueRepository({ store, namespace: 'sessions', codec });

    await repository.save(entry);
    await other.save({ ...entry, id: 's1' });

    expect(await repository.getAll()).toEqual([entry]);
    expect(await other.getAll()).toHaveLength(1);
  });

  it('deletes an entity, and deleting an absent one is a no-op', async () => {
    const { repository } = makeRepository();

    await repository.save(entry);
    await repository.delete('h1');
    await expect(repository.delete('h1')).resolves.toBeUndefined();

    expect(await repository.get('h1')).toBeUndefined();
  });

  it('clear removes its own records but leaves other namespaces intact', async () => {
    const store = createMemoryKeyValueStore();
    const { repository } = makeRepository(store);
    const other = createKeyValueRepository({ store, namespace: 'sessions', codec });

    await repository.save(entry);
    await other.save({ ...entry, id: 's1' });
    await repository.clear();

    expect(await repository.getAll()).toEqual([]);
    expect(await other.getAll()).toHaveLength(1);
  });

  it('reports a corrupt record as a standardized storage error', async () => {
    const store = createMemoryKeyValueStore();
    const { repository } = makeRepository(store);

    store.set('history:h1', 'not json');

    await expect(repository.get('h1')).rejects.toThrow(AppError);
    await expect(repository.get('h1')).rejects.toMatchObject({
      code: ErrorCode.STORAGE_ERROR,
    });
  });

  it('hides storage keys from callers', async () => {
    const store = createMemoryKeyValueStore();
    const { repository } = makeRepository(store);

    await repository.save(entry);

    // The key shape is the repository's business; the caller only ever sees
    // domain objects.
    expect(store.keys()).toEqual(['history:h1']);
    expect(await repository.get('h1')).toEqual(entry);
  });
});
