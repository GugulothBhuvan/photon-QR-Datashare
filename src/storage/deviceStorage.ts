/**
 * Persistent storage on a device.
 *
 * Binds `createFileKeyValueStore` to the platform filesystem. Loaded through a
 * guarded `require` for the same reason the camera and file picker are
 * (ADR-0005): `expo-file-system` needs a native runtime, and importing it
 * under Node would break the suite on a machine with no device.
 *
 * Nothing here holds policy. The store's behaviour — load once, write through,
 * survive a corrupt file — lives in `fileKeyValueStore.ts`, where it can be
 * tested with no device present.
 */
import { createFileKeyValueStore, type TextFile } from './fileKeyValueStore';
import { createMemoryKeyValueStore } from './memoryKeyValueStore';
import type { KeyValueStore } from './ports';

/** The file application records are kept in, under the document directory. */
export const STORE_FILENAME = 'photon-store.json';

export interface DeviceStorage {
  readonly store: KeyValueStore;
  /** Whether records will survive a restart. */
  readonly isPersistent: boolean;
  /** Why they will not, when they will not. Surfaced on the About screen. */
  readonly unavailableReason?: string;
}

/**
 * Resolves the platform's persistent store.
 *
 * Falls back to memory rather than throwing: a device that cannot write its
 * settings should still run, with settings that reset. The reason is kept so
 * the About screen can say which happened, rather than leaving a user to
 * wonder why their preferences keep reverting.
 */
export function createDeviceStorage(): DeviceStorage {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('expo-file-system') as {
      File: new (uri: string) => {
        readonly exists: boolean;
        readonly uri: string;
        textSync(): string;
        create(options?: { overwrite?: boolean; intermediates?: boolean }): void;
        write(contents: string): void;
      };
      Paths: { document: { uri: string } };
    };

    const path = `${fs.Paths.document.uri}${STORE_FILENAME}`;

    const file: TextFile = {
      read() {
        const handle = new fs.File(path);
        return handle.exists ? handle.textSync() : undefined;
      },

      write(text) {
        const handle = new fs.File(path);
        // `create` is required before `write` for a file that does not exist,
        // and harmless with `overwrite` for one that does.
        handle.create({ overwrite: true, intermediates: true });
        handle.write(text);
      },
    };

    return { store: createFileKeyValueStore({ file }), isPersistent: true };
  } catch (error: unknown) {
    return {
      store: createMemoryKeyValueStore(),
      isPersistent: false,
      unavailableReason: error instanceof Error ? error.message : String(error),
    };
  }
}
