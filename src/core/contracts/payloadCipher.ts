/**
 * PayloadCipher — the seam to whatever provides confidentiality.
 *
 * PROTOCOL_SPEC §19 makes encryption an **optional** protocol feature and
 * §19.5 fixes its scope precisely: the file payload is encrypted, and session
 * id, protocol version, packet type, packet index, file id and manifest
 * structure stay readable. This contract exists so that scope is structural.
 * A cipher here can only ever see a file's bytes; it is not reachable from the
 * header, so §19.16.4 cannot be violated by a mistake in a cipher.
 *
 * **Where it sits in the pipeline.** §19.3 fixes the order and §19.16.1–2
 * make it an invariant:
 *
 * ```text
 * sender:    file → compress → ENCRYPT → packetize → transport
 * receiver:  transport → reassemble → DECRYPT → decompress → verify integrity
 * ```
 *
 * So a cipher operates on a whole file stream, once, before packets exist —
 * not per packet. §19.9's "packet payloads SHALL be encrypted before
 * packetization" describes the same thing from the other end: by the time
 * packets are cut, the bytes are already ciphertext.
 *
 * §19.16.9 and §20.9 put decryption **before** integrity verification, which
 * means the manifest's expected hash is over plaintext.
 *
 * **This is a contract, not an algorithm.** No algorithm is chosen here. The
 * composition root names one, and OSP/1.0 in this build supports only `NONE` —
 * see `src/security/cipher.ts` for why, and SI-012 for what blocks the rest.
 */

/** Whether a decryption attempt produced plaintext, and why not if it did not. */
export const DecryptFailure = {
  /** The manifest named an algorithm this build cannot perform (§19.14, §24.11). */
  UnsupportedAlgorithm: 'UNSUPPORTED_ALGORITHM',
  /** Authentication failed: tampered ciphertext or a wrong key (§19.10). */
  AuthenticationFailed: 'AUTHENTICATION_FAILED',
  /** The ciphertext was malformed — truncated, or missing its tag. */
  Malformed: 'MALFORMED',
  /** No encryption context was established for the session (§19.7). */
  NoContext: 'NO_CONTEXT',
} as const;

export type DecryptFailure = (typeof DecryptFailure)[keyof typeof DecryptFailure];

/** A successful decryption. */
export interface DecryptSuccess {
  readonly ok: true;
  readonly plaintext: Uint8Array;
}

/** A refused decryption. §19.11: reconstruction fails and integrity never runs. */
export interface DecryptRejection {
  readonly ok: false;
  readonly reason: DecryptFailure;
}

export type DecryptResult = DecryptSuccess | DecryptRejection;

export interface PayloadCipher {
  /**
   * Names the algorithm, as the manifest records it (§19.8).
   *
   * `'NONE'` when encryption is disabled — the same spelling the manifest uses.
   */
  readonly algorithm: string;

  /** Whether this cipher can perform the algorithm a manifest names (§19.14). */
  supports(algorithm: string): boolean;

  /**
   * Encrypts a whole file stream (§19.3, §19.9).
   *
   * Called once per file, before packetization.
   */
  encrypt(plaintext: Uint8Array): Uint8Array;

  /**
   * Decrypts a reassembled stream (§19.11).
   *
   * Reports failure rather than throwing: §19.11 requires a failed decryption
   * to fail the transfer, and a result the caller must inspect is harder to
   * ignore than an exception it might catch.
   */
  decrypt(ciphertext: Uint8Array): DecryptResult;
}
