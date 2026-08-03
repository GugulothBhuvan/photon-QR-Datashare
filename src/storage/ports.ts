/**
 * Storage adapter ports.
 *
 * These interfaces are the entire surface through which the application
 * reaches device storage (AGENTS.md §17.6). Implementations wrap platform SDKs
 * and are supplied by the composition root; nothing above this layer names an
 * SDK.
 *
 * Ports are intentionally primitive — read, write, delete, list. Policy is a
 * repository concern (see src/repositories/README.md).
 *
 * Implementations SHALL throw only `AppError` (docs/API_SPEC.md §12: platform
 * exceptions do not cross API boundaries).
 */

/** Opaque handle to a stored file. Shape is owned by the adapter. */
export interface FileReference {
  readonly uri: string;
  readonly size: number;
}

/**
 * Synchronous key-value storage, for small records such as preferences and
 * session state (MMKV in the app, in-memory in tests).
 */
export interface KeyValueStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  /** Keys currently present, in insertion order where the backend preserves it. */
  keys(): readonly string[];
  clear(): void;
}

/**
 * File storage, for transferred content.
 *
 * Asynchronous because every platform filesystem is. Streaming APIs arrive in
 * Phase 7 alongside the reconstruction engine; Phase 1 defines only what the
 * repository layer needs to exist.
 */
export interface FileStore {
  write(path: string, data: Uint8Array): Promise<FileReference>;
  read(path: string): Promise<Uint8Array>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
