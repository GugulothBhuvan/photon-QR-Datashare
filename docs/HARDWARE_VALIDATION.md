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

### Result

_Recorded on completion._

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

## 8. Real camera path — `BLOCKED`

Blocked by **SI-013**, which is a technology decision rather than missing
implementation work:

- QR_SPEC §14 requires the decoder to decode payload **bytes** and forward them
  **unchanged** to the packet layer. §12 requires **continuous** frame capture.
- `expo-camera@57.0.3` — the camera TRD §3 names — exposes no raw-frame API at
  all, and its barcode result gives `data: string` and `raw?: string`. Both are
  strings. Photon's packets are arbitrary binary, so a string round-trip
  corrupts them.
- No camera package is installed in the project, and no alternative path exists
  in the current dependency set.

**A native-library decision is required and has not been taken.** No adapter
was written that decodes through a string: that would produce a demo which
corrupts real transfers. Options are in `docs/SPEC_ISSUES.md` SI-013.

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
