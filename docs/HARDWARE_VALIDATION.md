# HARDWARE_VALIDATION.md

What has been validated against real Android execution, and what has not.

**Status vocabulary.** These are kept distinct throughout and never collapsed
into a generic "verified":

| State | Meaning |
| --- | --- |
| `NOT TESTED` | No attempt made |
| `SIMULATED` | Exercised with a synthetic input source, in software only |
| `EMULATOR SKIPPED` | Deliberately not pursued — see §4 |
| `PHYSICAL DEVICE VERIFIED` | Observed on real hardware |
| `TWO-DEVICE VERIFIED` | Observed across two devices over a real optical path |
| `MEASURED` | A number was taken under recorded conditions |
| `BLOCKED` | Attempted; a concrete obstacle is recorded |

---

## 1. Tiers

| Tier | Scope | Outcome |
| --- | --- | --- |
| 0 | Existing automated software validation | Clean — see §2 |
| 1 | Android emulator / native environment | See §4 |
| 2 | One physical Android device | See §6 |
| 3 | Two physical devices, real optical transfer | See §7 |

A result in one tier is never reported as evidence for another.

---

## 2. Tier 0 — software baseline

Run to confirm the baseline is healthy before hardware work, not to re-test it.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Clean |
| `npm run lint` | Clean — 0 errors, 0 warnings |
| `npm run format:check` | Clean |
| `npm test` | 1240 passed, 53 suites |
| Statement coverage | 94.3% |
| Branch coverage | 89.4% |
| `npm run build:web` | Succeeds, 9 static routes |

This baseline is what a hardware regression would be detected against.

---

## 3. Environment

### Host

| | |
| --- | --- |
| OS | Windows 11 Home Single Language, 10.0.26200 |
| CPU | 12th Gen Intel Core i5-1240P |
| RAM | 15.7 GB |
| Node | v22.17.0 |
| JDK | Microsoft OpenJDK 17.0.20.8 (hotspot) |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` |
| Build tools | 30.0.3, 34.0.0, 36.0.0 |
| adb | 1.0.41 |

### Emulator

| | |
| --- | --- |
| AVD | `Medium_Phone_API_34` |
| Model | `sdk_gphone64_x86_64` |
| Android | 14 (API 34) |
| ABI | x86_64 |
| Fingerprint | `google/sdk_gphone64_x86_64/emu64xa:14/UE1A.230829.036/11036701:userdebug/dev-keys` |
| Back camera | `virtualscene` |
| Front camera | `emulated` |

Other AVDs available but unused: `Nexus_6_API_34`,
`Medium_Phone_API_UpsideDownCakePrivacySandbox`.

### Physical devices

**None connected.** `adb devices` returned an empty list throughout this
milestone. Tiers 2 and 3 are blocked on hardware availability, not on software.

### Host webcam

One USB webcam is visible to the emulator as `webcam0` (NV12). It was **not**
used as evidence: a webcam feeding an emulator is neither a physical Android
camera nor a physical Android display, and conflating the two is exactly what
the status vocabulary above exists to prevent.

---

## 4. Emulator — `EMULATOR SKIPPED`

An AVD (`Medium_Phone_API_34`, Android 14, x86_64) was booted and responsive,
and was used for exactly one purpose: as a build target while diagnosing the
native build. It was then shut down to free memory for the build.

**No emulator result is claimed as validation of anything.** Its back camera is
a `virtualscene` and its front camera is `emulated`; neither is a physical
Android camera. A host USB webcam piped into an emulator is neither a phone
camera nor a phone display, so that path was not pursued either.

---

## 5. Android native build

### First attempt — failed

`npx expo run:android` failed after 20m 34s:

```text
ninja: build stopped: subcommand failed.
C++ build system [build] failed while executing:
  ninja.exe -C .../react-native-reanimated/android/.cxx/Debug/5t536q3v/x86_64 reanimated
```

### Diagnosis — performance limitation, not a defect

Classified before changing anything. The evidence:

1. CMake **configured** successfully — `CMakeCache.txt` and the prefab configs
   for `fbjni`, `ReactAndroid` and `react-native-worklets` all resolved.
2. Re-running the **same ninja target directly**, with nothing else competing
   for the machine, completed with **exit 0 and zero error lines**. The inputs
   that failed under Gradle succeeded standalone.
3. The host had **under 1 GB free of 15.7 GB**, committed memory at 39.2 GB.
   `org.gradle.parallel=true` runs multiple workers, each spawning a ninja that
   fans out across all cores, while Metro and an emulator were also resident.

The C++ toolchain was never broken. It was starved.

### Fix — two lines

```properties
org.gradle.parallel=false
org.gradle.workers.max=2
```

No dependency added, removed or upgraded. No native configuration rewritten.
No application or protocol source touched.

`react-native-reanimated` was investigated as a removal candidate and **kept**:
Photon's own source imports neither it nor `react-native-worklets`, but
`expo-router@57.0.9` depends on reanimated, so removing it would break routing.

### ABI correction

The failed build targeted `x86_64` — an emulator ABI, useless on a phone. The
development APK is built for **`arm64-v8a`**, which physical Android devices
use.

### The same failure, a second time

Adding the camera stack (four native packages) reintroduced the failure in a
different target — `react-native-nitro-image`, arm64:

```text
clang++: error: clang frontend command failed due to signal
```

A compiler that dies on a *signal* has been killed, not given bad input. As
before, compiling the same target directly with `ninja -j 1` linked
`libNitroImage.so` with exit 0.

Two independent C++ targets failing the same way under Gradle and succeeding
standalone is what turns the diagnosis from plausible into settled: **this host
cannot compile native code and run parallel workers at the same time.** The
constraint is the machine, not the project.

It happened a **third** time on the release build, in VisionCamera's own C++:

```text
FAILED: CMakeFiles/VisionCamera.dir/.../HybridDepthSpec.cpp.o
clang++: error: clang frontend command failed due to signal
```

Three independent targets — `react-native-reanimated`, `react-native-nitro-image`,
`react-native-vision-camera` — each killed under Gradle, each compiling cleanly
when run alone. The native stack grew from one C++ library to four when the
camera was added, and this host cannot compile that many in parallel.

### Measured build times

| Build | Result |
| --- | --- |
| Debug x86_64, full | **failed** at 20m 34s |
| Debug arm64, resumed | **succeeded** in 7m 25s |
| Debug arm64 + camera, incremental | **failed** at 6m 50s |
| Debug arm64 + camera, resumed | **succeeded** — 87.2 MB APK |
| Release arm64, full | **failed** at 14m 22s |

Incremental resumes succeed where full builds fail, because Gradle keeps what
already compiled and each retry has fewer files left and a lower peak demand.

### Consequence: the build moved to EAS

Local building was retained but is no longer the primary route. An EAS cloud
build compiles on Expo's hardware, where memory is not the binding constraint.
`eas.json` defines a `preview` profile that produces a directly installable APK
rather than an app bundle.

This is a **host limitation**, not a Photon defect. The same source compiles
correctly; it simply needs more memory than this machine has free.

### Result — both routes produced an installable APK

| Route | Outcome |
| --- | --- |
| Local Gradle, release arm64 | **Succeeded** in 10m 35s on an incremental resume, after the full build failed at 14m 22s. 49.2 MB. |
| EAS cloud, `preview` profile | **Succeeded.** Built on Expo hardware, no memory constraint. |

The local release APK, verified with `aapt`:

```text
package: name='com.photon.app' versionName='0.1.0'
native-code: 'arm64-v8a'
uses-permission: name='android.permission.CAMERA'
```

Both are **release** builds: the JavaScript bundle is embedded, so they run
standalone with no Metro dev server. A debug APK was also produced (87.2 MB)
but is not usable for hand-installed device testing, since it fetches its
bundle from a development server.

The two APKs are signed with **different keystores** — the local one with the
Android debug key, the EAS one with a keystore Expo generated. Android refuses
to install one over the other; uninstall before switching.

**P0 and P1 are met.** The Android build works and an installable arm64
development APK exists.

---

## 6. Tier 2 — physical Android device

**`BLOCKED / DEVICE REQUIRED`.**

No physical Android device was connected at any point. Everything in this tier
is therefore untested:

| Item | Status |
| --- | --- |
| Development build on real hardware | `NOT TESTED` |
| Real camera initialization | `NOT TESTED` |
| Real camera capture | `NOT TESTED` |
| Autofocus, exposure behaviour | `NOT TESTED` |
| Real QR detection from a camera | `NOT TESTED` |
| Physical display QR rendering | `NOT TESTED` |
| Device thermal behaviour | `NOT TESTED` |
| Battery impact | `NOT TESTED` |
| Real memory and CPU under load | `NOT TESTED` |

---

## 7. Tier 3 — two physical devices

**`BLOCKED / SECOND DEVICE REQUIRED`.**

No two-device optical transfer has been attempted. Photon has never moved a
file through light.

---

## 8. Real camera path — implemented, `NOT TESTED` on hardware

SI-013 asked whether Photon could get byte-accurate QR payloads from a device
camera at all. It can, and the adapter is written — but no device has run it.

### What changed

`react-native-vision-camera@5.2.2` replaces `expo-camera` as the camera. The
decision, alternatives and version reasoning are in **ADR-0005**.

`expo-camera` was ruled out on evidence rather than preference: its barcode
result exposes `data: string` and `raw?: string`, and it declares no raw-frame
API at all. Photon's packets are arbitrary binary, so a string round-trip
destroys them.

VisionCamera provides what §12 and §14 require:

| Requirement | API |
| --- | --- |
| §12 continuous capture | `useFrameOutput({ onFrame })` — every frame |
| §14 payload **bytes** | `Frame.getPixelBuffer(): ArrayBuffer` |
| §14 forwarded **unchanged** | No string anywhere in the path |

```text
Frame (RGB) → getPixelBuffer() → Uint8ClampedArray → CameraFrame
            → jsQR → payload bytes → deserializePacket → CRC
```

### Architecture

The frozen `CameraAdapter` contract did not change. VisionCamera is confined to
`src/camera/visionCamera.tsx`; the contract implementation and the pixel
conversion live in `src/camera/deviceCamera.ts` and import nothing from the
library, which is why they are unit tested with no device present.

### Status

| Item | Status |
| --- | --- |
| Byte-accurate path exists | Demonstrated in the type system and unit tests |
| Pixel-buffer conversion, incl. row-stride padding | 14 unit tests pass |
| Adapter lifecycle and permission states | Covered by the same suite |
| **Camera initialization on hardware** | `NOT TESTED` |
| **Continuous frame delivery on hardware** | `NOT TESTED` |
| **QR detection from a real camera** | `NOT TESTED` |
| **Frame rate, dropped frames, thermal** | `NOT TESTED` |

**SI-013 remains `IMPLEMENTATION IN PROGRESS`.** Installing a library proves an
API exists, not that the pipeline works.

### Remaining wiring, stated plainly

`createAppGraph` now accepts **any** `CameraAdapter`, so a device build can
inject `createDeviceCamera` — but the app root still composes the in-memory
camera, and no screen yet mounts `<CameraSource>`. Two things stand in the way,
and neither is guesswork worth committing blind:

1. **The layer boundary.** `app/_layout.tsx` and the receive screen are UI, and
   the lint rules forbid UI importing `@camera/*`. The preview component must
   therefore be constructed in the composition root and handed to the UI as an
   opaque component, not imported by it. That is the correct design; it is not
   yet built.
2. **Platform resolution.** Selecting the device camera on hardware while
   keeping Node and web on the in-memory one means a `.native` module variant.
   Whether Jest's `jest-expo` preset would also resolve `.native` — and so pull
   the NitroModules TurboModule into the test run and break the suite — was not
   verified, and could not be verified without risking the green baseline.

So the APK currently exercises the app, not the camera. Wiring it is small and
well understood, but it should be done with a device attached, where the result
can actually be observed rather than assumed.

---

## 9. Remaining blockers

| Blocker | Needs |
| --- | --- |
| Physical device validation | An Android phone |
| Two-device optical transfer | A second Android phone |
| Real camera capture | A decision on SI-013 |
| Hardware performance figures | A phone, after the camera decision |
| File picker on device | A12-02 |

No performance figure from TRD §34 has been measured: memory, CPU, battery,
camera initialization, frame rate, QR detection rate, dropped frames, thermal
behaviour and startup time are all `NOT TESTED`. None has been estimated.
