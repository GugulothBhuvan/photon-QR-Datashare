/**
 * Encryption seam and session security context (SEC-001, SEC-002)
 * — PROTOCOL_SPEC §19; SECURITY.md §7, §8, §9.
 *
 * These are the two security primitives that are **not** algorithms: the seam
 * a cipher plugs into, and the isolation a session's secrets live in. The
 * algorithm itself — SHA-256 — is pinned in `sha256.test.ts`, and the
 * end-to-end behaviour is in `tests/system/security.test.ts`; neither is
 * repeated here.
 *
 * The refusal path gets the most attention, because it is the one that matters
 * while no cipher exists: a build that cannot decrypt must say so, not hand
 * back ciphertext.
 */
import { cipherFor, createDisabledCipher, createUnsupportedCipher } from '@security/cipher';
import { createSecurityContextStore } from '@security/securityContext';
import { DecryptFailure } from '@core/contracts';
import { NONE } from '@domain/manifest';
import { sessionId } from '@domain/ids';

const SESSION_A = sessionId('11111111-1111-4111-8111-111111111111');
const SESSION_B = sessionId('22222222-2222-4222-8222-222222222222');

describe('the disabled cipher (§19.4 Disabled)', () => {
  const cipher = createDisabledCipher();

  it('names itself as the manifest spells it (§19.8)', () => {
    expect(cipher.algorithm).toBe(NONE);
    expect(cipher.algorithm).toBe('NONE');
  });

  it('supports NONE and nothing else', () => {
    expect(cipher.supports(NONE)).toBe(true);
    expect(cipher.supports('AES-256-GCM')).toBe(false);
    expect(cipher.supports('')).toBe(false);
  });

  it('passes bytes through unchanged in both directions (§19.16.10)', () => {
    // §19.16.10: enabling or disabling encryption alters no protocol semantics.
    // At this seam that means the bytes are the bytes.
    const plaintext = Uint8Array.from([1, 2, 3, 4, 5]);
    const encrypted = cipher.encrypt(plaintext);
    const decrypted = cipher.decrypt(encrypted);

    expect(Array.from(encrypted)).toEqual([1, 2, 3, 4, 5]);
    expect(decrypted.ok).toBe(true);
    expect(decrypted.ok ? Array.from(decrypted.plaintext) : []).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles an empty stream', () => {
    const result = cipher.decrypt(cipher.encrypt(new Uint8Array(0)));

    expect(result.ok).toBe(true);
    expect(result.ok ? result.plaintext.byteLength : -1).toBe(0);
  });
});

describe('the unsupported cipher (§19.14, §19.15)', () => {
  const cipher = createUnsupportedCipher('AES-256-GCM');

  it('reports the algorithm it cannot perform', () => {
    expect(cipher.algorithm).toBe('AES-256-GCM');
    expect(cipher.supports('AES-256-GCM')).toBe(false);
    expect(cipher.supports(NONE)).toBe(false);
  });

  it('refuses to decrypt, naming the reason', () => {
    // The decisive property. Returning the ciphertext would present encrypted
    // bytes as a file, which then fails integrity verification for the wrong
    // reason and tells the user the wrong thing.
    const result = cipher.decrypt(Uint8Array.from([1, 2, 3]));

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.reason).toBe(DecryptFailure.UnsupportedAlgorithm);
  });

  it('refuses to encrypt rather than emitting plain text', () => {
    // A sender that silently sent plain text when asked for encryption would
    // be the worst outcome available: the user believes the transfer is
    // confidential and it is not.
    expect(() => cipher.encrypt(Uint8Array.from([1]))).toThrow(/not supported/);
  });
});

describe('cipherFor', () => {
  it('gives a working cipher only for NONE', () => {
    expect(cipherFor(NONE).supports(NONE)).toBe(true);
  });

  it.each(['AES-256-GCM', 'ChaCha20-Poly1305', 'AES-128-CBC', 'unknown', ''])(
    'gives a refusing cipher for %j',
    (algorithm) => {
      const result = cipherFor(algorithm).decrypt(Uint8Array.from([1]));

      expect(result.ok).toBe(false);
    },
  );

  it('is case sensitive, so a near-miss is refused rather than guessed', () => {
    // §24.11 and §19.15 require unknown algorithms to be rejected. Accepting
    // 'none' would be guessing at a wire spelling no section defines.
    expect(cipherFor('none').supports(NONE)).toBe(false);
  });
});

describe('session security context (SECURITY.md §7, §8)', () => {
  it('keeps each session’s context separate', () => {
    // §7: security information SHALL NOT be shared across Sessions.
    const store = createSecurityContextStore();

    store.establish(SESSION_A, { algorithm: NONE, key: Uint8Array.from([1, 2, 3]) });
    store.establish(SESSION_B, { algorithm: NONE, key: Uint8Array.from([9, 9, 9]) });

    expect(store.get(SESSION_A)?.key?.[0]).toBe(1);
    expect(store.get(SESSION_B)?.key?.[0]).toBe(9);
  });

  it('refuses to replace an established context (§19.12)', () => {
    // §19.12: once negotiated, encryption parameters remain unchanged for the
    // session. Silently replacing one would break that invariant.
    const store = createSecurityContextStore();

    expect(store.establish(SESSION_A, { algorithm: NONE })).toBe(true);
    expect(store.establish(SESSION_A, { algorithm: 'AES-256-GCM' })).toBe(false);
    expect(store.get(SESSION_A)?.algorithm).toBe(NONE);
  });

  it('reports whether a session has a context', () => {
    const store = createSecurityContextStore();

    expect(store.has(SESSION_A)).toBe(false);
    store.establish(SESSION_A, { algorithm: NONE });
    expect(store.has(SESSION_A)).toBe(true);
    expect(store.get(SESSION_B)).toBeUndefined();
  });

  it('overwrites key material when a session is destroyed (§7)', () => {
    // §7: session termination SHALL destroy temporary security state. Dropping
    // the reference is not destroying it — the bytes would sit in memory until
    // a collector that may never run reclaims them.
    const store = createSecurityContextStore();
    const key = Uint8Array.from([7, 7, 7, 7]);

    store.establish(SESSION_A, { algorithm: NONE, key });

    expect(store.destroy(SESSION_A)).toBe(true);

    // The caller's own reference is now zeroed, which is the observable proof
    // the wipe happened in place rather than on a copy.
    expect(Array.from(key)).toEqual([0, 0, 0, 0]);
    expect(store.get(SESSION_A)).toBeUndefined();
  });

  it('reports destroying a session that has no context', () => {
    const store = createSecurityContextStore();

    expect(store.destroy(SESSION_A)).toBe(false);
  });

  it('destroys every context, wiping each', () => {
    const store = createSecurityContextStore();
    const first = Uint8Array.from([1, 1]);
    const second = Uint8Array.from([2, 2]);

    store.establish(SESSION_A, { algorithm: NONE, key: first });
    store.establish(SESSION_B, { algorithm: NONE, key: second });

    store.destroyAll();

    expect(Array.from(first)).toEqual([0, 0]);
    expect(Array.from(second)).toEqual([0, 0]);
    expect(store.sessions()).toEqual([]);
  });

  it('handles a context with no key material', () => {
    // This build negotiates no keys (SI-012), so this is the ordinary case.
    const store = createSecurityContextStore();

    store.establish(SESSION_A, { algorithm: NONE });

    expect(() => store.destroy(SESSION_A)).not.toThrow();
  });

  it('lists the sessions holding a context', () => {
    const store = createSecurityContextStore();

    store.establish(SESSION_A, { algorithm: NONE });
    store.establish(SESSION_B, { algorithm: NONE });

    expect(store.sessions()).toEqual([SESSION_A, SESSION_B]);
  });
});
