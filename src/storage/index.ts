/**
 * storage/ — Adapter layer
 *
 * Filesystem and key-value storage behind narrow interfaces. The only place
 * platform storage APIs may be named.
 *
 * Purpose, ownership, dependency rules and public exports: see ./README.md.
 * Secure storage requirements are defined by docs/SECURITY.md.
 */

export { createMemoryKeyValueStore } from './memoryKeyValueStore';

export type { FileReference, FileStore, KeyValueStore } from './ports';
