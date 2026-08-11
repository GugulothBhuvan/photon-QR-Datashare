/**
 * Payload ciphers (SEC-001) — PROTOCOL_SPEC §19; SECURITY.md §5, §8.
 *
 * **This build supports `NONE` and nothing else, deliberately.**
 *
 * §19.1 and SECURITY.md §5 both make encryption optional, so an OSP/1.0
 * implementation is compliant without it. What prevents implementing it is not
 * effort but a gap in the specification, recorded as SI-012:
 *
 * - §19.7 says key exchange is "specified in SECURITY.md".
 * - SECURITY.md §8 says key generation, storage and destruction are the
 *   application's responsibility and specifies no exchange either.
 * - §19.12 requires encryption to be negotiated during the Handshake, and no
 *   section defines a handshake message carrying a key or an agreement.
 *
 * The optical channel is one-way. Two devices cannot agree a key over it
 * without a mechanism, and inventing one would be inventing protocol security
 * — precisely what AGENTS.md §7 forbids and what a reader of this file would
 * have no way to audit.
 *
 * **A second reason not to improvise.** Even given a key, AES-256-GCM
 * (SECURITY.md §5's recommended default) is not something to hand-write in
 * TypeScript: nonce reuse, a non-constant-time tag comparison or a flawed
 * GHASH each break it silently, and none of those failures show up in a test
 * that round-trips a message. `expo-crypto` is asynchronous and provides no
 * AEAD; no audited synchronous AEAD is in the dependency set. Recorded as
 * A14-01.
 *
 * What *is* implemented here is the honest remainder: the seam, the disabled
 * cipher, and — importantly — the **refusal**. A manifest naming an algorithm
 * this build cannot perform is rejected rather than quietly treated as plain
 * text, which is the failure mode that would turn a missing feature into a
 * silent loss of confidentiality.
 */
import { NONE } from '@domain/manifest';

import { DecryptFailure, type PayloadCipher } from '@core/contracts';

/**
 * The disabled cipher (§19.4 Disabled).
 *
 * Not a placeholder for encryption: it is the specified behaviour when
 * encryption is off. §19.16.10 requires that enabling or disabling encryption
 * changes no protocol semantics, and passing bytes through unchanged is what
 * that means at this seam.
 */
export function createDisabledCipher(): PayloadCipher {
  return {
    algorithm: NONE,

    supports(algorithm) {
      return algorithm === NONE;
    },

    encrypt(plaintext) {
      return plaintext;
    },

    decrypt(ciphertext) {
      return { ok: true, plaintext: ciphertext };
    },
  };
}

/**
 * A cipher that refuses everything, for a receiver told to expect encryption
 * this build cannot perform.
 *
 * §19.14 requires the transfer to fail when the receiver does not support the
 * negotiated algorithm, and §19.15 requires unknown *mandatory* algorithms to
 * be rejected. Returning the ciphertext unchanged would present encrypted
 * bytes as a file — which then fails integrity verification for the wrong
 * reason, and reports the wrong thing to the user.
 *
 * @param algorithm The algorithm the manifest named.
 */
export function createUnsupportedCipher(algorithm: string): PayloadCipher {
  return {
    algorithm,

    supports() {
      return false;
    },

    encrypt() {
      throw new Error(`Cannot encrypt: ${algorithm} is not supported by this build.`);
    },

    decrypt() {
      return { ok: false, reason: DecryptFailure.UnsupportedAlgorithm };
    },
  };
}

/**
 * Chooses a cipher for the algorithm a manifest names (§19.14, §24.11).
 *
 * `NONE` — and only `NONE` — yields a working cipher. Everything else yields
 * one that refuses, so an unsupported algorithm becomes a reported failure
 * rather than a corrupt file.
 */
export function cipherFor(algorithm: string): PayloadCipher {
  return algorithm === NONE ? createDisabledCipher() : createUnsupportedCipher(algorithm);
}
