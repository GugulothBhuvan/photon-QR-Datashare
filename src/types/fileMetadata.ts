/**
 * FileMetadata — description of one transferred file.
 *
 * Fields are the "File Information" members of PROTOCOL_SPEC §10.5, minus the
 * per-transfer members (packet count, compression, encryption) which belong to
 * the manifest entry that wraps this value — see `manifest.ts`.
 *
 * Splitting them this way keeps the file's *identity* separate from how one
 * particular transfer chose to carry it.
 *
 * The protocol treats every file as an opaque byte sequence and SHALL NOT
 * inspect its contents (§3.8); nothing here interprets the file.
 */
import { AppError, ErrorCode } from '@core/errors';

import { type FileId } from './ids';

export interface FileMetadata {
  readonly id: FileId;
  readonly name: string;
  /** Without a leading dot. Empty when the file has none. */
  readonly extension: string;
  /** MIME type, or `'application/octet-stream'` when unknown. */
  readonly mimeType: string;
  /** Size of the original binary stream in bytes (§3.9). */
  readonly size: number;
  /**
   * Integrity hash of the original binary stream.
   *
   * The algorithm is named once per transfer, in the manifest's protocol
   * configuration (§10.5), not per file.
   */
  readonly hash: string;
}

export interface FileMetadataInput {
  readonly id: FileId;
  readonly name: string;
  readonly extension?: string;
  readonly mimeType?: string;
  readonly size: number;
  readonly hash: string;
}

const DEFAULT_MIME_TYPE = 'application/octet-stream';

/**
 * Creates file metadata.
 *
 * Invariants enforced: a non-empty name, a non-negative integer size, and a
 * non-empty hash. Anything beyond that — whether the hash matches the bytes,
 * whether the file exists — is verification, which happens in a later phase.
 */
export function createFileMetadata(input: FileMetadataInput): FileMetadata {
  if (input.name.trim().length === 0) {
    throw new AppError(ErrorCode.INVALID_CONFIGURATION, 'File name must not be empty.');
  }

  if (!Number.isInteger(input.size) || input.size < 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'File size must be a non-negative integer.',
      { details: { size: input.size } },
    );
  }

  if (input.hash.trim().length === 0) {
    throw new AppError(ErrorCode.INVALID_CONFIGURATION, 'File hash must not be empty.');
  }

  return Object.freeze({
    id: input.id,
    name: input.name,
    extension: input.extension ?? '',
    mimeType: input.mimeType ?? DEFAULT_MIME_TYPE,
    size: input.size,
    hash: input.hash,
  });
}

/** Structural equality. */
export function fileMetadataEquals(left: FileMetadata, right: FileMetadata): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.extension === right.extension &&
    left.mimeType === right.mimeType &&
    left.size === right.size &&
    left.hash === right.hash
  );
}
