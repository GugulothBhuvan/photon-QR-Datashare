/**
 * IntegrityVerifier — the seam to whatever checks integrity.
 *
 * PROTOCOL_SPEC §3.22 defines two levels of integrity verification, packet and
 * file, and §20 owns the algorithms. The protocol engine needs to *know the
 * verdict* — §10.8 requires a manifest to be verified before acceptance, and
 * §11.12.5 requires packet integrity before storage — without computing it.
 *
 * Declaring this as a contract is what lets the managers take a verdict as an
 * input rather than reaching for a hash implementation, and what will let the
 * security phase supply a real one without touching a manager.
 */
export interface IntegrityVerifier {
  /**
   * Whether `bytes` matches the expected digest.
   *
   * @param bytes The data to check.
   * @param expected The digest carried alongside it.
   */
  verify(bytes: Uint8Array, expected: Uint8Array): boolean;

  /** Computes a digest over `bytes` using the configured algorithm. */
  digest(bytes: Uint8Array): Uint8Array;

  /** Names the algorithm, for the manifest's protocol configuration (§10.5). */
  readonly algorithm: string;
}
