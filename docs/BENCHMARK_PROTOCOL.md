# Benchmark protocol — packet against fountain (F6)

| | |
| --- | --- |
| **Decides** | Whether the fountain engine replaces the packet engine (ADR-0008) |
| **Status vocabulary** | `docs/HARDWARE_VALIDATION.md` §1. Nothing here may be recorded as anything but `UNMEASURED` until a device produces it |

Both engines ship and both are reachable from the interface, so this is a
measurement rather than an argument. The point of writing the protocol before
running it is that a benchmark designed after seeing the numbers is not one.

---

# 1. What makes a run comparable

The two engines share the camera, the decoder, the QR layer, the display hold
and the backpressure. They differ in transport and in nothing else. A run is
comparable only if everything below is held constant **between the two engines
of a pair**:

| Held constant | Why it matters |
| --- | --- |
| The two devices, and which sends | Camera and screen differ enormously between handsets |
| Distance and angle | The dominant term in decode success |
| Lighting | A window behind the sender defeats any transport |
| The file | Same bytes, same size, same name |
| Bytes per code | The throughput lever; unequal settings measure the setting |
| Speed preference | Frame interval decides how much the receiver must keep up with |
| Both screens at full brightness | §11, and the app now holds this itself |
| Both devices propped, not hand-held | Autofocus hunting is the single largest source of variance |

Run the two engines **back to back in the same sitting**, not on different
days. Ambient light and battery state move more than the effect being measured.

---

# 2. Procedure

1. Install the same APK on both devices.
2. Prop both. A stand, a book, anything that does not move.
3. Sender: pick the file. Set bytes per code and speed. Tap the code to make it
   fullscreen.
4. Receiver: open Receive, grant the camera, fill the view with the code.
5. Start a stopwatch when the first code appears; stop it when the receiver
   reports the file verified.
6. Record everything in §3 **before** changing anything.
7. Switch both devices to the other engine in Settings → Developer →
   Transport. Repeat from step 3 without moving either phone.

If a run does not complete within five minutes, record it as a **failure with
its counters**, not as a missing row. A transport that cannot finish is the
most important result there is.

---

# 3. What to record

Per run. The counters are on the receive screen; the decode figures are the
same on both engines because both use the same decoder.

```
device pair       (sender model → receiver model)
engine            PACKET | FOUNTAIN
file              name, bytes
bytes per code
speed             Slow | Balanced | Fast
distance          cm
lighting          one line, plain words

duration          seconds, first code shown → verified
outcome           VERIFIED | FAILED | TIMED OUT

frames seen
frames decoded
decode mean       ms
crop hit rate     n of m from a crop
dropped           backpressure / pipeline

packet engine     packets collected / total, missing
fountain engine   blocks recovered / k, codes read, foreign codes
```

**Goodput** is the number to compare: file bytes ÷ duration, in KB/s. Derive it
rather than estimating it, and state the file size it came from — a 20 KB file
and a 2 MB file do not produce comparable rates.

---

# 4. Runs worth doing

Ordered so the most decisive comes first. Stop when the answer is clear; there
is no prize for a full matrix.

| # | Run | Answers |
| --- | --- | --- |
| 1 | Both engines, 100 KB, 512 bytes, Balanced, 20 cm | The headline comparison |
| 2 | Both engines, same file, **receiver started late** | The property the packet engine cannot have — start the receiver 15 s after the sender |
| 3 | Both engines, same file, **a hand passed over the code twice** | Whether loss costs time or costs the transfer |
| 4 | Fountain only, 1 MB | Whether it scales, and where |
| 5 | Both engines at 1024 and 2048 bytes per code | Whether density or transport is the binding constraint |

Run 2 is the one to do even if nothing else is done. It is the difference the
redesign was for, and it needs no stopwatch: either the transfer completes or
it does not.

---

# 5. How to read the result

- **Fountain wins clearly** — record it, then delete the packet engine and its
  resume, recovery and missing-packet machinery in a single commit, citing the
  numbers.
- **Packet wins, or they tie** — record that too, and say so plainly. ADR-0008
  would then be a decision that did not pay off, which is worth knowing and
  worth writing down. The fountain engine stays only if it is cheaper to keep
  than to remove.
- **Both fail** — the constraint is not the transport, and Milestone E's F4
  (decoding off the JavaScript thread) becomes the next work regardless of
  which engine survives.

A result is only usable if the run data behind it is recorded. A number without
its conditions is not a measurement.

---

# 6. Current status

| Item | Status |
| --- | --- |
| Every figure in this document | `UNMEASURED` |
| Packet engine on hardware | `NOT TESTED` end to end |
| Fountain engine on hardware | `NOT TESTED` |
| Two-device optical transfer | `NOT TESTED` |

Both engines pass across the simulated optical path in the test suite, with the
same rasteriser and the same decoder. That is evidence the code is correct. It
is not evidence about a camera.
