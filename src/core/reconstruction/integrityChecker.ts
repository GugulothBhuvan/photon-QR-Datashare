/**
 * File integrity verification (REC-005) — PROTOCOL_SPEC §3.24, §13.11, §20.
 *
 * §3.24 requires the reconstructed binary stream to be verified against the
 * original before a transfer is considered complete, and §15.14.10 forbids
 * recovery ever producing a file that fails verification.
 *
 * **The algorithm is injected, not implemented here.** §20 owns integrity
 * algorithms and has not been read; the manifest names one per transfer
 * (§10.5). This module takes an `IntegrityVerifier` contract, so the security
 * phase supplies a real SHA-256 without changing a line of reconstruction
 * logic — and a transfer whose manifest names an algorithm the receiver cannot
 * perform fails loudly rather than silently skipping verification.
 *
 * That last point is the reason this is a separate module rather than a
 * boolean returned by the file builder: "verification was skipped" and
 * "verification passed" must never be the same value.
 */
import type { IntegrityVerifier } from '@core/contracts';
import { bytesToHex } from '@utils/hex';

/** Why verification did not pass. */
export const IntegrityFailure = {
  /** The digest does not match the manifest's hash (§3.24). */
  HashMismatch: 'HASH_MISMATCH',
  /** The reconstructed stream is not the size the manifest declares. */
  SizeMismatch: 'SIZE_MISMATCH',
  /** The receiver cannot perform the algorithm the manifest names (§10.7.7). */
  AlgorithmUnsupported: 'ALGORITHM_UNSUPPORTED',
} as const;

export type IntegrityFailure = (typeof IntegrityFailure)[keyof typeof IntegrityFailure];

export interface IntegrityResult {
  readonly verified: boolean;
  readonly reason?: IntegrityFailure;
  /** The digest computed over the reconstructed stream, lowercase hex. */
  readonly actualHash?: string;
}

export interface VerifyFileOptions {
  /** The reconstructed binary stream (§3.9). */
  readonly stream: Uint8Array;
  /** The file's hash from the manifest (§10.5). */
  readonly expectedHash: string;
  /** The file's original size from the manifest, when known. */
  readonly expectedSize?: number;
  /** Integrity algorithm the manifest names (§10.5). */
  readonly algorithm: string;
  /** The verifier to use. Must implement the named algorithm. */
  readonly verifier: IntegrityVerifier;
}

/**
 * Verifies a reconstructed file against its manifest entry (§3.24).
 *
 * Size is checked first: it is free, and a size mismatch localises the fault
 * far better than a hash mismatch does.
 */
export function verifyFile(options: VerifyFileOptions): IntegrityResult {
  const { stream, expectedHash, expectedSize, algorithm, verifier } = options;

  // §10.7.7: an algorithm the receiver cannot perform is grounds for rejection,
  // and must never be reported as a pass.
  if (verifier.algorithm !== algorithm) {
    return { verified: false, reason: IntegrityFailure.AlgorithmUnsupported };
  }

  if (expectedSize !== undefined && stream.byteLength !== expectedSize) {
    return { verified: false, reason: IntegrityFailure.SizeMismatch };
  }

  const actualHash = bytesToHex(verifier.digest(stream));

  // Case-insensitive: §10.5 does not fix the case of a manifest hash.
  if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
    return { verified: false, reason: IntegrityFailure.HashMismatch, actualHash };
  }

  return { verified: true, actualHash };
}
