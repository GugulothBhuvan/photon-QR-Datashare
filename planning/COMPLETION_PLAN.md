# COMPLETION_PLAN.md

What remains before Photon can move a file between two phones, in the order it
has to be done.

**Written after hardware testing.** Every item below is either a defect a real
device exposed, or a gap that testing made unavoidable. Nothing here is
speculative tidying.

---

## The one-paragraph summary

The protocol *engine* is finished and heavily tested. What is missing is the
**middle of the product**: two devices have no way to introduce themselves to
each other. The receiver currently learns what is being sent through a shared
object in memory, which works in a test and is meaningless across two phones.
Until a manifest and a handshake can travel *through the camera*, no amount of
UI work produces a transfer.

Second, the receiver is dead on hardware because of a one-line API mismatch.
That is cheap to fix and blocks all device validation, so it goes first.

---

## Stage 0 — Make the receiver work on hardware

Blocks: every device test. Cost: small. No specification questions.

### 0.1 Camera permission API `[defect]`

`platformCamera.ts` calls `Camera.getCameraPermissionStatus()` and
`Camera.requestCameraPermission()`. **Neither exists in VisionCamera 5** — they
were v3/v4 static methods. The call throws, a bare `catch` swallows it, and the
app silently falls back to the in-memory camera. That is why no permission
dialog appears and the preview is dead.

The v5 surface, verified against the installed package:

| Need | v5 API |
| --- | --- |
| Request permission | `VisionCamera.requestCameraPermission(): Promise<boolean>` — works outside React |
| Read current status | `useCameraPermission()` — **hook only** |

So the adapter requests through the factory, and `<CameraSource>` reports status
changes into the adapter through the `setPermission` seam that already exists.

### 0.2 Stop swallowing platform failures `[defect]`

The `catch` in `platformCamera.ts` and `deviceFiles.ts` returns a working
fallback for *any* error. It kept the test suite green and made three device
sessions undiagnosable. The About screen now surfaces the reason; the fallback
should additionally be **loud** on the Receive screen rather than silently
showing a placeholder that looks like a camera that failed to focus.

### 0.3 Runtime permission request on Android 13+

Verify the manifest permission is actually requested at runtime and that a
refusal reaches §14's recovery action. The controller path exists and is tested;
it has never run against Android's real dialog.

---

## Stage 1 — The missing middle: two devices agreeing

Blocks: **every real transfer**. This is the critical path. Nothing in Stage 3
or 4 matters until this is done.

### 1.1 Handshake packet `[specified — implementable now]`

`PACKET_SPEC.md` §9.1 defines it completely:

| Field | Type |
| --- | --- |
| Supported Version | UInt8 |
| Capability Bitmap | UInt32 |

Work: serializer, deserializer, validation, and the `PacketTypeId.Handshake`
path through `PacketManager`. The existing header and CRC footer are reused
unchanged, so this is a small, well-defined piece of binary work.

Requires reading: PROTOCOL_SPEC §7 (Handshake Protocol) for the exchange rules
and what the capability bits mean.

### 1.2 Manifest wire format `[BLOCKED — specification gap]`

This is the hole in the middle of the product, recorded as **A5-01** since
Milestone A.

§9.2 defines the manifest packet payload as:

| Field | Type |
| --- | --- |
| File Count | UInt16 |
| Metadata | **Variable** |

and then says "Manifest format is defined in `PROTOCOL_SPEC.md`". But
PROTOCOL_SPEC §10.5 lists what a manifest *contains* — file names, sizes,
hashes, packet counts, configuration — **without giving a byte layout for any of
it**. There is no field order, no string encoding, no length prefix convention.

**This cannot be implemented from the specification.** Any implementation
invents a wire format, which AGENTS.md §7 forbids doing silently. It needs
either:

- a specification decision defining the metadata layout, or
- an explicit, documented assumption (a new SPEC_ISSUES entry plus an ADR)
  accepting that this build defines its own encoding and will not interoperate
  with any other implementation until §9.2 is completed.

**This is the single most important decision outstanding.** Recommend the
second option with a clearly versioned, self-describing encoding, so work can
continue and a future specification can supersede it.

### 1.3 Receiver-side session initiation

Today `ReceiveController.start(sessionId)` is called with a session that already
exists in the same process. On hardware the receiver must instead:

1. Scan until it decodes a **handshake** or **manifest** packet.
2. Create the session *from that packet*, not from a local call.
3. Accept the manifest, then begin collecting data packets.

This is the change that turns Receive from a screen that needs a caller into one
that genuinely receives. It depends on 1.1 and 1.2.

### 1.4 Sender-side handshake and manifest transmission

The sender must transmit the handshake and manifest packets **as QR frames**
before the data packets, and loop them, since a receiver may start scanning at
any point (§11.11 already makes looping the norm).

---

## Stage 2 — Complete the transfer loop on hardware

Depends on Stage 1.

### 2.1 End-to-end two-device transfer

Small file, controlled conditions, SHA-256 verified both sides. This is the
first moment Photon does what it exists to do.

### 2.2 Progressive optical conditions

Distance, angle, lighting, brightness — recorded as measurements, not
impressions.

### 2.3 Performance measurement

The TRD §34 numbers that have never been taken: memory, CPU, battery, camera
frame rate, QR detection rate, dropped frames, thermal behaviour, startup.

---

## Stage 3 — Application completeness

None of this blocks a transfer; all of it blocks a *product*.

### 3.1 Transfer history `[A12-03]` — DONE

`historyRepository.ts` behind the existing screen. What a record holds, the
list order and the retention limit are all product decisions §5.5 leaves open,
recorded in **ADR-0007**: metadata only, newest first, most recent 100, pruned
on write.

Sends are recorded with outcome `UNKNOWN`, not `COMPLETED`. The optical
transport has no return path (SI-014), so a sender never learns whether
anything read its frames, and recording success would assert what nothing
observed.

### 3.2 Settings persistence — DONE

`fileKeyValueStore.ts` plus `deviceStorage.ts`. One JSON file, read whole at
startup and written through on change; the policy is injected a `TextFile` so
it is tested in Node. A corrupt file starts empty and reports it rather than
refusing to launch. About says whether storage is persistent.

### 3.3 Received-file destination

Files save to the app's document directory. §5.6's storage preferences let a
user choose, and that choice is currently ignored.

### 3.4 Received-file review — DONE

The Receive screen lists what arrived, whether each verified, and where it was
written. A file that failed verification is listed as discarded rather than
left missing (§20.14), and a write that fails says so.

---

## Stage 4 — Specification-blocked protocol features

Each needs a specification change before it can be implemented honestly. None
blocks a working transfer between two Photon devices; all block *compliance*.

| Item | Blocker | Effect |
| --- | --- | --- |
| Version negotiation | **SI-008** — §23.3 wants `MAJOR.MINOR`, the header field is one byte | No compliance level can be claimed (§29.13) |
| Encryption | **SI-012** — §19.7 and SECURITY.md §8 defer key exchange to each other | No confidentiality; transfers are readable by anyone with a camera |
| Adaptive transport, closed loop | **SI-010** — signals are receiver-side, responses sender-side, no back-channel | Adaptation can only advise the user |
| Camera byte path | **SI-013** — resolved by ADR-0005, unproven on hardware | Closes when Stage 0 and 2.1 pass |
| Compression | §18 never read | Larger transfers than necessary |
| Worker threads | **SI-011** — no technology in TRD §3 | Encoding competes with the UI thread |

---

## Sequencing

```text
Stage 0  ──► receiver alive on hardware       (small, no decisions)
   │
   ▼
Stage 1  ──► two devices can agree            ◄── needs the 1.2 decision
   │
   ▼
Stage 2  ──► first real optical transfer      (the milestone that matters)
   │
   ▼
Stage 3  ──► product completeness
   │
   ▼
Stage 4  ──► compliance, as specs are fixed
```

**Do not build Stage 3 before Stage 1.** History and settings persistence are
visible and satisfying to build, and they would produce a more polished app that
still cannot transfer a file.

---

## What needs a decision from you

1. **Manifest wire format (1.2).** Invent a documented encoding and proceed, or
   stop until §9.2 is completed? This gates everything.
2. **History retention (3.1).** What is kept, for how long, and does it survive
   reinstalling?
3. **Compliance posture (Stage 4).** Is interoperability with other OSP
   implementations a goal, or is Photon-to-Photon sufficient for now? The answer
   changes how much of Stage 4 matters.

---

## What this plan does not promise

Nothing here makes Photon compliant with OSP/1.0 — SI-008 prevents that
regardless of effort. Stages 0 to 3 produce an application that transfers files
between two Photon devices, verified byte-for-byte, over a real optical link.
That is a working product, not a compliant protocol implementation, and the
distinction should stay visible in the documentation.
