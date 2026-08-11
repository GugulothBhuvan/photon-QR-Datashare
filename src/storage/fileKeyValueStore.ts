/**
 * Key-value storage backed by a single text file.
 *
 * Settings and history are lost on every launch without this: the composition
 * root has only ever registered the in-memory store, so the `ValueRepository`
 * abstraction persisted nothing.
 *
 * **Why one file rather than one per key.** `KeyValueStore` is synchronous
 * (see `ports.ts`), and every device filesystem is asynchronous at the point
 * where it matters. Reading the whole record once and keeping it in memory is
 * what makes a synchronous port honest: `get` never touches the disk, and
 * `set` writes the whole file through. The records here are preferences and a
 * transfer log — kilobytes — so rewriting the file per mutation costs less
 * than the machinery to avoid it would.
 *
 * The platform binding is injected as a `TextFile` rather than required here,
 * so the policy below — load once, write through, survive corruption — is
 * exercised in Node with no device present. `createDeviceKeyValueStore` in
 * `deviceStorage.ts` supplies the real file.
 */
import { AppError, ErrorCode } from '@core/errors';

import type { KeyValueStore } from './ports';

/**
 * The smallest thing a key-value store needs from a filesystem.
 *
 * Deliberately not `FileStore`: that port is asynchronous and byte-oriented,
 * for transferred content. This is one small text document, read and written
 * whole.
 */
export interface TextFile {
  /** Current contents, or `undefined` when the file does not exist yet. */
  read(): string | undefined;
  write(text: string): void;
}

/** What a stored record looks like on disk. */
interface StoredRecord {
  readonly version: number;
  readonly entries: Record<string, string>;
}

/**
 * Storage format version.
 *
 * Present from the first release so a later change can migrate rather than
 * discard. A file without it is not this format and is not read.
 */
export const STORE_FORMAT_VERSION = 1;

/**
 * Parses a stored file.
 *
 * Returns `undefined` for anything unrecognised — a missing file, a truncated
 * write, or a future version. The caller decides what that means; this
 * function does not guess.
 */
export function parseStore(raw: string | undefined): Map<string, string> | undefined {
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }

  const record = parsed as Partial<StoredRecord>;

  if (record.version !== STORE_FORMAT_VERSION) {
    return undefined;
  }

  if (typeof record.entries !== 'object' || record.entries === null) {
    return undefined;
  }

  const entries = new Map<string, string>();

  for (const [key, value] of Object.entries(record.entries)) {
    // A record whose values are not strings is not this format. Coercing would
    // hand a repository a shape its codec never wrote.
    if (typeof value !== 'string') {
      return undefined;
    }

    entries.set(key, value);
  }

  return entries;
}

/** Serializes for storage. */
export function serializeStore(entries: ReadonlyMap<string, string>): string {
  return JSON.stringify({
    version: STORE_FORMAT_VERSION,
    entries: Object.fromEntries(entries),
  } satisfies StoredRecord);
}

export interface FileKeyValueStoreOptions {
  readonly file: TextFile;
  /**
   * Called when the stored file could not be read.
   *
   * The store starts empty in that case rather than refusing to load, because
   * a corrupt preferences file must not stop the application launching. It is
   * reported rather than swallowed: silently resetting a user's settings with
   * no explanation is how a storage bug goes unnoticed for months.
   */
  readonly onCorrupt?: (raw: string) => void;
}

/**
 * Creates a key-value store persisted to one text file.
 *
 * Reads once, at construction. Writes the whole file on every mutation.
 */
export function createFileKeyValueStore(options: FileKeyValueStoreOptions): KeyValueStore {
  const { file, onCorrupt } = options;

  let raw: string | undefined;

  try {
    raw = file.read();
  } catch (error: unknown) {
    throw new AppError(ErrorCode.STORAGE_ERROR, 'Stored settings could not be read.', {
      cause: error,
    });
  }

  const parsed = parseStore(raw);

  if (parsed === undefined && raw !== undefined && raw.length > 0) {
    onCorrupt?.(raw);
  }

  const entries = parsed ?? new Map<string, string>();

  function flush(): void {
    try {
      file.write(serializeStore(entries));
    } catch (error: unknown) {
      throw new AppError(ErrorCode.STORAGE_ERROR, 'Changes could not be saved.', { cause: error });
    }
  }

  return {
    get(key) {
      return entries.get(key);
    },

    set(key, value) {
      // Writing an unchanged value would rewrite the file for nothing, and a
      // settings screen re-emits its whole state on every edit.
      if (entries.get(key) === value) {
        return;
      }

      entries.set(key, value);
      flush();
    },

    delete(key) {
      if (!entries.delete(key)) {
        return;
      }

      flush();
    },

    keys() {
      return [...entries.keys()];
    },

    clear() {
      if (entries.size === 0) {
        return;
      }

      entries.clear();
      flush();
    },
  };
}
