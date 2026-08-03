/**
 * types/ — Domain layer
 *
 * Owns: The protocol's domain models — Session, Manifest, Packet, Transfer,
 * FileMetadata and Settings — as immutable value objects.
 *
 * May depend on:
 *   - The shared error model (@utils/errors), so an invalid value cannot be
 *     constructed and failures use standardized codes
 *
 * Must NOT depend on:
 *   - Every other module
 *
 * Models carry data and structural invariants only. They have no behaviour, no
 * serialization and no lifecycle: binary layout belongs to PACKET_SPEC.md and
 * Phase 3, and state machines belong to the protocol engine.
 *
 * Authority: docs/PROTOCOL_SPEC.md (§3, §8, §10) and docs/API_SPEC.md §13.
 */

export {
  createFileMetadata,
  fileMetadataEquals,
  type FileMetadata,
  type FileMetadataInput,
} from './fileMetadata';

export {
  fileId,
  protocolVersion,
  sessionId,
  transferId,
  type FileId,
  type ProtocolVersion,
  type SessionId,
  type TransferId,
} from './ids';

export {
  createManifest,
  createManifestEntry,
  findEntry,
  manifestEntryEquals,
  manifestEquals,
  NONE,
  type Manifest,
  type ManifestConfiguration,
  type ManifestEntry,
  type ManifestEntryInput,
  type ManifestInput,
} from './manifest';

export {
  copyPayload,
  createPacket,
  isSamePosition,
  packetEquals,
  PacketType,
  type Packet,
  type PacketInput,
} from './packet';

export {
  Capability,
  createSession,
  hasCapability,
  sessionEquals,
  SessionState,
  withState,
  type Session,
  type SessionInput,
} from './session';

export {
  PerformanceMode,
  QRSpeedPreference,
  settingsEquals,
  Theme,
  type Settings,
  type StoragePreferences,
} from './settings';

export {
  createProgress,
  createTransfer,
  isPacketComplete,
  progressEquals,
  progressRatio,
  transferEquals,
  TransferDirection,
  type Transfer,
  type TransferInput,
  type TransferProgress,
} from './transfer';
