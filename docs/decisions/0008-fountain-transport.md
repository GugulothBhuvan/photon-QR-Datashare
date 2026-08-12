# ADR-0008 — A fountain transport supersedes PROTOCOL_SPEC's packet carousel

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-08-12 |
| **Supersedes** | `PROTOCOL_SPEC.md` §8 sequencing, §11.11 looping, §11.14 missing-packet tracking, §12 resume, §13 recovery — for the fountain engine only |
| **Relates to** | `planning/MILESTONE_F.md`, `docs/DECIMEN_COMPARISON.md` |

## Context

Photon implements `PROTOCOL_SPEC.md`: files are split into indexed packets,
the sender shows them in order and loops, and the receiver collects every
index, tracking what is missing so it can resume and recover.

On hardware this transport does not work well enough to be a product. The
measured problem is not the packet format but the model:

- **A receiver must catch every index.** Miss packet 47 and it waits a whole
  cycle for 47 to come round, while frames it already holds are shown to it
  again. At a 50% catch rate the transfer does not take twice as long; it takes
  several cycles.
- **Nothing can be collected until the preamble is caught.** The handshake and
  manifest must be decoded before a single data packet can be placed, so a
  receiver that starts late waits for the cycle to return.
- **Three engines exist to compensate** — missing-packet tracking, resume and
  recovery — and all three are machinery for a problem the transport creates.

A rateless code removes the problem rather than compensating for it. The
receiver needs *any* sufficient number of frames, in any order; a dropped frame
costs a little time and never correctness.

## Decision

Build a second optical engine using a **systematic fountain code with
self-describing frames**, and select between the two at the composition root.

Specifically:

1. **Rateless, not indexed.** The sender emits an endless carousel: a
   systematic sweep of all *k* source blocks, then *k* repair frames, each the
   XOR of a pseudorandom block subset. A receiver catching a clean sweep
   completes in exactly *k* frames with no overhead; repair frames patch
   whatever the sweep lost, from any later cycle.

2. **Every frame self-describes.** The header carries session, sequence, block
   count, block length, total length and a payload checksum. There is no
   handshake and no manifest preamble — a receiver locks on at any point in the
   stream from the next frame it decodes.

3. **File metadata moves inside the payload.** Name, media type and SHA-256 go
   into a container that is itself the fountain payload, so metadata arrives
   through the same rateless mechanism as the bytes and cannot be missed
   separately.

4. **One file per transfer.** Photon's manifest carries a file table; this
   engine does not. Multi-file transfer is a capability the fountain engine
   deliberately does not have, and the packet engine keeps.

5. **Both engines ship.** The fountain engine is selected at the composition
   root. The packet engine remains the default until a hardware benchmark shows
   the fountain engine wins on real devices, and is deleted only then.

## What this supersedes

For the fountain engine, and only for it:

| Specification | Superseded because |
| --- | --- |
| §8 sequential display | Frames are not ordered; `seq` drives a PRNG, not a position |
| §11.11 looping | The carousel is the loop, and re-watching it never replays the same repair subsets |
| §11.14 missing packets | There is no such thing as a missing frame |
| §12 resume | A receiver that stops and restarts simply collects more frames |
| §13 recovery | Nothing to recover; loss is absorbed by construction |
| §9.1 handshake, §9.2 manifest | Replaced by self-describing frames and an in-payload container |

**`COMPLIANCE.md` must state which engine each claim applies to.** Photon does
not stop implementing `PROTOCOL_SPEC.md` — the packet engine still does. It
gains a second transport that deliberately does not.

Retained unchanged: SHA-256 integrity (§20), the `CameraAdapter`, `Clock`,
`Logger`, `IdGenerator`, `IntegrityVerifier` and `PacketCodec` contracts, the
QR layer, storage, security boundaries and the layer architecture.

## Alternatives considered

| Option | Rejected because |
| --- | --- |
| Tune the packet engine (Milestone E) | Real gains — measured 10× on decode — but the model still requires every index. It raises the ceiling without changing the shape of the failure. |
| Reed–Solomon across packets | Fixed rate: the sender must decide the redundancy up front without knowing the channel, and a receiver worse than that guess still fails. |
| Adopt decimen's wire format | Interoperability is not a goal, and it would import a format we did not specify and cannot change. |
| Copy decimen's implementation | Separate project, CLA and `NOTICE.md`. Techniques are documented in `DECIMEN_COMPARISON.md`; the implementation here is photon's own. |

## Consequences

- Resume, recovery and missing-packet tracking do not apply to the fountain
  engine. They are not deleted while the packet engine ships.
- Progress must be reported as **frames collected, not blocks solved**: peeling
  back-loads, so a bar fed solved blocks looks stalled and then jumps.
- **Determinism is now a wire-format property.** Sender and receiver derive
  block subsets independently and never compare notes, so the PRNG and the
  degree distribution must be bit-identical across engines and versions. Only
  exactly-specified integer operations are used, and golden vectors pin them —
  a floating-point difference of one unit in the last place would desynchronise
  two devices silently.
- The format is versioned in the header from the first release, so a later
  change is rejected cleanly rather than misparsed.
- Two engines is more code until the benchmark decides, which is the price of
  having a measured comparison rather than an assertion.
