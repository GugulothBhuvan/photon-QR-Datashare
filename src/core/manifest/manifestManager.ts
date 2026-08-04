/**
 * ManifestManager (PRO-002) — PROTOCOL_SPEC §10; docs/API_SPEC.md §6.
 *
 * Four responsibilities and no others: creating a manifest, parsing one that
 * arrived, validating it, and looking things up in it.
 *
 * What this deliberately does not do:
 *
 * - **Serialize packets.** The manifest travels as the payload of a manifest
 *   packet; framing it is the packet layer's job. `parseManifest` takes an
 *   already-decoded structural value, not bytes — see the note on encoding
 *   below.
 * - **Manage sessions.** It validates that a manifest's session id matches the
 *   one expected, but it does not own session state.
 * - **Transport, reconstruction or storage.** None of these appear here.
 *
 * Manifests are immutable once accepted (§10.9). Every function below
 * transforms; none mutates.
 *
 * **On encoding.** §10 defines what a manifest contains, not how it is laid
 * out in bytes — that is PACKET_SPEC §9.2, which is unread. So the boundary
 * this module owns is *structure to domain object*: `parseManifest` accepts an
 * unknown structural value, validates it per §10.7, and produces a `Manifest`.
 * Whichever phase reads §9.2 supplies the bytes-to-structure half.
 */
import { AppError, ErrorCode } from '@core/errors';
import { invalid, mergeOutcomes, valid, type ValidationOutcome } from '@core/validation';

import { createFileMetadata, type FileMetadata } from '@domain/fileMetadata';
import { isUuid, type FileId, type ProtocolVersion, type SessionId } from '@domain/ids';
import {
  createManifest as createManifestValue,
  findEntry,
  NONE,
  type Manifest,
  type ManifestConfiguration,
  type ManifestEntry,
  type ManifestEntryInput,
} from '@domain/manifest';
import {
  fileId as toFileId,
  sessionId as toSessionId,
  transferId as toTransferId,
} from '@domain/ids';

/**
 * Why a manifest was rejected.
 *
 * Derived from the §10.7 validation steps and the §10.13 failure conditions.
 */
export const ManifestRejection = {
  /** §10.7.1, §10.13: session id absent or malformed. */
  BadSessionId: 'BAD_SESSION_ID',
  /** §10.13: the manifest belongs to a different session. */
  ForeignSession: 'FOREIGN_SESSION',
  /** §10.7.2, §10.13: protocol version unsupported. */
  UnsupportedVersion: 'UNSUPPORTED_VERSION',
  /** §10.7.3, §10.8: integrity verification did not pass. */
  IntegrityFailed: 'INTEGRITY_FAILED',
  /** §10.7.4: file count absent or inconsistent with the entries. */
  BadFileCount: 'BAD_FILE_COUNT',
  /** §10.7.5, §10.13: packet counts inconsistent. */
  BadPacketCount: 'BAD_PACKET_COUNT',
  /** §10.7.6, §10.13: a file entry is malformed. */
  BadFileMetadata: 'BAD_FILE_METADATA',
  /** §10.15.5: two entries share a file id. */
  DuplicateFileId: 'DUPLICATE_FILE_ID',
  /** §10.7.7: an algorithm named by the manifest is not supported. */
  UnsupportedAlgorithm: 'UNSUPPORTED_ALGORITHM',
  /** §10.13: a required field is missing. */
  MissingField: 'MISSING_FIELD',
  /** §10.5: packet size absent or not positive. */
  BadConfiguration: 'BAD_CONFIGURATION',
} as const;

export type ManifestRejection = (typeof ManifestRejection)[keyof typeof ManifestRejection];

export type ManifestValidationResult = ValidationOutcome<ManifestRejection>;

/** A parse that produced a manifest, or the reasons it could not. */
export type ParseResult =
  | { readonly ok: true; readonly manifest: Manifest }
  | { readonly ok: false; readonly validation: ManifestValidationResult };

/** What a receiver expects of an arriving manifest. */
export interface ManifestExpectations {
  /**
   * Session the receiver is collecting for.
   *
   * §10.7.1 and §10.13 make a mismatched session id grounds for rejection.
   */
  readonly expectedSessionId?: SessionId;
  /** Protocol versions this implementation accepts (§10.7.2). */
  readonly supportedVersions?: readonly number[];
  /**
   * Whether integrity verification already passed (§10.7.3, §10.8).
   *
   * Required rather than optional, and supplied by the caller rather than
   * computed here: §10.8 requires integrity to be verified *before* the
   * manifest is accepted, and §10 does not define where the integrity value
   * lives. Making it a mandatory input means the check cannot be silently
   * skipped by forgetting an option.
   */
  readonly integrityVerified: boolean;
  /** Compression methods this implementation supports (§10.7.7). `NONE` is always supported. */
  readonly supportedCompression?: readonly string[];
  /** Encryption methods supported (§10.7.7). */
  readonly supportedEncryption?: readonly string[];
  /** Integrity algorithms supported (§10.7.7). */
  readonly supportedIntegrity?: readonly string[];
}

export interface CreateManifestInput {
  readonly sessionId: SessionId;
  readonly protocolVersion: ProtocolVersion;
  /** Creation timestamp in epoch milliseconds (§10.5). */
  readonly createdAt: number;
  /** The files this transfer carries (API_SPEC §6: input is Files). */
  readonly files: readonly FileMetadata[];
  readonly configuration: ManifestConfiguration;
  readonly transferId?: string;
  readonly name?: string;
  /**
   * Per-file overrides for packet count, compression and encryption.
   *
   * Keyed by file id. Absent entries take the defaults: `NONE` for both
   * methods, and a packet count derived from the file size.
   */
  readonly perFile?: Readonly<Record<string, PerFileOptions>>;
}

export interface PerFileOptions {
  /**
   * Packets this file's stream occupies.
   *
   * Supplied when the transferred stream is not the original bytes — a
   * compressed or encrypted file does not occupy `ceil(size / packetSize)`
   * packets. Defaults to the derived count.
   */
  readonly packetCount?: number;
  readonly compression?: string;
  readonly encryption?: string;
}

/**
 * Packets a byte stream of `size` occupies at `packetSize` bytes per packet.
 *
 * A zero-byte file occupies zero packets: §3.8 admits any byte sequence as a
 * file, and there is nothing to carry.
 */
export function packetsFor(size: number, packetSize: number): number {
  if (!Number.isInteger(packetSize) || packetSize <= 0) {
    throw new AppError(ErrorCode.INVALID_CONFIGURATION, 'Packet size must be a positive integer.', {
      details: { packetSize },
    });
  }

  return Math.ceil(size / packetSize);
}

export interface ManifestManager {
  /** Builds a manifest describing a set of files (§10.5, API_SPEC §6). */
  createManifest(input: CreateManifestInput): Manifest;

  /**
   * Validates a manifest against what the receiver expects (§10.7, §10.13).
   *
   * Runs every check and reports every failure, rather than stopping at the
   * first.
   */
  validateManifest(
    manifest: Manifest,
    expectations: ManifestExpectations,
  ): ManifestValidationResult;

  /**
   * Turns an arriving structural value into a validated manifest (§10.7).
   *
   * Unknown fields are ignored (§10.12). Returns the reasons on failure; a
   * rejected manifest initializes no protocol state (§10.13).
   */
  parseManifest(value: unknown, expectations: ManifestExpectations): ParseResult;

  /**
   * Retains a validated manifest for the session's lifetime (§10.14).
   *
   * Refuses to replace one already held: the manifest is immutable once
   * accepted (§10.9) and SHALL NOT be regenerated during an active session
   * (§10.14).
   */
  accept(manifest: Manifest): boolean;

  /** The manifest held for a session, or `undefined` (§10.14). */
  getManifest(id: SessionId): Manifest | undefined;

  /** Whether a manifest has been accepted for a session. */
  hasManifest(id: SessionId): boolean;

  /** Forgets the manifest held for a session (§8.14 resource release). */
  release(id: SessionId): boolean;

  /** The entry describing a file, or `undefined` (§10.6). */
  getEntry(manifest: Manifest, file: FileId): ManifestEntry | undefined;

  /** Packets expected for a file, or `undefined` when it is not in the manifest. */
  expectedPacketCount(manifest: Manifest, file: FileId): number | undefined;

  /** Every file id the manifest describes, in transmission order. */
  fileIds(manifest: Manifest): readonly FileId[];
}

/** Reads a property from an unknown value without asserting its type. */
function propertyOf(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Whether `method` is acceptable, treating `NONE` as universally supported. */
function supports(supported: readonly string[] | undefined, method: string): boolean {
  return method === NONE || supported === undefined || supported.includes(method);
}

/**
 * Creates a manifest manager.
 *
 * Holds accepted manifests in memory for the duration of their sessions
 * (§10.14). That is retention, not persistence: nothing here touches a
 * repository or the filesystem.
 */
export function createManifestManager(): ManifestManager {
  const accepted = new Map<SessionId, Manifest>();

  const manager: ManifestManager = {
    createManifest(input) {
      const { packetSize } = input.configuration;

      const entries: ManifestEntryInput[] = input.files.map((file) => {
        const options = input.perFile?.[file.id] ?? {};

        return {
          file,
          packetCount: options.packetCount ?? packetsFor(file.size, packetSize),
          ...(options.compression === undefined ? {} : { compression: options.compression }),
          ...(options.encryption === undefined ? {} : { encryption: options.encryption }),
        };
      });

      // The domain factory enforces the structural invariants — unique file
      // ids (§10.15.5), a positive packet size, at least one file — and
      // derives the totals so they cannot disagree with the entries.
      return createManifestValue({
        sessionId: input.sessionId,
        protocolVersion: input.protocolVersion,
        createdAt: input.createdAt,
        entries,
        configuration: input.configuration,
        ...(input.transferId === undefined ? {} : { transferId: toTransferId(input.transferId) }),
        ...(input.name === undefined ? {} : { name: input.name }),
      });
    },

    validateManifest(manifest, expectations) {
      const rejections: ManifestRejection[] = [];

      // §10.7.1 — Session ID.
      if (!isUuid(manifest.sessionId)) {
        rejections.push(ManifestRejection.BadSessionId);
      } else if (
        expectations.expectedSessionId !== undefined &&
        manifest.sessionId !== expectations.expectedSessionId
      ) {
        rejections.push(ManifestRejection.ForeignSession);
      }

      // §10.7.2 — Protocol Version.
      if (
        expectations.supportedVersions !== undefined &&
        !expectations.supportedVersions.includes(manifest.protocolVersion)
      ) {
        rejections.push(ManifestRejection.UnsupportedVersion);
      }

      // §10.7.3 / §10.8 — Manifest Integrity, before acceptance.
      if (!expectations.integrityVerified) {
        rejections.push(ManifestRejection.IntegrityFailed);
      }

      // §10.7.4 — File Count.
      if (manifest.entries.length === 0 || manifest.fileCount !== manifest.entries.length) {
        rejections.push(ManifestRejection.BadFileCount);
      }

      // §10.7.5 — Packet Count. §10.13 makes an inconsistent count fatal.
      const summedPackets = manifest.entries.reduce((total, entry) => total + entry.packetCount, 0);
      const summedSize = manifest.entries.reduce((total, entry) => total + entry.file.size, 0);

      if (
        manifest.totalPacketCount !== summedPackets ||
        !isNonNegativeInteger(manifest.totalPacketCount) ||
        manifest.totalSize !== summedSize
      ) {
        rejections.push(ManifestRejection.BadPacketCount);
      }

      // §10.5 — protocol configuration.
      if (!isPositiveInteger(manifest.configuration.packetSize)) {
        rejections.push(ManifestRejection.BadConfiguration);
      }

      // §10.7.6 — File Metadata, and §10.15.5 — unique file ids.
      const seen = new Set<FileId>();

      for (const entry of manifest.entries) {
        if (seen.has(entry.file.id)) {
          rejections.push(ManifestRejection.DuplicateFileId);
        }
        seen.add(entry.file.id);

        if (
          !isUuid(entry.file.id) ||
          !isNonEmptyString(entry.file.name) ||
          !isNonNegativeInteger(entry.file.size) ||
          !isNonEmptyString(entry.file.hash) ||
          !isNonNegativeInteger(entry.packetCount)
        ) {
          rejections.push(ManifestRejection.BadFileMetadata);
        }
      }

      // §10.7.7 — Supported Algorithms.
      const algorithmsSupported =
        supports(expectations.supportedIntegrity, manifest.configuration.integrityAlgorithm) &&
        manifest.entries.every(
          (entry) =>
            supports(expectations.supportedCompression, entry.compression) &&
            supports(expectations.supportedEncryption, entry.encryption),
        );

      if (!algorithmsSupported) {
        rejections.push(ManifestRejection.UnsupportedAlgorithm);
      }

      return rejections.length === 0
        ? valid<ManifestRejection>()
        : invalid([...new Set(rejections)]);
    },

    parseManifest(value, expectations) {
      const rejections: ManifestRejection[] = [];

      // Required fields first (§10.13: missing required fields are fatal).
      const rawSessionId = propertyOf(value, 'sessionId');
      const rawVersion = propertyOf(value, 'protocolVersion');
      const rawCreatedAt = propertyOf(value, 'createdAt');
      const rawEntries = propertyOf(value, 'entries');
      const rawConfiguration = propertyOf(value, 'configuration');

      if (!isNonEmptyString(rawSessionId) || !isUuid(rawSessionId)) {
        rejections.push(ManifestRejection.BadSessionId);
      }

      if (!isNonNegativeInteger(rawVersion)) {
        rejections.push(ManifestRejection.UnsupportedVersion);
      }

      if (!isNonNegativeInteger(rawCreatedAt)) {
        rejections.push(ManifestRejection.MissingField);
      }

      if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
        rejections.push(ManifestRejection.BadFileCount);
      }

      const packetSize = propertyOf(rawConfiguration, 'packetSize');

      if (!isPositiveInteger(packetSize)) {
        rejections.push(ManifestRejection.BadConfiguration);
      }

      if (rejections.length > 0) {
        return { ok: false, validation: invalid([...new Set(rejections)]) };
      }

      // Build entries. Unknown fields on each entry are ignored (§10.12).
      const entries: ManifestEntryInput[] = [];

      for (const raw of rawEntries as readonly unknown[]) {
        const file = propertyOf(raw, 'file') ?? raw;
        const id = propertyOf(file, 'id');
        const name = propertyOf(file, 'name');
        const size = propertyOf(file, 'size');
        const hash = propertyOf(file, 'hash');
        const packetCount = propertyOf(raw, 'packetCount');

        if (
          !isNonEmptyString(id) ||
          !isUuid(id) ||
          !isNonEmptyString(name) ||
          !isNonNegativeInteger(size) ||
          !isNonEmptyString(hash) ||
          !isNonNegativeInteger(packetCount)
        ) {
          return {
            ok: false,
            validation: invalid([ManifestRejection.BadFileMetadata]),
          };
        }

        const extension = propertyOf(file, 'extension');
        const mimeType = propertyOf(file, 'mimeType');
        const compression = propertyOf(raw, 'compression');
        const encryption = propertyOf(raw, 'encryption');

        entries.push({
          file: createFileMetadata({
            id: toFileId(id),
            name,
            size,
            hash,
            ...(typeof extension === 'string' ? { extension } : {}),
            ...(typeof mimeType === 'string' ? { mimeType } : {}),
          }),
          packetCount,
          ...(typeof compression === 'string' ? { compression } : {}),
          ...(typeof encryption === 'string' ? { encryption } : {}),
        });
      }

      const transferIdRaw = propertyOf(value, 'transferId');
      const nameRaw = propertyOf(value, 'name');
      const recoveryMethod = propertyOf(rawConfiguration, 'recoveryMethod');
      const integrityAlgorithm = propertyOf(rawConfiguration, 'integrityAlgorithm');
      const transportCapabilities = propertyOf(rawConfiguration, 'transportCapabilities');

      let manifest: Manifest;

      try {
        manifest = createManifestValue({
          sessionId: toSessionId(rawSessionId as string),
          protocolVersion: rawVersion as ProtocolVersion,
          createdAt: rawCreatedAt as number,
          entries,
          configuration: {
            packetSize: packetSize as number,
            recoveryMethod: typeof recoveryMethod === 'string' ? recoveryMethod : NONE,
            integrityAlgorithm: typeof integrityAlgorithm === 'string' ? integrityAlgorithm : NONE,
            transportCapabilities: Array.isArray(transportCapabilities)
              ? transportCapabilities.filter((entry): entry is string => typeof entry === 'string')
              : [],
          },
          ...(isNonEmptyString(transferIdRaw) && isUuid(transferIdRaw)
            ? { transferId: toTransferId(transferIdRaw) }
            : {}),
          ...(isNonEmptyString(nameRaw) ? { name: nameRaw } : {}),
        });
      } catch (error: unknown) {
        // The domain factory refused: duplicate file ids (§10.15.5) or an
        // invalid configuration. Report rather than propagate — a malformed
        // manifest is expected input, not an exceptional condition.
        const reason =
          AppError.is(error) && /Duplicate file id/.test(error.message)
            ? ManifestRejection.DuplicateFileId
            : ManifestRejection.BadConfiguration;

        return { ok: false, validation: invalid([reason]) };
      }

      const validation = manager.validateManifest(manifest, expectations);

      return validation.valid ? { ok: true, manifest } : { ok: false, validation };
    },

    accept(manifest) {
      // §10.9, §10.14: immutable once accepted, and not regenerated during an
      // active session.
      if (accepted.has(manifest.sessionId)) {
        return false;
      }

      accepted.set(manifest.sessionId, manifest);
      return true;
    },

    getManifest(id) {
      return accepted.get(id);
    },

    hasManifest(id) {
      return accepted.has(id);
    },

    release(id) {
      return accepted.delete(id);
    },

    getEntry(manifest, file) {
      return findEntry(manifest, file);
    },

    expectedPacketCount(manifest, file) {
      return findEntry(manifest, file)?.packetCount;
    },

    fileIds(manifest) {
      return manifest.entries.map((entry) => entry.file.id);
    },
  };

  return manager;
}

/** Merges manifest validation results. */
export function mergeManifestResults(
  ...results: readonly ManifestValidationResult[]
): ManifestValidationResult {
  return mergeOutcomes(...results);
}
