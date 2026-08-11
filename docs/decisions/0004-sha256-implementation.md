# ADR-0004 — SHA-256 is implemented in the repository

**Status:** Accepted
**Date:** Phase 11 (SEC-003)
**Supersedes:** the placeholder digest recorded as A12-04

---

## Context

`PROTOCOL_SPEC.md` §20.7 requires every compliant implementation to support at
least one common cryptographic hash algorithm and names SHA-256 first.
`SECURITY.md` §6 is more direct still: file integrity **is** SHA-256. §20.17.6
requires integrity verification to be deterministic across all compliant
implementations.

`IntegrityVerifier` is a **stable contract** (`docs/CONTRACTS.md`). Its
`digest` and `verify` are synchronous, and changing that would require an ADR of
its own, a compatibility review, and changes in the reconstruction path, the
manifest manager and every caller that treats verification as a step rather than
an await.

Three sources of a SHA-256 implementation were available.

| Option | Problem |
| --- | --- |
| `expo-crypto` | Named in TRD §3, but its digest API is **asynchronous**. Using it means changing a frozen synchronous contract. |
| `crypto-js` | Also named in TRD §3, and synchronous — but the project was discontinued by its maintainer, and it would add a broad dependency for one function. |
| Node `crypto` / `crypto.subtle` | Node's module does not exist in React Native. `crypto.subtle` is asynchronous and not present by default in React Native. |

Neither named dependency is currently installed.

---

## Decision

Implement SHA-256 in `src/security/sha256.ts`, directly from FIPS 180-4, and
pin it in tests to the standard's own published vectors.

---

## Why this is acceptable here, and would not be for a cipher

The reflex "do not roll your own crypto" is sound, and it is about the failure
modes of *ciphers and protocols*: key handling, nonce reuse, padding oracles,
timing side channels. A wrong AES-GCM passes a round-trip test and is broken.

A hash has none of those properties. SHA-256 is a fixed, public function with no
key, no nonce and no secret input. Its correctness is a total function of its
output on known inputs, and the standard publishes those inputs. The tests use
them — including FIPS 180-4 Appendix B.3's one-million-character vector, which
exercises multi-block processing and the 64-bit length encoding — so an
implementation that is wrong in any respect cannot pass.

The same reasoning **does not** extend to encryption, and §19's cipher is
deliberately not implemented here. See SI-012 and `src/security/cipher.ts`.

---

## Consequences

**Good.**

- The frozen `IntegrityVerifier` contract is unchanged.
- No dependency is added, and the protocol engine stays dependency-light —
  an architecture principle, not a preference.
- The digest is deterministic and identical on every platform, which §20.17.6
  requires and which a platform-provided implementation would also give but a
  polyfill might not.
- It is testable in Node, in Jest, and on a device with no native module.

**Bad.**

- It is hand-written cryptographic code, and hand-written code can be wrong.
  Mitigated by the published vectors, and by the fact that a wrong answer is
  loudly wrong rather than subtly weak.
- It is slower than a native implementation. This is measured in
  `tests/performance/`, and hashing is nowhere near the pipeline's cost —
  decoding dominates by roughly an order of magnitude.

**Revisit when** an audited synchronous digest enters the dependency set, or
when the contract is reopened for another reason. At that point this module
becomes a fallback rather than the implementation, and the tests move with it
unchanged — they test SHA-256, not this file.
