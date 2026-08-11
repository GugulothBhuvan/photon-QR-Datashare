/**
 * SHA-256 and the integrity verifier (SEC-003) — FIPS 180-4; PROTOCOL_SPEC §20.
 *
 * The algorithm is pinned to the **standard's own published vectors**, not to
 * this implementation's output. That distinction is the whole value of the
 * file: a test written by hashing the input and pasting the result would pass
 * against any consistent-but-wrong implementation, and §20.17.6 requires
 * verification to be deterministic *across compliant implementations* — which
 * means matching everyone else, not matching ourselves.
 */
import { createSha256Verifier, constantTimeEquals } from '@security/integrity';
import { sha256, SHA256_ALGORITHM, SHA256_DIGEST_LENGTH } from '@security/sha256';
import { bytesToHex } from '@utils/hex';

function utf8(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'utf8'));
}

describe('sha256 against the published vectors (FIPS 180-4)', () => {
  it.each([
    // The empty string — the canonical first check.
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    // FIPS 180-4 Appendix B.1: one block.
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    // FIPS 180-4 Appendix B.2: two blocks, 448 bits.
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    // 896 bits: the case where padding needs an extra block.
    [
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    ],
    // A single byte, and a byte that is not ASCII.
    ['a', 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb'],
    [
      'The quick brown fox jumps over the lazy dog',
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    ],
  ])('hashes %j correctly', (input, expected) => {
    expect(bytesToHex(sha256(utf8(input)))).toBe(expected);
  });

  it('hashes exactly 55 bytes, where padding just fits one block', () => {
    // 55 bytes plus the 0x80 marker plus 8 length bytes is exactly 64. One byte
    // more needs a second block — the boundary an off-by-one lands on.
    expect(bytesToHex(sha256(utf8('a'.repeat(55))))).toBe(
      '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318',
    );
  });

  it('hashes exactly 56 bytes, which forces a second block', () => {
    expect(bytesToHex(sha256(utf8('a'.repeat(56))))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    );
  });

  it('hashes exactly 64 bytes, a whole block with no room left', () => {
    expect(bytesToHex(sha256(utf8('a'.repeat(64))))).toBe(
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
    );
  });

  it('hashes a million characters (FIPS 180-4 Appendix B.3)', () => {
    // The standard's long-message vector. It exercises multi-block processing
    // and the 64-bit length encoding at a size no other test reaches.
    expect(bytesToHex(sha256(utf8('a'.repeat(1_000_000))))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('hashes arbitrary bytes, not only text', () => {
    // Every byte value 0x00–0xFF in order. A digest over binary data must not
    // depend on any text encoding, which §20.15 requires.
    const bytes = Uint8Array.from({ length: 256 }, (_unused, index) => index);

    expect(bytesToHex(sha256(bytes))).toBe(
      '40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880',
    );
  });

  it('always produces 32 bytes', () => {
    for (const length of [0, 1, 63, 64, 65, 1000]) {
      expect(sha256(new Uint8Array(length))).toHaveLength(SHA256_DIGEST_LENGTH);
    }
  });

  it('changes completely when one input bit changes', () => {
    // Not a proof of the avalanche property — a property test cannot be — but a
    // check that this is a hash and not, say, a checksum with a hash's name.
    const left = sha256(utf8('photon'));
    const right = sha256(utf8('photom'));

    let differing = 0;

    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        differing += 1;
      }
    }

    expect(differing).toBeGreaterThan(24);
  });

  it('is deterministic (§20.17.6)', () => {
    const bytes = utf8('the same input');

    expect(bytesToHex(sha256(bytes))).toBe(bytesToHex(sha256(bytes)));
  });
});

describe('constantTimeEquals', () => {
  it('reports equality and inequality correctly', () => {
    expect(constantTimeEquals(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 3]))).toBe(true);
    expect(constantTimeEquals(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 4]))).toBe(false);
  });

  it('rejects a length mismatch rather than comparing a prefix', () => {
    expect(constantTimeEquals(Uint8Array.from([1, 2]), Uint8Array.from([1, 2, 3]))).toBe(false);
  });

  it('detects a difference in the first byte as readily as the last', () => {
    const base = Uint8Array.from([1, 2, 3, 4]);

    expect(constantTimeEquals(base, Uint8Array.from([9, 2, 3, 4]))).toBe(false);
    expect(constantTimeEquals(base, Uint8Array.from([1, 2, 3, 9]))).toBe(false);
  });

  it('treats two empty arrays as equal', () => {
    expect(constantTimeEquals(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});

describe('the SHA-256 verifier (§20.7)', () => {
  const verifier = createSha256Verifier();

  it('names the algorithm as the manifest records it (§20.8)', () => {
    expect(verifier.algorithm).toBe(SHA256_ALGORITHM);
    expect(verifier.algorithm).toBe('SHA-256');
  });

  it('accepts data matching its digest', () => {
    const bytes = utf8('abc');

    expect(verifier.verify(bytes, verifier.digest(bytes))).toBe(true);
  });

  it('rejects data that does not match (§20.6)', () => {
    expect(verifier.verify(utf8('abc'), verifier.digest(utf8('abd')))).toBe(false);
  });

  it('rejects a digest of the wrong length rather than matching a prefix', () => {
    // A truncated expectation must fail. Comparing only the bytes supplied
    // would let a 1-byte "hash" pass 1-in-256 of the time.
    const bytes = utf8('abc');
    const full = verifier.digest(bytes);

    expect(verifier.verify(bytes, full.slice(0, 16))).toBe(false);
    expect(verifier.verify(bytes, new Uint8Array(0))).toBe(false);
    expect(verifier.verify(bytes, new Uint8Array(64))).toBe(false);
  });

  it('rejects a digest that is right except for one bit', () => {
    const bytes = utf8('abc');
    const tampered = Uint8Array.from(verifier.digest(bytes));
    tampered[31] = (tampered[31] as number) ^ 0x01;

    expect(verifier.verify(bytes, tampered)).toBe(false);
  });

  it('produces the standard digest, so another implementation agrees', () => {
    expect(bytesToHex(verifier.digest(utf8('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
