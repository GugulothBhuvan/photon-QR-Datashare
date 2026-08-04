/**
 * registry/ — In-memory storage for live protocol state
 *
 * A registry holds what a protocol manager is currently responsible for.
 * Managers own protocol semantics; registries own storage, so a manager never
 * contains `Map` plumbing and a registry never contains a protocol rule.
 *
 * In-memory only. This is not the repository layer: state here lives for the
 * duration of a session and no longer. Durable storage sits behind
 * `src/repositories`, above the protocol engine.
 */

export { createRegistry, type Registry } from './registry';

export { createPacketRegistry, NO_FILE, type PacketRegistry } from './packetRegistry';

export { createManifestRegistry, type ManifestRegistry } from './manifestRegistry';

export { createSessionRegistry, type SessionEntry, type SessionRegistry } from './sessionRegistry';
