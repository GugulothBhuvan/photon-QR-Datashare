/**
 * Transfer history (A12-03) — UI_SPEC §5.5; ADR-0007.
 *
 * §5.5 requires History to exist and lists its controls. It says nothing about
 * what a record contains, in what order records are returned, or how long one
 * is kept. Those are product decisions, recorded in ADR-0007 and implemented
 * here rather than left implicit.
 *
 * Two of them are load-bearing:
 *
 * - **Newest first.** §5.5 shows a list without specifying its order. Storage
 *   order is insertion order, which is the opposite of what a user wants from
 *   a transfer log.
 * - **The most recent `HISTORY_LIMIT` records are kept.** Unbounded history
 *   grows without limit on a device with no way to prune it; a time-based
 *   policy would need a clock and would delete records on a schedule the user
 *   never sees. A count is predictable and needs no clock.
 */
import type { KeyValueStore } from '@storage/ports';
import type { SessionId } from '@domain/ids';
import {
  TransferDirection,
  TransferOutcome,
  type HistoryFile,
  type TransferRecord,
} from '@domain/history';

import { createKeyValueRepository } from './keyValueRepository';
import type { Repository } from './repository';

/**
 * How many transfers are kept.
 *
 * Far more than a user will scroll and small enough that the whole log is a
 * few kilobytes. See ADR-0007.
 */
export const HISTORY_LIMIT = 100;

/** The namespace history records are stored under. */
export const HISTORY_NAMESPACE = 'history';

const DIRECTIONS = new Set<string>(Object.values(TransferDirection));
const OUTCOMES = new Set<string>(Object.values(TransferOutcome));

/**
 * Parses one stored file entry, or `undefined` if it is not one.
 *
 * Split out so a single malformed file rejects its whole record rather than
 * producing a record with holes in it.
 */
function parseFile(value: unknown): HistoryFile | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const file = value as Partial<HistoryFile>;

  if (typeof file.name !== 'string' || typeof file.size !== 'number') {
    return undefined;
  }

  return {
    name: file.name,
    size: file.size,
    ...(typeof file.verified === 'boolean' ? { verified: file.verified } : {}),
    ...(typeof file.savedTo === 'string' ? { savedTo: file.savedTo } : {}),
  };
}

/**
 * Parses a stored record.
 *
 * Returns `undefined` for anything unrecognised. A record written by a later
 * build, or half-written, must not surface as a transfer that did not happen.
 */
export function parseRecord(raw: string): TransferRecord | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }

  const record = parsed as Partial<TransferRecord>;

  if (
    typeof record.sessionId !== 'string' ||
    typeof record.completedAt !== 'number' ||
    typeof record.totalBytes !== 'number' ||
    typeof record.direction !== 'string' ||
    !DIRECTIONS.has(record.direction) ||
    typeof record.outcome !== 'string' ||
    !OUTCOMES.has(record.outcome) ||
    !Array.isArray(record.files)
  ) {
    return undefined;
  }

  const files: HistoryFile[] = [];

  for (const entry of record.files) {
    const file = parseFile(entry);

    if (file === undefined) {
      return undefined;
    }

    files.push(file);
  }

  return {
    sessionId: record.sessionId as SessionId,
    direction: record.direction as TransferDirection,
    outcome: record.outcome as TransferOutcome,
    completedAt: record.completedAt,
    totalBytes: record.totalBytes,
    files,
  };
}

export interface HistoryRepository extends Repository<SessionId, TransferRecord> {
  /**
   * Every record, newest first, capped at `HISTORY_LIMIT`.
   *
   * Named separately from `getAll` because `Repository` documents its ordering
   * as implementation defined, and History depends on this one.
   */
  recent(): Promise<readonly TransferRecord[]>;
}

export interface HistoryRepositoryOptions {
  readonly store: KeyValueStore;
  /** Overrides the retention limit. Present so a test need not write 100 records. */
  readonly limit?: number;
}

/**
 * Creates the history repository.
 *
 * Pruning happens on write rather than on read: a user opening History should
 * not pay for records they are about to be shown none of, and a log that
 * prunes only when read grows without bound on a device that never opens it.
 */
export function createHistoryRepository(options: HistoryRepositoryOptions): HistoryRepository {
  const { store, limit = HISTORY_LIMIT } = options;

  const records = createKeyValueRepository<SessionId, TransferRecord>({
    store,
    namespace: HISTORY_NAMESPACE,
    codec: {
      idOf: (record) => record.sessionId,
      encode: (record) => JSON.stringify(record),
      decode: parseRecord,
    },
  });

  /** Newest first. Ties break on session id so the order is total. */
  function byNewest(left: TransferRecord, right: TransferRecord): number {
    return (
      right.completedAt - left.completedAt || String(right.sessionId).localeCompare(left.sessionId)
    );
  }

  async function sorted(): Promise<readonly TransferRecord[]> {
    return [...(await records.getAll())].sort(byNewest);
  }

  return {
    get: records.get,
    getAll: records.getAll,
    delete: records.delete,
    clear: records.clear,

    async save(record) {
      await records.save(record);

      const all = await sorted();

      // Only the records past the limit are removed, so a save costs one
      // deletion in the steady state rather than a rewrite of the log.
      for (const stale of all.slice(limit)) {
        await records.delete(stale.sessionId);
      }
    },

    async recent() {
      return (await sorted()).slice(0, limit);
    },
  };
}
