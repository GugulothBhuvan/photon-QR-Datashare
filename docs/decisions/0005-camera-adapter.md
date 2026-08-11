# ADR-0005 — VisionCamera for the device camera adapter

**Status:** Accepted
**Date:** Milestone D (hardware validation)
**Resolves:** SI-013 (implementation); A12-01 (implementation)

---

## Context

Photon's receive path needs frames from a real camera. The requirement is fixed
by two sections of `QR_SPEC.md`:

- **§12** — the receiver SHOULD *continuously capture frames* and *decode
  frames as quickly as practical*.
- **§14** — the decoder SHALL *decode payload bytes*, and *decoded payloads
  SHALL be forwarded unchanged to the Packet Layer*.

"Unchanged" is the demanding half. Photon's packets are arbitrary binary — a
50-byte header, raw payload bytes, a CRC32 footer — carried in QR byte-mode
segments (ADR-0002). Arbitrary bytes are not valid UTF-8, so any path that
represents a payload as a JavaScript string replaces invalid sequences with
U+FFFD and changes the length. The CRC then fails, if parsing survives at all.

`TRD.md` §3 names `expo-camera` as the MVP camera. It cannot meet either
requirement, verified against the published `expo-camera@57.0.3` package rather
than assumed:

| API | Returns | Why it fails |
| --- | --- | --- |
| `onBarcodeScanned` | `{ data: string, raw?: string }` | Both fields are strings. No `Uint8Array`, `ArrayBuffer` or byte accessor exists anywhere in its declarations. |
| `takePictureAsync` | `CameraCapturedPicture`, `format: 'jpg' \| 'png'` | A compressed image, not pixels — and still capture, not continuous capture (§12). |

It declares no `onFrame`, no `frameProcessor` and no pixel accessor at all.

---

## Alternatives considered

| Option | Verdict |
| --- | --- |
| **`expo-camera` barcode scanning** | Rejected. Loses binary payloads (§14). This is the same defect ADR-0002 fixed on the encoding side, arriving from the other direction. |
| **`expo-camera` + `takePictureAsync` + a JS JPEG decoder** | Rejected. Preserves bytes but is still capture, not continuous (§12), and adds an image-decoder dependency to work around a camera that was chosen for convenience. |
| **Custom native module exposing ML Kit `Barcode.getRawBytes()`** | Rejected for now. ML Kit does return bytes on Android, but writing and maintaining a native module is a larger commitment than swapping a library, and it would be Android-only. |
| **Amending the protocol to accept text payloads** | Rejected outright. It would narrow the product to text-safe files, which contradicts §3.8 — a file is any byte sequence. |
| **`react-native-vision-camera`** | **Selected.** |

---

## Decision

Use `react-native-vision-camera@5.2.2` for the device camera, reached only
through the existing `CameraAdapter` contract.

### Why it satisfies the requirement

Verified against the published package's own type declarations:

- `Frame.getPixelBuffer(): ArrayBuffer` — the frame's pixel data as a
  contiguous buffer. Raw bytes, no text.
- `FramePlane.getPixelBuffer(): ArrayBuffer` for planar formats.
- `useFrameOutput({ onFrame })` — a callback for *every* frame the camera sees.
  That is §12's continuous capture.
- `pixelFormat: 'rgb'` — requested directly from the pipeline, so no colour
  conversion happens in our code.

The resulting path contains no string boundary:

```text
Frame (RGB) → getPixelBuffer() → Uint8ClampedArray → CameraFrame
            → jsQR → payload bytes → deserializePacket → CRC
```

`jsQR` was already in the project and already takes pixel buffers, so the
decoder did not change.

### Version decision

Pinned deliberately, not taken as "latest for its own sake":

| Package | Version | Why |
| --- | --- | --- |
| `react-native-vision-camera` | 5.2.2 | The 5.x line is the one built for the Nitro module system and current React Native. |
| `react-native-vision-camera-worklets` | 5.2.2 | Required by `useFrameOutput`; must match the camera's version. |
| `react-native-nitro-modules` | 0.36.5 | Peer dependency of VisionCamera 5. |
| `react-native-nitro-image` | 0.15.1 | Peer dependency of VisionCamera 5. |

The project runs Expo SDK 57 and React Native 0.86.2. None of these packages
declares an incompatible peer range — all four accept `react-native: '*'` — and
no Expo or React Native version was changed to accommodate them.

`react-native-worklets@0.10.1` was already present as a transitive dependency of
`react-native-reanimated` via `expo-router`, so the worklet runtime is not a new
addition.

VisionCamera 5.2.2 ships **no Expo config plugin**, so the Android camera
permission is declared in `app.json` rather than injected by a plugin.

---

## Architecture

The boundary is the point of the decision:

```text
UI  →  CameraAdapter (frozen contract)  →  Frame processing  →  QR  →  Protocol
                ↑
       src/camera/deviceCamera.ts      ← no VisionCamera import
       src/camera/visionCamera.tsx     ← the only importer
```

- **`deviceCamera.ts`** holds the `CameraAdapter` implementation and
  `toCameraFrame`. It imports nothing from VisionCamera, so it runs and is
  tested under Node.
- **`visionCamera.tsx`** holds the `<CameraSource>` component that mounts
  `<Camera>` and pushes frames into the adapter. It is the only file in the
  repository that names the library.

The split was forced by a real constraint and improved the design: importing
VisionCamera pulls in the NitroModules TurboModule, which exists only inside a
native runtime and throws under Node. Putting the contract logic in a
library-free module made the part that can silently corrupt every packet — the
pixel-buffer conversion — testable without a device.

A React component lives in the adapter layer because VisionCamera's frame
stream is bound to a mounted `<Camera>`. The lint boundary permits adapters to
use React and forbids them importing controllers, services or the protocol
core; this file honours that.

---

## Consequences

**Good.**

- §14 is satisfiable on a device for the first time. Bytes stay bytes.
- §12's continuous capture is satisfied by the library's own frame stream.
- The frozen `CameraAdapter` contract did not change, and nothing above it
  knows the camera changed.
- The conversion is unit tested, including the row-stride padding case that
  would otherwise offset every row and decode nothing.

**Bad.**

- Four native packages added, and the Android build must be regenerated.
- Frames cross a thread boundary from the worklet to JavaScript. At full
  resolution that is a large per-frame copy; `targetResolution` is capped at
  1280 to bound it. **The real cost is unmeasured — it needs a device.**
- `visionCamera.tsx` cannot be unit tested. Recorded as an explicit exemption
  in `tests/system/invariants.test.ts` rather than left as a silent gap.
- TRD §3 still names `expo-camera`. That document should be updated to name the
  camera actually used; SI-013 records why.

**SI-013 is not yet resolved.** Installing the library proves the API exists,
not that the pipeline works. It stays `IMPLEMENTATION IN PROGRESS` until a
physical device demonstrates:

```text
VisionCamera → continuous frames → QR detection → raw payload → CameraAdapter → PacketCodec
```

No device has been available, so that demonstration has not happened.
