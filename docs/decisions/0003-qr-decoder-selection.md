# ADR-0003: QR Decoder Selection

**Status:** Accepted
**Date:** Phase 6 (CAM-003, CAM-004)

---

## Context

ADR-0002 selected `qrcode` for encoding and left decoding explicitly open:
`qrcode` does not decode, and the candidate that would have supplied both was
rejected for failing under the Expo runtime.

QR_SPEC §14 requires the decoder to detect symbols, correct perspective
distortion where supported, decode payload bytes and validate QR integrity.
§18 requires every decoded frame to be validated before the payload reaches the
packet layer.

Two constraints, the same as before:

1. **Binary payloads must survive.** Protocol packets are arbitrary bytes. A
   decoder that returns only a UTF-8 string has already destroyed the payload
   by the time we see it — the corruption happens inside the library.
2. **It must run under React Native**, which rules out anything needing a DOM,
   a canvas, or a full-ICU `TextDecoder`.

## Decision

**`jsqr` 1.4.0.**

1. **It returns raw bytes.** `binaryData` is the decoded byte array before any
   text interpretation, so §14's "decoded payloads SHALL be forwarded unchanged"
   is satisfiable. A decoder offering only `data: string` could not be used
   here at any price.

2. **Its input is a plain RGBA buffer.** `jsQR(data, width, height)` takes a
   `Uint8ClampedArray` and nothing else — no canvas, no DOM, no image decoding.
   That is exactly the shape a camera frame arrives in, and it is what makes
   the receive path testable against synthetic frames.

3. **Zero dependencies, and it locates symbols itself.** It finds the finder
   patterns, corrects perspective and resolves error correction — all four of
   §14's requirements — without a second library for detection.

Verified before adoption by closing the whole loop in the target test runtime:
real packet bytes → `qrcode` encode → rasterise → `jsQR` decode → byte-identical
payload that still passes its own CRC. That check is now
`tests/integration/opticalLoopback.test.ts`, so it keeps holding.

## Consequences

**Isolation.** Named only in `src/camera/qrDecoder.ts`. Everything above depends
on the `QrDecoder` interface, and `eslint.config.js` treats `src/camera` as an
adapter, so the protocol engine cannot reach it.

**The encode and decode libraries differ.** `qrcode` encodes and `jsqr`
decodes, which is one more dependency than a single library would have needed.
It is also a genuine advantage: an encoder and a decoder from different authors
agreeing on the bytes is a stronger check of correctness than one library
agreeing with itself. The loopback test would not catch a shared misreading of
the QR standard if both halves came from the same source.

**Maintenance.** `jsqr` has been stable at 1.4.0 for some time and is widely
deployed. If it stagnates, the alternatives are `@zxing/library` (heavier, but
actively maintained) or the native detectors both platforms provide — the
latter reachable behind the same `QrDecoder` interface without touching
anything above it.

**Not adopted:** a native camera module. `react-native-vision-camera` needs a
development build and a UI to host it, neither of which exists yet. The
`CameraAdapter` port and an in-memory implementation are enough to build and
test the entire receive pipeline; the device adapter arrives with the UI phase
and implements the same port.

**Licence.** Apache-2.0.
