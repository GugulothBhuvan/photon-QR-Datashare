# ADR-0002: QR Library Selection

**Status:** Accepted
**Date:** Phase 5 (QR-001)

---

## Context

`planning/DEPENDENCIES.md` §9 permits a QR library and requires every
third-party dependency to be reviewed before adoption. This is that review.

QR encoding is not reasonably hand-written: it needs Reed-Solomon error
correction over GF(256), eight mask patterns with penalty scoring, version
capacity tables and format-information encoding. Getting any of it subtly wrong
produces codes that scan on one device and fail on another.

Two constraints bind the choice.

1. **`QR_SPEC.md` §5: "QR encoding SHALL preserve binary payloads exactly."**
   Protocol packets are arbitrary bytes — a header contains `0x00` bytes and
   UUID bytes across the full range. A library that treats input as text and
   re-encodes it as UTF-8 corrupts roughly half of all byte values, silently.

2. **It must run under React Native.** No DOM, no Node filesystem, and only the
   `TextDecoder` that Expo's runtime polyfill provides.

## Candidates

| Library | Version | Dependencies | Binary input | Runs under Expo |
| --- | --- | --- | --- | --- |
| `@nuintun/qrcode` | 5.0.3 | `tslib` | Via an injected text encoder | **No** |
| `qrcode-generator` | 2.0.4 | none | Only by setting a module-global | Yes |
| `qrcode` | 1.5.4 | `pngjs`, `yargs`, `dijkstrajs` | **Native `Uint8Array` byte segments** | Yes, via the core module |

### `@nuintun/qrcode` was chosen first, then rejected

It looked strongest: one small dependency, and a decoder included for Phase 6.
It was adopted, an adapter was built around it, and it failed on first test run:

```text
RangeError: Unknown encoding: gb2312 (normalized: gb2312)
  at new TextDecoder (expo/src/winter/TextDecoder.ts)
```

Its entry point eagerly constructs charset mapping tables for every encoding QR
can declare, including `gb2312`, which Expo's `TextDecoder` polyfill does not
implement. The package's `exports` field permits no deep import, so the decoder
is unavoidable even when only the encoder is wanted. It works under Node, whose
full-ICU `TextDecoder` has `gb2312` — which is precisely why this surfaced in
the test run rather than in the probe.

**This is why the review runs the candidate in the target runtime, not just in
Node.** Recorded rather than quietly reversed, because the failure mode —
looks fine locally, breaks on device — is worth remembering.

## Decision

**`qrcode` 1.5.4**, imported as `qrcode/lib/core/qrcode`, pinned to an exact
version.

1. **Binary preservation is structural, not careful.** The core encoder accepts
   `[{ data: Uint8Array, mode: 'byte' }]` — the payload never crosses a text
   boundary, so there is no character set to get wrong. This removed an entire
   module: an earlier draft carried a `binaryText.ts` bridge to survive a string
   boundary that no longer exists. **The best outcome of this review was
   deleting code, not adding it.**

2. **No global mutable state.** `qrcode-generator` is smaller and
   dependency-free, but binary input requires assigning a module-global
   `stringToBytes`, which AGENTS.md §6 asks us to avoid and which would apply
   process-wide.

3. **The heavy dependencies are not reachable.** `pngjs` and `yargs` belong to
   the PNG renderer and the CLI. The core module pulls only `dijkstrajs`, used
   for optimal segmentation. Both public entries (`lib/server.js`,
   `lib/browser.js`) require Node or DOM APIs and are unusable in React Native
   regardless — so importing the core module is the intended path for this
   environment, not a workaround.

## Consequences

**Deep import.** `qrcode/lib/core/qrcode` is not the package's advertised entry.
Version 1.5.4 declares no `exports` field, so it resolves; a future version
could restrict it. Mitigated by pinning the exact version, by declaring the
surface used in `src/qr/qrcodeCore.d.ts` — narrow on purpose, so a break shows
up there — and by tests that assert the encoder reproduces the library's own
matrix byte for byte.

**Typings.** `@types/qrcode` covers only the public entries, so
`src/qr/qrcodeCore.d.ts` declares the four types actually used.

**Isolation.** The library is named in `src/qr/qrEncoder.ts` and nowhere else.
`eslint.config.js` treats `src/qr` as an adapter, so the protocol engine cannot
import it, and replacing the library means rewriting one file.

**Decoding is now an open question.** The rejected candidate would have supplied
it. Phase 6 selects a decoder separately; `qrcode` does not decode.

**Licence.** MIT.

**Not adopted:** any rendering library. §13 concerns rendering, and a matrix of
modules is enough to render with primitives the UI already has.
