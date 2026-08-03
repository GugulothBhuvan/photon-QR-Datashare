/**
 * Manifest — transfer metadata (MOD-003).
 *
 * PROTOCOL_SPEC §3.7, §10.
 *
 * The manifest is the authoritative reference for reconstruction (§10.14) and
 * is immutable once accepted (§10.9). It never contains file payload data
 * (§10.1).
 *
 * Note on totals: §10.5 lists file count, total size and total packet count as
 * manifest contents, and §10.13 makes an inconsistent packet count grounds for
 * rejection. This model *derives* those three from the file entries instead of
 * accepting them, so an inconsistent manifest cannot be constructed in the
 * first place. Validating a manifest that arrived from another device is a
 * separate, receiver-side concern (§10.7) belonging to a later phase.
 */
import { AppError, ErrorCode } from '@core/errors';

import { type FileMetadata } from './fileMetadata';
import { type FileId, type ProtocolVersion, type SessionId, type TransferId } from './ids';

/**
 * One file's entry in the manifest (PROTOCOL_SPEC §10.6).
 *
 * Wraps the file's identity (`FileMetadata`) with the choices this transfer
 * made about carrying it.
 */
export interface ManifestEntry {
  readonly file: FileMetadata;
  /** Number of packets this file's binary stream was divided into. */
  readonly packetCount: number;
  /**
   * Compression method applied, or `'NONE'`.
   *
   * An opaque string rather than an enumeration: PROTOCOL_SPEC §18 names the
   * permitted algorithms and is not read until compression is implemented.
   */
  readonly compression: string;
  /** Encryption method applied, or `'NONE'`. Opaque for the same reason (§19). */
  readonly encryption: string;
}

/** Protocol configuration carried by the manifest (PROTOCOL_SPEC §10.5). */
export interface ManifestConfiguration {
  /** Payload size in bytes each packet was built to carry. */
  readonly packetSize: number;
  /** Recovery method in use, or `'NONE'`. Opaque pending §15. */
  readonly recoveryMethod: string;
  /** Integrity algorithm covering file hashes. Opaque pending §20. */
  readonly integrityAlgorithm: string;
  /** Transport capabilities negotiated for this transfer. */
  readonly transportCapabilities: readonly string[];
}

export interface Manifest {
  readonly sessionId: SessionId;
  /** Present when the implementation supports transfer ids (§10.5). */
  readonly transferId: TransferId | undefined;
  readonly protocolVersion: ProtocolVersion;
  /** Creation time in epoch milliseconds, supplied by the caller. */
  readonly createdAt: number;
  /** Optional human-readable name for the transfer (§10.5). */
  readonly name: string | undefined;
  /** One entry per file (§10.15.3), in transmission order. */
  readonly entries: readonly ManifestEntry[];
  readonly configuration: ManifestConfiguration;
  /** Derived: number of files. */
  readonly fileCount: number;
  /** Derived: sum of every file's original size in bytes. */
  readonly totalSize: number;
  /** Derived: sum of every file's packet count. */
  readonly totalPacketCount: number;
}

export interface ManifestEntryInput {
  readonly file: FileMetadata;
  readonly packetCount: number;
  readonly compression?: string;
  readonly encryption?: string;
}

export interface ManifestInput {
  readonly sessionId: SessionId;
  readonly protocolVersion: ProtocolVersion;
  readonly createdAt: number;
  readonly entries: readonly ManifestEntryInput[];
  readonly configuration: ManifestConfiguration;
  readonly transferId?: TransferId;
  readonly name?: string;
}

export const NONE = 'NONE';

/**
 * Creates a manifest entry.
 *
 * A packet count must be a non-negative integer. Zero is permitted: an empty
 * file is still a file, and §3.8 admits any byte sequence.
 */
export function createManifestEntry(input: ManifestEntryInput): ManifestEntry {
  if (!Number.isInteger(input.packetCount) || input.packetCount < 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'Manifest entry packetCount must be a non-negative integer.',
      { details: { fileId: input.file.id, packetCount: input.packetCount } },
    );
  }

  return Object.freeze({
    file: input.file,
    packetCount: input.packetCount,
    compression: input.compression ?? NONE,
    encryption: input.encryption ?? NONE,
  });
}

/**
 * Creates a manifest.
 *
 * Enforces the structural invariants that can be checked without leaving the
 * value: at least one entry, unique file ids (§10.15.5), and a positive packet
 * size. Totals are computed, not trusted.
 */
export function createManifest(input: ManifestInput): Manifest {
  if (input.entries.length === 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'A manifest must describe at least one file.',
    );
  }

  if (!Number.isInteger(input.configuration.packetSize) || input.configuration.packetSize <= 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'Manifest packetSize must be a positive integer.',
      { details: { packetSize: input.configuration.packetSize } },
    );
  }

  const entries = input.entries.map(createManifestEntry);

  // §10.15.5: every File ID SHALL be unique within the session.
  const seen = new Set<FileId>();
  for (const entry of entries) {
    if (seen.has(entry.file.id)) {
      throw new AppError(
        ErrorCode.INVALID_CONFIGURATION,
        `Duplicate file id "${entry.file.id}" in manifest.`,
        { details: { fileId: entry.file.id } },
      );
    }
    seen.add(entry.file.id);
  }

  const configuration: ManifestConfiguration = Object.freeze({
    ...input.configuration,
    transportCapabilities: Object.freeze([...input.configuration.transportCapabilities]),
  });

  return Object.freeze({
    sessionId: input.sessionId,
    transferId: input.transferId,
    protocolVersion: input.protocolVersion,
    createdAt: input.createdAt,
    name: input.name,
    entries: Object.freeze(entries),
    configuration,
    fileCount: entries.length,
    totalSize: entries.reduce((total, entry) => total + entry.file.size, 0),
    totalPacketCount: entries.reduce((total, entry) => total + entry.packetCount, 0),
  });
}

/** Finds an entry by file id, or `undefined`. */
export function findEntry(manifest: Manifest, id: FileId): ManifestEntry | undefined {
  return manifest.entries.find((entry) => entry.file.id === id);
}

/** Structural equality of an entry. */
export function manifestEntryEquals(left: ManifestEntry, right: ManifestEntry): boolean {
  return (
    left.file.id === right.file.id &&
    left.file.hash === right.file.hash &&
    left.file.size === right.file.size &&
    left.file.name === right.file.name &&
    left.packetCount === right.packetCount &&
    left.compression === right.compression &&
    left.encryption === right.encryption
  );
}

/** Structural equality of a manifest. */
export function manifestEquals(left: Manifest, right: Manifest): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.transferId === right.transferId &&
    left.protocolVersion === right.protocolVersion &&
    left.createdAt === right.createdAt &&
    left.name === right.name &&
    left.configuration.packetSize === right.configuration.packetSize &&
    left.configuration.recoveryMethod === right.configuration.recoveryMethod &&
    left.configuration.integrityAlgorithm === right.configuration.integrityAlgorithm &&
    left.configuration.transportCapabilities.length ===
      right.configuration.transportCapabilities.length &&
    left.configuration.transportCapabilities.every(
      (capability, index) => capability === right.configuration.transportCapabilities[index],
    ) &&
    left.entries.length === right.entries.length &&
    left.entries.every((entry, index) => {
      const other = right.entries[index];
      return other !== undefined && manifestEntryEquals(entry, other);
    })
  );
}
