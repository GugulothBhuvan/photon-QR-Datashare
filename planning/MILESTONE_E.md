# Milestone E — Receiver performance

| | |
| --- | --- |
| **Scope** | Transport-layer optimisation only |
| **Explicitly out of scope** | Packet format, manifest, session FSM, resume, recovery |
| **Rationale** | `docs/DECIMEN_COMPARISON.md` §5 |

The protocol is not the problem. The transport implementation has not reached
the same optimisation maturity as the protocol it carries, and everything below
is reachable without touching a byte of the wire format.

**Fountain coding and self-describing frames are deliberately excluded.** Both
would replace the wire format `PROTOCOL_SPEC.md` prescribes, and both delete
the resume and recovery engines. They stay recorded in `DECIMEN_COMPARISON.md`
§6 tier 3 as a v2 question, not a v0.1 one.

---

# Status

| | Item | State |
| --- | --- | --- |
| **E1** | VisionCamera migration | **Done** — ADR-0005; frames reach the decoder |
| **E2** | Frame processor | **Done** — worklet on the camera thread, YUV luminance plane |
| **E3** | Backpressure | **Done** — committed, *not yet in an APK* |
| **E4** | Decoding off the JS thread | **Not started** — the largest remaining win |
| **E5** | Crop tracking | **Done** — measured 802 ms → 80 ms per frame |
| **E6** | Diagnostics | **Done** — counters, rates, decode cost, tracking hit rate, both drop causes |
| **E7** | Hardware benchmark | **Not started** |
| **E8** | Frame rate above 10 fps | **Not started** |
| **E9** | More than one code on screen | **Not started** |

E8 and E9 are added to the list you gave because §5.1 of the comparison puts
the offered-rate gap ahead of decode cost: three multipliers are missing, and
bytes-per-frame was only one of them.

---

# E3 — Backpressure `[done, unbuilt]`

The producer–consumer failure, and the crash.

`dropFramesWhileBusy` drops frames while the *worklet* is busy. Photon's
worklet copies a buffer and returns in well under a millisecond, so it is never
busy. The camera delivered 30–60 fps, each frame allocating a 691 KB luminance
plane and queueing it for a JS thread decoding about twelve a second.
`scheduleOnRN` has no backpressure, so the queue grew by tens of megabytes a
second and held every buffer alive until the process was killed.

Implemented as one frame in flight, held in a `Synchronizable` because the two
runtimes do not share memory. Frames arriving while JavaScript is busy are
dropped on the camera thread before anything is allocated.

Dropping is right on merit as well as necessary: a frame queued three seconds
ago shows a code the sender replaced long ago, so the backlog was also making
the receiver prefer stale frames to current ones.

---

# E4 — Decoding off the JS thread `[not started]`

The largest remaining per-frame win, and the hardest item here.

## The easy path is closed

VisionCamera 5 ships a native code scanner — `useObjectOutput`,
`ScannedCode` — and **it cannot be used**:

```ts
export interface ScannedCode extends ScannedObject {
  readonly value?: string      // string only, no byte accessor
  readonly cornerPoints: Point[]
}
```

This is SI-013 again, one library later. Photon's packets are arbitrary binary:
a 50-byte header, raw payload and a CRC32 footer. Arbitrary bytes are not valid
UTF-8, so a string round-trip replaces every invalid sequence with U+FFFD and
changes the length — the packet fails CRC if it survives parsing at all. The
same defect that ruled out `expo-camera` rules out this API.

Anything that decodes for photon must return **bytes**.

## Options

### A. jsQR on a separate worklet runtime

`react-native-worklets` exposes `createWorkletRuntime` and `runOnRuntime`, so a
second JS thread is available without native code.

- **For** — no new dependency, no native code, the decoder stays the one the
  tests exercise, and the frame never crosses to the UI thread at all.
- **Against** — jsQR is a substantial library and worklet runtimes require code
  to be workletizable. Whether a whole library can be hoisted into one is
  unproven and needs a spike before it is planned.
- **Risk** — a spike that fails costs a day and teaches us the answer.

### B. A native frame-processor plugin returning bytes

A Kotlin plugin wrapping ZXing or MLKit, both of which expose `getRawBytes()`.

- **For** — this is what decimen does, in effect: a compiled decoder off the
  main thread. Fastest ceiling by a wide margin.
- **Against** — native code in the repository, a new dependency requiring
  review under DEPENDENCIES §9, an iOS equivalent eventually, and a second
  decoder implementation to keep behaviourally identical to the tested one.
- **Risk** — the `IntegrityVerifier`-style contract boundary makes this
  swappable, but the decoder is currently covered by tests that a native path
  would bypass.

## Recommendation

**Spike A first.** It is the cheaper experiment and it preserves the tested
decoder. If a worklet runtime cannot host jsQR, B becomes the plan and the
spike's result is recorded as the reason.

Either way the `QrDecoder` contract does not change — that is what makes this a
transport optimisation rather than an architecture change.

---

# E6 — Diagnostics `[partial]`

Shipping today, on the receive screen in every state:

- stage, camera permission, whether a device camera resolved
- frames seen, frames decoded
- rates per second: captured, decoded, packets collected
- camera session errors, and refusal reasons in plain words

Added:

| Metric | Answers |
| --- | --- |
| Decode mean, ms/frame | Turns "slow" into a number that can be optimised |
| Crop hit rate | Whether the E5 tracking is earning its place on this device |
| Backpressure drops | How much headroom a faster decoder would buy |
| Pipeline drops | Whether the camera itself is failing to deliver |

The two drop counts are reported separately and never summed: backpressure
drops are this application declining what the decoder cannot keep up with,
which is the healthy state at any camera rate above the decode rate. Pipeline
drops are the camera failing to deliver. They need opposite fixes.

Still outstanding: throughput in KB/s, which is the only figure directly
comparable to another implementation, and duplicate-packet counting.

## Two costs found while instrumenting

Instrumenting the receiver immediately paid for itself.

**The graph built two decoders**, one for discovery and one for the receive
service, so the crop anchor discovery established while locking on was
discarded the moment collection began. They now share one, and the first
collected packet is decoded from a crop rather than a full scan.

**Discovery stayed subscribed after a session started**, decoding every frame a
second time only to discard the result — its own guard returns early once a
manifest has been accepted. Every frame during the part of the transfer that
actually matters cost twice what it needed to. Discovery now stands down when
collection begins, which is pinned by a test that counts decodes per frame.

The case for treating this as a requirement rather than a nicety: four device
sessions were spent on a receiver that reported nothing, and the eventual root
causes — a planar-frame guard, then an unbounded queue — were both invisible
from outside.

---

# E7 — Hardware benchmark `[not started]`

Nothing in `HARDWARE_VALIDATION.md` may move off `UNMEASURED` until a physical
device produces a number. Decimen's discipline is worth copying directly: one
record run per device pair, published with the run data that produced it, so a
figure can always be traced to the conditions that made it.

Minimum useful record: device pair, distance, bytes per frame, frame rate,
capture resolution, frames seen, frames decoded, packets collected, wall-clock
duration, and resulting KB/s.

---

# E8 — Frame rate above 10 fps `[not started]`

Photon's fastest preset is 100 ms per frame. Decimen offers up to 60 fps and
defaults to it.

Raising this is a one-line change to `FRAME_DURATION_MS` and a widening of the
preference enum, but it is only worth having **after E4**: the receiver decodes
about twelve frames a second today, so offering 30 fps would mostly increase
the number of frames dropped. Sequenced deliberately behind the decoder work.

A note from decimen worth keeping: on a 60 Hz display a frame needs at least
two refresh cycles on screen or captures catch the transition, so 60 fps on a
60 Hz panel measured 0.2–0.4 catch rates. Their 55 fps option exists so frame
boundaries drift through the scanout instead of riding it.

---

# E9 — More than one code on screen `[not started]`

The largest untapped multiplier, and it changes no protocol byte: each code on
screen is simply a different packet. A grid of two doubles offered rate at the
same frame rate and the same density.

Two pieces of work:

1. **Sender** — lay out *n* codes, and stagger their flips so a camera exposure
   straddling a transition catches at most one mid-flip rather than all of them.
2. **Receiver** — jsQR returns a single symbol per call. Finding several means
   scanning regions, which the crop tracking from E5 already provides the
   machinery for: one crop per known code, exactly as decimen does it.

Sequenced after E4 and E6 — without per-code tracking and throughput numbers
there is no way to tell whether a second code helped or simply halved the catch
rate of the first.

---

# Sequence

```
E3  done, needs a build
E5  done
E6  finish the metrics          ← cheap, and makes everything after measurable
E7  first hardware record       ← baseline, or the rest is guesswork
E4  spike A, then A or B        ← the big one
E8  raise the frame rate        ← only meaningful after E4
E9  multiple codes              ← needs E4, E6 and per-code tracking
```

E6 and E7 come before E4 deliberately. Optimising without a baseline produces
numbers nobody can defend, and this project has already spent four device
sessions on failures that were invisible because nothing reported them.
