/**
 * SHA-256 integrity verifier (SEC-003) — PROTOCOL_SPEC §20.
 *
 * The production implementation of the `IntegrityVerifier` contract. It
 * replaces the placeholder the composition root shipped through Milestone B
 * (A12-04), which named itself `PHOTON-PLACEHOLDER-32` precisely so it could
 * never be mistaken for this.
 *
 * **What this provides, and what it does not.** §20.16 is explicit and the
 * distinction is worth keeping in front of the reader:
 *
 * | Property | Provided here? |
 * | --- | --- |
 * | Corruption detection | Yes — §20.16 |
 * | Integrity of a reconstructed file | Yes — §20.6 |
 * | Detection of accidental modification | Yes — §20.16 |
 * | **Confidentiality** | **No** — §19 owns encryption, which is unimplemented |
 * | **Authenticity** | **No** — an unkeyed hash proves nothing about origin |
 *
 * A plain SHA-256 over a file tells you the bytes are the bytes the manifest
 * described. It does **not** tell you who wrote the manifest. An attacker who
 * can replace both the file and the manifest can replace the hash with it.
 * Defending against that needs authentication (§19.10), which needs keys, which
 * §19.7 leaves to negotiation this version does not implement. Recorded as
 * A14-02 rather than papered over with a hash that looks like a signature.
 */
import type { IntegrityVerifier } from '@core/contracts';

import { sha256, SHA256_ALGORITHM, SHA256_DIGEST_LENGTH } from './sha256';

/**
 * Compares two digests without leaking where they first differ.
 *
 * A digest comparison is not a secret comparison — the expected value travels
 * in the manifest — so this is not defending against a timing attack that
 * exists today. It is written this way because `verify` is the function an
 * authenticated mode (§19.10) would reuse for a MAC tag, where the timing does
 * matter, and a fast-exit comparison left in place is exactly the kind of
 * detail that survives into the version where it is wrong.
 */
export function constantTimeEquals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] as number) ^ (right[index] as number);
  }

  return difference === 0;
}

/**
 * The SHA-256 verifier (§20.7).
 *
 * Stateless and deterministic, so one instance may be shared: §20.17.6 requires
 * verification to be deterministic across implementations, and §20.15 requires
 * it to be independent of the transport.
 */
export function createSha256Verifier(): IntegrityVerifier {
  return {
    algorithm: SHA256_ALGORITHM,

    digest(bytes) {
      return sha256(bytes);
    },

    verify(bytes, expected) {
      // A truncated or over-long expectation is a rejection, not a comparison
      // against whatever prefix happens to match.
      if (expected.length !== SHA256_DIGEST_LENGTH) {
        return false;
      }

      return constantTimeEquals(sha256(bytes), expected);
    },
  };
}
