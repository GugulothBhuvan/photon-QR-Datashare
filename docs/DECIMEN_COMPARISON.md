# Decimen Optical Transfer — architecture, and how photon differs

| | |
| --- | --- |
| **Subject** | `github.com/bashalarmistalt/decimen-optical-transfer`, read at depth 1 on 2026-08-12 |
| **Purpose** | Establish why decimen moves 1 MB in seconds where photon takes minutes, from its source rather than its documentation |
| **Status** | Analysis. Nothing here changes photon; the recommendations at the end are proposals, and the ones marked **spec** need an ADR first |

Everything below was read out of the repository. Where a number is quoted from
their docs rather than their code it says so.

---

# 1. The correction that has to come first

> *"I tried out our QRs with the decimen receiver application because we
> basically follow the same sort of mechanism, right?"*

**No. The two wire formats are incompatible, and their receiver rejects a
photon frame in its first two bytes.**

```ts
// shared/protocol.ts
const MAGIC0 = 0xd1;
const MAGIC1 = 0x0d;

export function parseFrame(bytes: Uint8Array) {
  if (bytes.length <= HEADER_LEN) return null;
  if (bytes[0] !== MAGIC0 || bytes[1] !== MAGIC1) return null;   // ← photon stops here
  ...
}
```

A photon packet begins with its own 50-byte header, not `0xD1 0x0D`. Their
decoder will happily *read the QR symbol* — it is a standard byte-mode QR code
— and then discard the payload as not-a-decimen-frame. Any appearance of it
working was the QR layer succeeding and the protocol layer silently refusing.

The two projects share a *concept* — bytes as light, screen to camera, no
network — and share almost nothing else. That is the real subject of this
document.

---

# 2. Decimen, end to end

## 2.1 Sender pipeline

```
File (≤64 MB)
  → packFile()          gzip if it helps, SHA-256 of the ORIGINAL bytes
  → DCF2 container      49-byte header + name + mediaType + payload
  → LTEncoder           split into k source blocks of blockLen bytes
  → frameComposition()  block subset for seq  (systematic sweep, then repair)
  → packFrame()         20-byte header + XORed block
  → QR encode           ECC L, pinned mask
  → rasterizeQr()       module matrix → RGBA, 1 module = 1 pixel
  → grid of 1/2/4/6/9   staggered flips, scaled up with smoothing off
  → screen
```

### The file container (`DCF2`, 49-byte header)

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | Magic `44 43 46 32` (`DCF2`) |
| 4 | 1 | Compression: 0 none, 1 gzip |
| 5 | 2 | Name length (u16 LE) |
| 7 | 2 | Media-type length (u16 LE) |
| 9 | 4 | Original file length (u32 LE) |
| 13 | 4 | Transmitted length (u32 LE) |
| 17 | 32 | **SHA-256 of the original bytes** |
| 49 | … | name, then media type, then payload |

Two decisions worth noting. The digest covers the *original* bytes, so
verification is meaningful whether or not gzip was applied. And gzip is
attempted only when `bytes.length >= 768 && !isPrecompressedType(type)`, kept
only if `compressed.length + 64 < bytes.length` — a deliberate list of
already-entropy-coded media types rather than a heuristic, because "a wrong
skip costs a few percent of transfer size, a wrong try costs a whole buffer."

On the receiving side `gunzipAsync` enforces a hard output ceiling: the gzip
trailer's declared length arrives over the optical channel, so it is treated as
a hint and never as a bound.

### The frame header (20 bytes, little-endian)

| Offset | Size | Field | Purpose |
| --- | --- | --- | --- |
| 0 | 1 | `0xD1` | Magic |
| 1 | 1 | `0x0D` | Wire format v2. Bumped from `0x0C` so v1 peers reject v2 cleanly rather than desync |
| 2 | 2 | `sessionId` | Random per sender start |
| 4 | 4 | `seq` | Drives the fountain PRNG |
| 8 | 2 | `k` | Source block count |
| 10 | 2 | `blockLen` | Payload bytes per frame |
| 12 | 4 | `totalLen` | Container length |
| 16 | 4 | `payloadFnv` | FNV-1a of the whole container, checked on completion |

**Every frame is self-describing, so there is no handshake and no manifest.**
A receiver locking on at any point in the stream learns everything it needs
from the next frame it decodes. A sender restart draws a new `sessionId` and
the receiver resets automatically.

`streamIdentity()` is the concatenation of *every* field except `seq`. The
receiver resets on any disagreement, not just a new session id, because 16-bit
session ids collide across restarts and a mismatched frame fed into an existing
decoder corrupts it silently — surfacing only as a checksum failure after the
entire transfer has run.

### The fountain — "systematic carousel", wire format v2

This is the heart of it.

```ts
export function cycleLength(k: number): number { return 2 * k; }

export function frameComposition(k, sessionId, seq): number[] {
  const pos = seq % cycleLength(k);
  return pos < k ? [pos] : repairIndices(k, sessionId, seq);
}
```

Each cycle is **k systematic frames** (block 0, block 1, … block k−1) followed
by **k repair frames**, each the XOR of a pseudorandom subset of blocks. The
carousel repeats forever.

The consequences are the whole ballgame:

- A receiver that catches a clean sweep completes in **exactly k frames — zero
  fountain overhead.**
- A dropped frame costs time, never correctness. Repair frames from *any* later
  cycle patch it.
- Frames may arrive **in any order**, and sender and receiver frame rates need
  not match.
- No back-channel, no retransmission request, no resume state.

Repair frames use a **uniform degree of 4–24**, not the robust-soliton
distribution of textbook LT codes, and their commentary explains why with
measurements — after a sweep the receiver already holds most blocks, so
soliton's heavy degree-1 and degree-2 mass just re-sends what it has:

```
drop            0%    5%    10%   30%   50%
k/2 soliton    1.00  2.31  2.60  3.71  5.40
k uniform4-24  1.00  1.37  1.59  2.11  3.06   ← plain LT: 1.14 at 0%
```

Repair frames seed from the **absolute** `seq`, so re-watching the carousel
never replays the same subsets.

One hard-won detail: sender and receiver must build **bit-identical** degree
distributions, and `Math.log` is implementation-approximated. V8 on the sender
and JavaScriptCore on an iPhone receiver can differ by one ulp, which is enough
to shift a CDF entry and flip a sampled degree. They ship a deterministic
`dlog()` built from exactly-specified IEEE-754 operations, and pin it with
golden vectors. `splitmix32` is used for the same reason — integer ops only.

### The QR layer

- **ECC level L**, deliberately. Their reasoning: in-frame error correction and
  the fountain solve *different* problems — corruption versus erasure — and at
  these frame sizes "decode whole or discard" plus fountain redundancy is the
  better trade.
- **The mask pattern is pinned**, skipping the specification's 8-way mask
  evaluation, for roughly 4× faster generation. Any declared mask is valid to a
  decoder.
- `rasterizeQr()` emits one pixel per module and the sender scales up with
  `imageSmoothingEnabled` off, so modules stay hard-edged.
- **Grids of 1, 2, 4, 6 or 9 codes.** The count must fill the rectangle exactly;
  a part-empty grid would waste channel. Each code in the grid is an
  independent fountain frame.
- **Staggered flips.** Cell *j* flips at phase *j/N* of the frame interval
  rather than all cells flipping together, so a camera exposure straddling a
  flip catches at most one code mid-transition instead of losing all N.

### Sender controls

From `shared/send-settings.ts` — one canonical list, rendered into the
dropdowns *and* into the receiver's troubleshooting advice, so the advice can
never name a value the sender does not offer.

| Control | Default | Options |
| --- | --- | --- |
| tx fps | **60** | 10, 15, 20, 24, 30, 55, 60 |
| bytes / frame | **2953** (QR v40) | 500, 1000, 1465, 1850, 2331, 2953 |
| error correction | L | — |
| display size | 900 px | capped by screen; fullscreen ignores it |
| grid | 1 | 1, 2, 4, 6, 9 |

A live readout shows **what the knobs produced**: QR version, fountain block
count *k*, and whether compression was applied.

`k` is a u16, so `frame-capacity.ts` catches the case where a large payload at
a small frame size runs out of block numbers — at 500 bytes/frame the real
ceiling is about 30 MB, not 64 — and names the smallest *offered* setting that
would work.

There is also a **stall watchdog**: browsers throttle `requestAnimationFrame`
in backgrounded windows, freezing the stream mid-flip. It cannot be prevented,
so it is detected and explained, because from the receiver's side it looks
exactly like a receiver failure.

## 2.2 Receiver pipeline

```
getUserMedia (1280 wide, 60 fps requested exactly then ideally)
  → requestVideoFrameCallback loop, generation-counted
  → crop selection      full scan on a cadence, else one crop per known code
  → DecodeWorkerPool    N workers, each its own zxing-cpp WASM instance
      → readTracked()   cached quad + module count, detection SKIPPED
      → readFull()      full detection, returns errors as "sightings"
  → parseFrame()        magic, then header
  → LTDecoder.addFrame  peeling cascade
  → assemble()          → unpackFile() → gunzip → verify SHA-256
```

### Frame capture

`requestVideoFrameCallback` rather than a timer, so capture is driven by the
camera. A generation counter guards it: rVFC chains outlive their stream and
resume on the next one, which would otherwise produce zombie capture loops.

Camera capabilities are **probed, not sniffed** — `getCapabilities()` for
torch, focus mode and max frame rate. Continuous autofocus is applied where
available. Torch is reported and deliberately unused: the sender is an emissive
screen, and a flashlight only adds glare.

### The decode pool

```ts
submit(message, transfer): boolean {
  const slot = this.busy.indexOf(false);
  if (slot === -1) return false;   // caller DROPS the frame
  ...
}
```

Every worker holds its own ~940 KB WASM instance and processes **one frame at a
time**. When all are busy the frame is dropped rather than queued, "because a
stale frame is worth less than the next one" — and the fountain absorbs it like
any other miss. The pool resizes in place, shrinking from the end so surviving
workers keep their slot identity.

Workers **warm up** at construction — instantiate, then run one 8×8 decode — so
the first real frame does not pay for WASM instantiation and JIT.

### Region tracking — where the throughput comes from

This is the single most important receiver technique, and photon had none of it
until this week.

```
interface Region {
  x, y, w, h            // where the code sat, in capture coordinates
  seen: number          // last time it was seen
  decoded: boolean      // false = sighting-only, probationary
  drift?: number        // how far it moved between decodes
  quad?: SymbolQuad     // corners of the last decode
  dim?: number          // QR dimension in modules
}
```

| Constant | Value | Reason |
| --- | --- | --- |
| `REGION_TTL_MS` | 1500 | A stale region squats on a crop slot at a dead position |
| `REGION_PAD` | 0.35 | The crop must *lead* a handheld receiver, not chase it |
| `MAX_REGIONS` | 9 | Matches the largest grid |
| `FULL_SCAN_INTERVAL_MS` | 1500 | Healthy: reacquire anything the crops lost |
| `FULL_SCAN_DEGRADED_MS` | 250 | Fewer live regions than the stream has shown = one is missing |
| `ACQUISITION_SCAN_MS` | 100 | No lock at all. Full-scanning *every* capture was "the app's hottest loop"; 10/s cut aiming burn ~85% |

Two refinements they arrived at the hard way, both documented as reversals:

- **A longer TTL for proven regions measured *worse*.** A stale region squats on
  a crop slot and, by keeping `regions.length` looking healthy, suppresses the
  degraded rescan cadence exactly when reacquisition is needed. "Expiring fast
  and rescanning hard wins."
- **Sightings may keep a region alive but never move or resize it.** zxing's
  failed quads are routinely clipped or mis-sized, and one overwriting a
  decode-proven box aims every following crop at garbage — *"a measured 6×
  throughput collapse on a 4-code grid."*

### The tracked decode path

A crop that arrives with a cached quad and module count skips detection
entirely: the sampling transform is rebuilt from the quad and the module grid
is sampled directly. **Bench-measured 2.0–2.6× per decode at v40.** Any tracked
miss falls back to `readFull` on the same buffer, which also re-anchors the
quad — "tracked is opportunistic, never load-bearing."

### Progress reporting

Progress counts **frames collected, not blocks solved**, because the peeling
cascade back-loads: blocks hockey-stick near the end while frame arrival is
linear. A bar fed solved-blocks looks stalled and then teleports.

`framesRedundant` is tracked separately — frames with a new `seq` that carried
no new information because every block they covered was already solved. On a
lossy multi-code run, a bar fed raw `framesNew` read 96% when the truth was
~50%.

### Receiver controls

| Control | Default | Notes |
| --- | --- | --- |
| capture width | 1280 | 1920 costs decode time; 960 helps weak CPUs |
| capture fps | 60 | iOS delivers 30 unless the exact rate is demanded |
| decode workers | 2 | One WASM decoder each; busy workers drop frames |

Applied **live** while the camera runs. A device that refuses a live
reconfigure keeps its stream and says so. Frame rates the camera reports it
cannot reach are greyed out.

A collapsible **live diagnostics** panel shows capture fps, decode fps,
goodput, frames and *k*, and becomes the transfer summary when the run ends.

---

# 3. Photon, end to end

```
Files
  → Manifest              file list, sizes, digests, session id
  → packetize             indexed packets, 50-byte header + payload + CRC32
  → preamble              handshake frame, then manifest frame
  → QR encode             ECC M
  → one code, looped      §11.11, frame duration 350/200/100 ms
  → screen

Camera (VisionCamera, YUV)
  → Y plane               luminance, one frame in flight (backpressure)
  → CameraFrame           PixelFormat.Grayscale
  → jsQR                  on the JavaScript thread, crop-first since this week
  → deserializePacket     header + CRC32
  → collect by index      missing-packet tracking, resume, recovery
  → reconstruct           → SHA-256 verify → save
```

The architecture is stricter than decimen's — layered, contract-bound, DI
throughout, 1356 tests — and the protocol is specified externally in
`PROTOCOL_SPEC.md`, which photon implements rather than invents. That is a
genuine strength and it is also why several differences below are not simply
"fix it": they are specification changes.

---

# 4. Side by side

## 4.1 Protocol

| | photon | decimen |
| --- | --- | --- |
| Unit | Indexed packet *n* | XOR of a pseudorandom block subset |
| Receiver needs | **Every** packet 0…n−1 | **Any** ≈k frames, any order |
| Missed frame | Wait a full loop | Costs time, never correctness |
| Startup | Handshake + manifest preamble must be caught | None; every frame self-describes |
| Join mid-stream | Must wait for the preamble to come round | Immediate |
| Sender restart | New session; receiver must re-sync | Automatic reset on stream identity |
| Machinery | Resume engine, recovery engine, missing-packet tracking | None of it exists |
| Integrity | CRC32 per packet + SHA-256 per file | FNV-1a per stream + SHA-256 per file |
| Compression | Not implemented | gzip when it helps |
| Header overhead | 54 bytes | 20 bytes |

## 4.2 Channel

| | photon | decimen |
| --- | --- | --- |
| Codes on screen | **1** | 1, 2, 4, 6 or 9 |
| Frame rate | 2.9 / 5 / **10** fps | 10 … **60** fps |
| Bytes per frame | 256 … 2048, **512** default | 500 … 2953, **2953** default |
| Error correction | **M** | **L** |
| Mask selection | Library default (8-way evaluation) | Pinned |
| **Offered rate, default** | **2.6 KB/s** | **176 KB/s** (1 code) |
| **Offered rate, maximum** | **20 KB/s** | **704 KB/s** (4 codes) |
| Measured sustained | not yet measured on hardware | 418.5 KB/s desktop→phone, 199.2 phone→phone *(their published figures)* |

Offered rate is `payload bytes × frames per second × codes`. It is the ceiling
before a single frame is dropped.

## 4.3 Receiver

| | photon | decimen |
| --- | --- | --- |
| Decoder | jsQR (JavaScript) | zxing-cpp compiled to WASM, QR-only build |
| Runs on | **The JS thread**, competing with React | N workers, off the main thread |
| Warm-up | None | Instantiate + one decode at startup |
| Crop tracking | Since this week: one region, TTL 1.5 s | Up to 9 regions, drift-aware padding |
| Tracked fast path | **No** — every decode re-detects | Yes, 2.0–2.6× |
| Sightings | **Discarded** | Seed crops where detection failed |
| Full-scan cadence | Every frame the crop misses | 1500 / 250 / 100 ms by state |
| Backpressure | Since this week: 1 frame in flight | Pool slots; frames dropped when busy |
| Capture resolution | 960, fixed | 1280, user-selectable, live |
| Autofocus | Continuous, centre | Continuous where probed available |
| Diagnostics | Frames seen/decoded, rates/s | Capture fps, decode fps, goodput, k, frames |

---

# 5. Root cause of the performance gap

In order of contribution, largest first.

### 5.1 Offered rate — roughly 70× before anything decodes

Photon's *fastest* setting (2048 bytes × 10 fps) is 20 KB/s. Decimen's
*default* is 176 KB/s and its ceiling is 704 KB/s. Even at their most
conservative advice — 1465 bytes, 24 fps, one code — they offer 35 KB/s.

This is not a decoding problem. **The sender is not putting many bytes on the
screen.** Three multipliers are missing: codes per frame (×1 vs ×9), frame rate
(×10 vs ×60), and bytes per frame (×512 vs ×2953).

### 5.2 Sequential packets amplify every loss

With 782 sequential frames a receiver must catch **every one**. At a 50% catch
rate it needs several full loops, and the frames it already has are re-shown to
it while it waits for the ones it missed. Decimen's carousel makes a 50% catch
rate cost roughly 2× rather than unbounded looping, and its own measurements
put uniform repair frames at 3.06× worst-case at 50% drop.

This is the difference the user sees as "ours is slow even when it is
decoding".

### 5.3 Decode cost per frame

Measured in this repository at real capture size (960×720, 30 decodes):

```
before this week's work    802.5 ms/frame
sampled exposure            280.4 ms/frame
+ tracked crop               80.2 ms/frame
```

80 ms is ~12 decodes/second on a desktop CPU; a phone will be slower. Decimen
runs 2+ workers of compiled zxing with a detection-skipping fast path, off the
main thread. That is the remaining multiple.

### 5.4 The crash

Diagnosed and fixed this week, and worth recording here because it is a
structural difference. `dropFramesWhileBusy` drops frames while the *worklet*
is busy; photon's worklet copies a buffer and returns, so it is never busy. The
camera delivered 30–60 fps, each frame allocating a 691 KB luminance plane and
queueing it for a JS thread decoding ~12/s. `scheduleOnRN` has no backpressure,
so the queue grew by tens of MB per second and the process was killed.

Decimen never had this shape of bug because its pool *is* the backpressure:
`submit()` returns false and the caller drops the frame.

---

# 6. Recommendations

Ordered by value per unit of risk. Nothing here has been implemented.

### Tier 1 — no specification change, large effect

1. **Raise the offered rate.** More codes per screen (start with 2), higher
   frame rate options above 10 fps, and a higher default bytes/frame. These are
   multiplicative and none of them touches the packet format.
2. **Move decoding off the JS thread.** `react-native-worklets` can run a
   separate runtime; the decoder would need to be worklet-safe or replaced.
   This is the single largest remaining per-frame win.
3. **Keep sightings.** jsQR reports a located symbol that failed to decode.
   Photon discards that; it is a free crop target.
4. **Adaptive full-scan cadence.** Photon currently full-scans on every crop
   miss. Decimen's three-speed cadence exists because full-scanning every frame
   was its hottest loop.
5. **Receiver controls** — capture width at minimum, applied live.

### Tier 2 — needs a decision

6. **Error correction L instead of M.** Decimen's argument is that in-frame ECC
   and channel redundancy solve different problems. Photon has no channel
   redundancy today, so this trade only becomes correct *after* item 8.
7. **Compression.** Currently Stage 4 and unimplemented.

### Tier 3 — specification change, ADR required

8. **Fountain coding.** Deletes the resume engine, the recovery engine and
   missing-packet tracking, and makes the receiver robust by construction. It
   is also a complete replacement of the wire format that `PROTOCOL_SPEC.md`
   prescribes, and a compatibility break. This is the decision that decides
   whether photon can ever approach decimen's numbers.
9. **Self-describing frames / manifest inside the stream.** Removes the
   preamble-catching problem: a receiver joining mid-stream works immediately
   rather than waiting for the manifest to come round.

---

# 7. What the TRD still needs for the receiver

`TRD.md` §3 names `expo-camera`, which SI-013 already records as unable to meet
§14. The receiver section needs to state, as requirements rather than as
implementation notes:

1. **Capture** — library (`react-native-vision-camera` 5, per ADR-0005), pixel
   format (`yuv`, luminance plane), target resolution, and that capture is
   driven by the camera rather than a timer.
2. **Backpressure** — at most one frame in flight to the decoding thread;
   frames arriving while it is busy are dropped, not queued, with the memory
   reasoning recorded.
3. **Decode** — decoder library, where it runs, and the crop-tracking contract:
   anchor TTL, padding, and the requirement that a miss falls through to a full
   scan on the same frame so tracking can never trap the receiver.
4. **Focus and exposure** — §12's "maintain autofocus" as a concrete
   requirement, and the sampled-luminance screen as the exposure gate.
5. **Diagnostics** — the counters and rates a receiver must expose. This is a
   requirement, not a nicety: four device sessions were lost to a receiver that
   reported nothing.
6. **Controls** — which receiver parameters are user-adjustable and whether
   they apply live.
7. **Performance targets** — decode time per frame and sustained goodput, with
   the measurement method. Photon has no hardware measurement yet; every figure
   in `HARDWARE_VALIDATION.md` should stay `UNMEASURED` until one exists.

---

# 8. Licensing note

Decimen is open source with a CLA and a `NOTICE.md`; its vendored decoder is a
separately released zxing-cpp build. **No code has been copied into photon and
none should be without reading those terms.** Everything above is a description
of technique, which is what was asked for.
