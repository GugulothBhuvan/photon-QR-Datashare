/**
 * Packet footer (PKT-002) — PACKET_SPEC §6.
 *
 * ```text
 * | 4 bytes  | CRC32              |
 * | 32 bytes | SHA-256 (Optional) |
 * ```
 *
 * "Footer size depends on protocol configuration" (§6): the digest is present
 * or absent for a whole transfer, not decided per packet, so the size is a
 * property of the session's configuration. A reader cannot infer it from the
 * bytes — 36 trailing bytes are indistinguishable from 4 followed by 32 bytes
 * of payload — which is why the footer *layout* is a parameter to both the
 * serializer and the deserializer rather than something either discovers.
 *
 * This module owns the footer's shape and sizes. Computing a digest is a
 * security concern (docs/SECURITY.md, Phase 11); the footer carries whatever
 * digest it is given.
 */
import { AppError, ErrorCode } from '@core/errors';

import { ByteWidth } from './bytes';

/** Size of the CRC32 field in bytes (§6). */
export const CRC32_SIZE = ByteWidth.UInt32;

/** Size of the SHA-256 field in bytes (§6). */
export const SHA256_SIZE = 32;

/** Footer size when the optional digest is absent. */
export const FOOTER_SIZE_MINIMAL = CRC32_SIZE;

/** Footer size when the optional digest is present. */
export const FOOTER_SIZE_WITH_DIGEST = CRC32_SIZE + SHA256_SIZE;

/**
 * Whether a transfer's packets carry the optional SHA-256 field.
 *
 * Fixed for the lifetime of a session, so both ends agree on the footer's size
 * before the first packet is read.
 */
export interface FooterLayout {
  readonly includeDigest: boolean;
}

export const MINIMAL_FOOTER: FooterLayout = Object.freeze({ includeDigest: false });
export const DIGEST_FOOTER: FooterLayout = Object.freeze({ includeDigest: true });

export interface PacketFooter {
  /** CRC-32 over the header and payload. */
  readonly checksum: number;
  /** 32-byte SHA-256 digest, or `undefined` when the layout omits it. */
  readonly digest: Uint8Array | undefined;
}

/** Footer size in bytes for a given layout. */
export function footerSize(layout: FooterLayout): number {
  return layout.includeDigest ? FOOTER_SIZE_WITH_DIGEST : FOOTER_SIZE_MINIMAL;
}

/** The layout a footer conforms to. */
export function layoutOf(footer: PacketFooter): FooterLayout {
  return footer.digest === undefined ? MINIMAL_FOOTER : DIGEST_FOOTER;
}

/**
 * Creates a footer.
 *
 * The digest, when supplied, must be exactly 32 bytes: a short digest would
 * silently shift every following byte.
 */
export function createPacketFooter(checksum: number, digest?: Uint8Array): PacketFooter {
  if (!Number.isInteger(checksum) || checksum < 0 || checksum > 0xffff_ffff) {
    throw new AppError(ErrorCode.INVALID_PACKET, 'Footer checksum must fit in a UInt32.', {
      details: { checksum },
    });
  }

  if (digest !== undefined && digest.byteLength !== SHA256_SIZE) {
    throw new AppError(
      ErrorCode.INVALID_PACKET,
      `Footer digest must be exactly ${SHA256_SIZE} bytes.`,
      { details: { length: digest.byteLength } },
    );
  }

  return Object.freeze({
    checksum,
    // Copied so a caller reusing a digest buffer cannot alter a built footer.
    digest: digest === undefined ? undefined : Uint8Array.from(digest),
  });
}

/** Structural equality, digest bytes included. */
export function footerEquals(left: PacketFooter, right: PacketFooter): boolean {
  if (left.checksum !== right.checksum) {
    return false;
  }

  if (left.digest === undefined || right.digest === undefined) {
    return left.digest === right.digest;
  }

  if (left.digest.byteLength !== right.digest.byteLength) {
    return false;
  }

  for (let i = 0; i < left.digest.byteLength; i += 1) {
    if (left.digest[i] !== right.digest[i]) {
      return false;
    }
  }

  return true;
}
