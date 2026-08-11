/**
 * storage/ — Adapter layer
 *
 * Filesystem and key-value storage behind narrow interfaces. The only place
 * platform storage APIs may be named.
 *
 * Purpose, ownership, dependency rules and public exports: see ./README.md.
 * Secure storage requirements are defined by docs/SECURITY.md.
 */

export { createDeviceStorage, STORE_FILENAME, type DeviceStorage } from './deviceStorage';

export {
  createFileKeyValueStore,
  parseStore,
  serializeStore,
  STORE_FORMAT_VERSION,
  type FileKeyValueStoreOptions,
  type TextFile,
} from './fileKeyValueStore';

export { createMemoryKeyValueStore } from './memoryKeyValueStore';

export type { FileReference, FileStore, KeyValueStore } from './ports';
