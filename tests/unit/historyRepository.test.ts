/**
 * Transfer history (A12-03) — UI_SPEC §5.5; ADR-0007.
 *
 * §5.5 specifies no ordering, no retention and no record shape, so ADR-0007
 * decided all three. These pin the decisions rather than the wiring: the
 * key-value repository underneath has its own suite and is not retested here.
 */
import {
  TransferDirection,
  TransferOutcome,
  describeRecord,
  isFullyVerified,
  type TransferRecord,
} from '@domain/history';
import type { SessionId } from '@domain/ids';
import {
  createHistoryRepository,
  parseRecord,
  HISTORY_LIMIT,
} from '@repositories/historyRepository';
import { createMemoryKeyValueStore } from '@storage/memoryKeyValueStore';

function record(id: string, completedAt: number, overrides: Partial<TransferRecord> = {}) {
  return {
    sessionId: id as SessionId,
    direction: TransferDirection.Receive,
    outcome: TransferOutcome.Completed,
    completedAt,
    files: [{ name: `${id}.bin`, size: 10, verified: true }],
    totalBytes: 10,
    ...overrides,
  } satisfies TransferRecord;
}

describe('history retention and ordering (ADR-0007)', () => {
  it('returns the newest transfer first', async () => {
    // Storage order is insertion order, which is the opposite of what a
    // transfer log is for.
    const history = createHistoryRepository({ store: createMemoryKeyValueStore() });

    await history.save(record('a', 1_000));
    await history.save(record('b', 3_000));
    await history.save(record('c', 2_000));

    expect((await history.recent()).map((entry) => entry.sessionId)).toEqual(['b', 'c', 'a']);
  });

  it('orders ties deterministically rather than by storage order', async () => {
    // Two transfers completing in the same millisecond must not swap places
    // between reads.
    const history = createHistoryRepository({ store: createMemoryKeyValueStore() });

    await history.save(record('a', 5_000));
    await history.save(record('b', 5_000));

    const first = (await history.recent()).map((entry) => entry.sessionId);
    const second = (await history.recent()).map((entry) => entry.sessionId);

    expect(first).toEqual(second);
  });

  it('keeps only the most recent records and drops the oldest', async () => {
    const limit = 3;
    const history = createHistoryRepository({ store: createMemoryKeyValueStore(), limit });

    for (let index = 0; index < 6; index += 1) {
      await history.save(record(`s${String(index)}`, index * 1_000));
    }

    const kept = (await history.recent()).map((entry) => entry.sessionId);

    expect(kept).toEqual(['s5', 's4', 's3']);
    // Pruned on write, not merely hidden on read.
    expect(await history.get('s0' as SessionId)).toBeUndefined();
  });

  it('prunes on write so a device that never opens History does not grow forever', async () => {
    const store = createMemoryKeyValueStore();
    const history = createHistoryRepository({ store, limit: 2 });

    for (let index = 0; index < 5; index += 1) {
      await history.save(record(`s${String(index)}`, index * 1_000));
    }

    // Nothing has read the log; the store must already be bounded.
    expect(store.keys()).toHaveLength(2);
  });

  it('replaces a record with the same session id rather than duplicating it', async () => {
    const history = createHistoryRepository({ store: createMemoryKeyValueStore() });

    await history.save(record('a', 1_000));
    await history.save(record('a', 2_000));

    expect(await history.recent()).toHaveLength(1);
  });

  it('keeps a hundred by default', () => {
    expect(HISTORY_LIMIT).toBe(100);
  });
});

describe('history record parsing', () => {
  it('round-trips a record', () => {
    const original = record('a', 1_000);

    expect(parseRecord(JSON.stringify(original))).toEqual(original);
  });

  it('refuses a record with an outcome this build does not define', () => {
    // A record written by a later build must not surface as a transfer that
    // did not happen.
    expect(parseRecord(JSON.stringify({ ...record('a', 1), outcome: 'PARTIAL' }))).toBeUndefined();
  });

  it('refuses a record whose files are malformed', () => {
    // One bad file rejects the record rather than producing one with holes.
    const malformed = { ...record('a', 1), files: [{ name: 'x.bin' }] };

    expect(parseRecord(JSON.stringify(malformed))).toBeUndefined();
  });

  it('refuses text that is not a record', () => {
    expect(parseRecord('[]')).toBeUndefined();
    expect(parseRecord('not json')).toBeUndefined();
  });
});

describe('record description', () => {
  it('names a single-file transfer by its file', () => {
    expect(describeRecord(record('a', 1))).toBe('a.bin');
  });

  it('counts a multi-file transfer', () => {
    const many = record('a', 1, {
      files: [
        { name: 'one.bin', size: 1 },
        { name: 'two.bin', size: 2 },
      ],
    });

    expect(describeRecord(many)).toBe('2 files');
  });

  it('treats a sent file with no verification as verified, and a failed one as not', () => {
    // A sender computes the digest the receiver checks, so there is nothing
    // for it to verify — which is different from a check that ran and failed.
    const sent = record('a', 1, {
      direction: TransferDirection.Send,
      files: [{ name: 'x.bin', size: 1 }],
    });

    expect(isFullyVerified(sent)).toBe(true);
    expect(
      isFullyVerified(record('a', 1, { files: [{ name: 'x', size: 1, verified: false }] })),
    ).toBe(false);
  });

  it('does not call an unfinished transfer verified', () => {
    const unknown = record('a', 1, { outcome: TransferOutcome.Unknown });

    expect(isFullyVerified(unknown)).toBe(false);
  });
});
