/**
 * SHA-256 (SEC-003) — FIPS 180-4; PROTOCOL_SPEC §20.7.
 *
 * §20.7 requires every compliant implementation to support at least one common
 * cryptographic hash algorithm and names SHA-256 first. §20.17.6 requires
 * integrity verification to be deterministic across all compliant
 * implementations, which a published algorithm with published test vectors is
 * and an invented one is not.
 *
 * **This is a straight implementation of FIPS 180-4, not a design.** Every
 * constant below is from the standard: the eight initial hash values are the
 * fractional parts of the square roots of the first eight primes, and the
 * sixty-four round constants are the fractional parts of the cube roots of the
 * first sixty-four primes. Nothing here is chosen. Correctness is pinned by the
 * standard's own test vectors in the tests, including the one-million-`a`
 * vector that exercises multi-block processing and length encoding.
 *
 * **Why not a library.** See ADR-0004. In short: `IntegrityVerifier` is a
 * frozen synchronous contract and `expo-crypto` is asynchronous; `crypto-js`
 * is unmaintained; Node's `crypto` does not exist in React Native. A hash is
 * also the one primitive where a self-contained implementation is fully
 * verifiable from public vectors — unlike a cipher, where key handling and
 * side channels matter and where this project must not roll its own (§19).
 *
 * Pure and allocation-light: same input, same output, no clock, no randomness.
 */

/** FIPS 180-4 §4.2.2: fractional parts of the cube roots of the first 64 primes. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** FIPS 180-4 §5.3.3: fractional parts of the square roots of the first 8 primes. */
const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/** Digest length in bytes. */
export const SHA256_DIGEST_LENGTH = 32;

/** The algorithm's name, as it appears in a manifest (§20.8). */
export const SHA256_ALGORITHM = 'SHA-256';

const BLOCK_BYTES = 64;

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * Computes the SHA-256 digest of `bytes`.
 *
 * @returns 32 bytes, big-endian, as FIPS 180-4 defines the output.
 */
export function sha256(bytes: Uint8Array): Uint8Array {
  const h = Uint32Array.from(H0);
  const w = new Uint32Array(64);

  // FIPS 180-4 §5.1.1: append a 1 bit, pad with zeros, then the message length
  // in bits as a 64-bit big-endian integer.
  const bitLength = bytes.length * 8;
  const paddedLength = ((bytes.length + 9 + (BLOCK_BYTES - 1)) / BLOCK_BYTES) | 0;
  const padded = new Uint8Array(paddedLength * BLOCK_BYTES);

  padded.set(bytes);
  padded[bytes.length] = 0x80;

  // The high word of the length. Lengths beyond 2^53 bits are unreachable in a
  // JavaScript runtime, so the top 21 bits are written from a float division
  // rather than a bigint.
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  const lengthOffset = padded.length - 8;

  padded[lengthOffset] = (high >>> 24) & 0xff;
  padded[lengthOffset + 1] = (high >>> 16) & 0xff;
  padded[lengthOffset + 2] = (high >>> 8) & 0xff;
  padded[lengthOffset + 3] = high & 0xff;
  padded[lengthOffset + 4] = (low >>> 24) & 0xff;
  padded[lengthOffset + 5] = (low >>> 16) & 0xff;
  padded[lengthOffset + 6] = (low >>> 8) & 0xff;
  padded[lengthOffset + 7] = low & 0xff;

  for (let offset = 0; offset < padded.length; offset += BLOCK_BYTES) {
    // FIPS 180-4 §6.2.2 step 1: the message schedule.
    for (let t = 0; t < 16; t += 1) {
      const i = offset + t * 4;
      w[t] =
        (((padded[i] as number) << 24) |
          ((padded[i + 1] as number) << 16) |
          ((padded[i + 2] as number) << 8) |
          (padded[i + 3] as number)) >>>
        0;
    }

    for (let t = 16; t < 64; t += 1) {
      const w15 = w[t - 15] as number;
      const w2 = w[t - 2] as number;
      const s0 = (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) >>> 0;

      w[t] = (((w[t - 16] as number) + s0 + (w[t - 7] as number) + s1) | 0) >>> 0;
    }

    // §6.2.2 step 2: initialise the working variables.
    let a = h[0] as number;
    let b = h[1] as number;
    let c = h[2] as number;
    let d = h[3] as number;
    let e = h[4] as number;
    let f = h[5] as number;
    let g = h[6] as number;
    let hh = h[7] as number;

    // §6.2.2 step 3: the compression function.
    for (let t = 0; t < 64; t += 1) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (hh + S1 + ch + (K[t] as number) + (w[t] as number)) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    // §6.2.2 step 4: the intermediate hash value.
    h[0] = ((h[0] as number) + a) >>> 0;
    h[1] = ((h[1] as number) + b) >>> 0;
    h[2] = ((h[2] as number) + c) >>> 0;
    h[3] = ((h[3] as number) + d) >>> 0;
    h[4] = ((h[4] as number) + e) >>> 0;
    h[5] = ((h[5] as number) + f) >>> 0;
    h[6] = ((h[6] as number) + g) >>> 0;
    h[7] = ((h[7] as number) + hh) >>> 0;
  }

  const digest = new Uint8Array(SHA256_DIGEST_LENGTH);

  for (let i = 0; i < 8; i += 1) {
    const value = h[i] as number;
    digest[i * 4] = (value >>> 24) & 0xff;
    digest[i * 4 + 1] = (value >>> 16) & 0xff;
    digest[i * 4 + 2] = (value >>> 8) & 0xff;
    digest[i * 4 + 3] = value & 0xff;
  }

  return digest;
}
