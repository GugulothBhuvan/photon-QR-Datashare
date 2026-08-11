# SPEC_ISSUES.md

# Specification Issues Register

**Status:** Living Document

---

# 1. Purpose

This document records **defects in the specifications themselves**: places where
a specification is internally inconsistent, contradicts another specification,
requires behaviour without defining a mechanism, or omits a value the
implementation needs.

It exists because of a rule in AGENTS.md §7 — protocol behaviour is defined only
in the specification, and never changed silently in code. When the
implementation meets a specification defect it has two honest options: stop, or
proceed under a documented reading. Either way the defect is recorded here so
that it is fixed at the source rather than absorbed into the code.

## Relationship to the other documents

| Document | Records |
| --- | --- |
| `SPEC_ISSUES.md` (this file) | Defects **in the specification** |
| `IMPLEMENTATION_NOTES.md` | Assumptions the **implementation** made where a section had not been read |
| `docs/decisions/` | Architectural decisions that have become permanent |

An entry belongs here when the specification is wrong, ambiguous or incomplete.
It belongs in `IMPLEMENTATION_NOTES.md` when the specification is fine but had
not been read yet.

## Rules

1. **Do not silently resolve a specification defect in code.** Record it here,
   state the reading being implemented, and cite this entry from the code.
2. **The specification remains authoritative.** An entry here is a request for
   a fix, not permission to diverge. If the specification is corrected in a way
   that contradicts the implementation, the implementation changes.
3. **Status is honest.** `Open` means unresolved. Only the specification's owner
   closes an entry by amending the document.

---

# 2. Status Values

| Status | Meaning |
| --- | --- |
| `Open` | Recorded, not yet addressed in the specification |
| `Working` | A reading is implemented; the specification still needs amending |
| `Resolved` | The specification has been amended; implementation matches |
| `Withdrawn` | Re-reading showed no defect |

---

# 3. Issues

## SI-001 — §26.4 omits the `Resuming` state that §8.3 and §8.8 define

| | |
| --- | --- |
| **Document** | `PROTOCOL_SPEC.md` |
| **Section** | §26.4 Session FSM, against §8.3 and §8.8 |
| **Status** | `Working` |

**Description.** §8.3 lists `Resuming` in the session lifecycle and §8.8 defines
its semantics — "the Session is restoring communication after interruption.
Only missing packets SHALL require further transmission." §26.4's allowed
transition list has no `Resuming` at all, going `Paused → Active` directly.

**Impact.** A state with defined protocol meaning is unreachable if §26.4 is
taken as complete. An implementation following only §26.4 and one following
only §8.8 would disagree about which transitions are legal.

**Suggested resolution.** Either add `Paused → Resuming` and `Resuming → Active`
to §26.4's list, or remove `Resuming` from §8.3 and §8.8 and fold its semantics
into `Paused`.

**Reading implemented.** Both routes out of `Paused` are legal. See
`docs/decisions/0001-session-fsm-reconciliation.md` §3.

---

## SI-002 — §26.4's expiry transitions contradict §8.9

| | |
| --- | --- |
| **Document** | `PROTOCOL_SPEC.md` |
| **Section** | §26.4 Session FSM, against §8.9 and §8.10 |
| **Status** | `Working` |

**Description.** §26.4 permits expiry only from `Active` and `Paused`. §8.9
states that "a Session SHALL terminate automatically after exceeding the
configured timeout", with no qualification by state, and §8.10 requires expired
sessions to release resources.

**Impact.** Under §26.4 alone, a session abandoned in `Created`, `Waiting` or
`Handshake` — before any receiver joins — could never expire, and would hold its
resources indefinitely. This is a resource-exhaustion path (§25.12).

**Suggested resolution.** Add expiry from every live state to §26.4, or state
explicitly that §26.4 shows principal paths only and that §8.9's timeout applies
throughout.

**Reading implemented.** Every live state may expire. §4.6 makes a SHALL outrank
an unkeyworded list.

---

## SI-003 — `STATE_MACHINES.md` §6 contradicts `PROTOCOL_SPEC.md` on the session machine

| | |
| --- | --- |
| **Document** | `STATE_MACHINES.md` |
| **Section** | §6 Session State Machine, against `PROTOCOL_SPEC.md` §8.3, §8.8, §26.4 |
| **Status** | `Open` |

**Description.** Two divergences. §6 omits the `Waiting` state, which both §8.8
and §26.4 define. §6 names the post-pause state `Resumed`, while §8.3 and §8.8
call it `Resuming`.

**Impact.** `STATE_MACHINES.md` is listed in AGENTS.md §3 as the runtime
specification, so an implementer could reasonably build from it and produce a
session machine that cannot interoperate.

**Suggested resolution.** Regenerate `STATE_MACHINES.md` §6 from
`PROTOCOL_SPEC.md` §26.4, or mark it explicitly as an abridged view.

---

## SI-004 — §4.6 defines keyword precedence but not document precedence

| | |
| --- | --- |
| **Document** | `PROTOCOL_SPEC.md` |
| **Section** | §4.6 Conflict Resolution |
| **Status** | `Open` |

**Description.** §4.6 resolves conflicts by RFC 2119 keyword strength
(MUST > SHALL > REQUIRED > SHOULD > MAY). It does not say what happens when two
*documents* conflict — which is the case that actually arose (SI-003).

**Impact.** The rule that `PROTOCOL_SPEC.md` outranks the other specifications
exists only in `AGENTS.md` §3, which is a contributor guide rather than a
specification. An implementer working from the specifications alone has no
stated precedence order.

**Suggested resolution.** Add a document precedence order to §4.6, or to
§1.8 Companion Specifications.

---

## SI-005 — §11.5 requires every packet to belong to exactly one file

| | |
| --- | --- |
| **Document** | `PROTOCOL_SPEC.md` |
| **Section** | §11.5 Packet Ownership, against §11.4 and §10.11 |
| **Status** | `Working` |

**Description.** §11.5 states that every packet SHALL belong to exactly one
Session, one Transfer, one File and one Packet Index. But §11.4 requires exactly
one Manifest Packet per session, and §10.11 has a manifest describing many
files — so a manifest packet cannot name a single file.

**Impact.** PACKET_SPEC §5 makes the 16-byte File ID field mandatory in every
header, so an implementation must put *something* there for a manifest packet,
and the specification does not say what.

**Suggested resolution.** Qualify §11.5 as applying to Data and Recovery
packets, and state the sentinel a manifest packet carries in its File ID field
— the nil UUID being the natural choice.

**Reading implemented.** §11.5 describes data packets; manifest packets carry
the nil UUID. See `IMPLEMENTATION_NOTES.md` A3-03 and A6-01.

---

## SI-006 — §10.12 requires detecting unknown mandatory fields with no mechanism to do so

| | |
| --- | --- |
| **Document** | `PROTOCOL_SPEC.md` |
| **Section** | §10.12 Unknown Fields |
| **Status** | `Open` |

**Description.** §10.12 requires that "unknown optional fields SHALL be ignored"
and "unknown mandatory fields SHALL terminate Manifest validation". No mechanism
is defined by which a receiver could determine that a field it does not
recognise was mandatory.

**Impact.** The second requirement is unimplementable as written. Only the first
is implemented, so a future mandatory field would be silently ignored by an
older receiver instead of terminating validation — the opposite of the intent.

**Suggested resolution.** Define a mechanism: a required-features list in the
manifest, a reserved field-number range for mandatory extensions, or a minimum
protocol version per field. §24.9 Unknown Fields may already intend one.

---

## SI-007 — §14.13 and §15.10 require a `Failed` transfer state that no section defines

| | |
| --- | --- |
| **Document** | `PROTOCOL_SPEC.md` |
| **Section** | §14.13 Resume Failure, §15.10 Recovery Failure |
| **Status** | `Open` |

**Description.** Both sections require that on failure "the transfer SHALL enter
the **Failed** state". No transfer state machine defining `Failed` appears in
§12, and §26.7 Transfer FSM has not been read at time of writing.

**Impact.** The requirement cannot be satisfied without a transfer state
machine. Session termination and packet release — the other requirements of both
sections — are implemented; the `Failed` state is not.

**Suggested resolution.** Confirm `Failed` is defined in §26.7 and cross
reference it from §14.13 and §15.10, or define it in §12.

---

## SI-008 — A `MAJOR.MINOR` protocol version cannot fit the one-byte header field

| | |
| --- | --- |
| **Document** | `PROTOCOL_SPEC.md` and `PACKET_SPEC.md` |
| **Section** | PROTOCOL_SPEC §23.3, against PACKET_SPEC §5 |
| **Status** | `Open` — **blocking** |

**Description.** §23.3 requires every protocol version to consist of
`MAJOR.MINOR`, with major increments marking breaking changes and minor
increments marking backward-compatible ones. PACKET_SPEC §5 gives the Protocol
Version header field **one byte**.

One byte cannot carry two independent components unless an encoding is defined
— a nibble split, a lookup table, or anything else. Neither document defines
one. §3.29 adds to the confusion by describing the protocol version as "a
numeric identifier", which reads as a single number.

**Impact.** This is the one issue so far that cannot be worked around by
choosing a reading, because any choice **invents wire format**:

- Packing 4 bits each caps both components at 15 and is not stated anywhere.
- Treating the byte as MAJOR only discards MINOR, which §23.9 relies on for
  compatibility decisions.
- Treating it as an index into a version table requires a table nobody has
  defined.

AGENTS.md §7 forbids changing protocol behaviour silently, and inventing an
encoding for a mandatory header field is exactly that. So the implementation
has **not** been changed to match §23.3.

**Current state.** `ProtocolVersion` is a single integer bounded 0–255, which
satisfies PACKET_SPEC §5 and §3.29 but not §23.3. Recorded in
`IMPLEMENTATION_NOTES.md` as A2-04, now marked contradicted-and-blocked.

**Suggested resolution.** Whichever the specification's owner intends:

1. **Define the packing in PACKET_SPEC §5** — for example high nibble MAJOR,
   low nibble MINOR — and state the maximum of each.
2. **Widen the field to two bytes** in PACKET_SPEC §5, one per component. This
   changes the header layout and the 50-byte header size, so it is a breaking
   change to the wire format.
3. **Amend §23.3** to state that the on-wire version is a single ordinal, with
   `MAJOR.MINOR` being a human-facing label mapped through a published table.

Option 2 is cleanest and least surprising; option 1 is cheapest. Until one is
chosen, version negotiation (§23.5) cannot be implemented correctly.

---

## SI-009 — §24.9 requires rejecting unknown mandatory fields but still defines no way to identify one

| | |
| --- | --- |
| **Document** | `PROTOCOL_SPEC.md` |
| **Section** | §24.9 Unknown Fields, with §10.12 |
| **Status** | `Open` |

**Description.** An escalation of SI-006 rather than a duplicate. §24.9 is more
emphatic than §10.12 — an unknown mandatory field SHALL terminate the session,
and "implementations SHALL NOT guess the meaning of unknown mandatory fields" —
but it still gives no mechanism by which a receiver distinguishes an unknown
*mandatory* field from an unknown *optional* one.

**Impact.** Taken together the two sections require a decision that cannot be
made from the data available. In practice a receiver ignores everything it does
not recognise, which is §24.9's *optional* branch applied universally — so a
future mandatory field will be silently ignored by older implementations
instead of terminating the session, which is precisely the failure §24.9 exists
to prevent.

**Suggested resolution.** Define the mechanism, and reference it from both
§10.12 and §24.9. The usual options: a `requiredFeatures` list in the manifest;
a reserved field-number range meaning "mandatory"; or a per-field minimum
protocol version. §24.8 Reserved Fields is the natural place for the second.

---

## SI-010 — Adaptive transport requires receiver signals the protocol gives no way to send

| | |
| --- | --- |
| **Document** | `TRD.md`, with `PROTOCOL_SPEC.md` |
| **Section** | TRD §25 Adaptive Transport, with QR_SPEC §10 |
| **Status** | `Open` |

**Description.** TRD §25 requires adaptive mode to monitor scan success, blur,
decode latency and duplicate rate, and permits it to reduce FPS, enlarge the
code or increase redundancy. Every one of those four signals is observable only
at the **receiver**, while all three responses are actions only the **sender**
can take. No read section defines a return path: the optical link is one way,
and OSP/1.0 defines no back-channel, no acknowledgement packet and no
out-of-band signal.

**Impact.** Adaptation cannot close its loop. A receiver can measure that it is
missing frames and can compute exactly what the sender should do, and has no way
to say so. Implemented as far as it can be — `src/qr/adaptiveMonitor.ts`
accumulates the four signals and produces a recommendation — but the
recommendation is delivered to the *user*, who must change the sender's speed by
hand. That satisfies the letter of §25's "MAY reduce FPS" only because a person
is standing in for the missing protocol.

**Suggested resolution.** Either define the return path — the natural form is
the receiver displaying its own QR code carrying a small feedback packet, which
also solves the retransmission request §15 gestures at — or restate §25 as
guidance for a future version and say plainly that OSP/1.0 adaptation is
manual. The second is the smaller change and would let an implementation stop
pretending the loop closes.

---

## SI-011 — "Worker Threads" is a planned deliverable with no technology and no specification

| | |
| --- | --- |
| **Document** | `planning/IMPLEMENTATION_PLAN.md`, with `TRD.md` |
| **Section** | P10 Performance deliverables, with TRD §3 Technology Stack |
| **Status** | `Open` |

**Description.** `IMPLEMENTATION_PLAN.md` P10 lists "Worker Threads" as a
deliverable. TRD §3 enumerates the technology stack — framework, state, camera,
QR, storage, crypto, compression, testing — and names nothing that provides
them. No section of any specification describes what should run on a worker,
what the boundary would carry, or how it interacts with the single-threaded
protocol engine.

**Impact.** The deliverable cannot be implemented as written without choosing a
dependency the stack does not list, which AGENTS.md §7 places outside an
implementer's authority. React Native's JavaScript runtime is single-threaded;
true worker threads need a native module (`react-native-worklets-core`, or a
JSI-based equivalent), which is a dependency review and an architecture
decision, not a performance tweak.

**Deliberately not implemented.** The underlying goal — that a large transfer
does not block the interface — has been met differently and honestly: frame
encoding is now lazy (`lazyFrameSource`), so the expensive work happens one
frame at a time between displays rather than in a single blocking pass during
preparation. Measured on the benchmark, preparation is now 6–18 ms regardless
of file size. No worker was introduced and none is pretended.

**Suggested resolution.** Either add a concurrency technology to TRD §3 and a
section describing what belongs on a worker, or remove the deliverable from P10
and record that off-main-thread execution is deferred. If it is kept, note that
the pipeline's cost is dominated by *decoding* — roughly 90% of end-to-end time
in the benchmark — so a worker that only offloaded encoding would move very
little.

---

## SI-012 — Encryption requires a key exchange that no document defines

| | |
| --- | --- |
| **Document** | `PROTOCOL_SPEC.md`, with `SECURITY.md` |
| **Section** | §19.7 Key Management, §19.12 Encryption Negotiation, with SECURITY.md §8 |
| **Status** | `Open` — blocking for encryption only |

**Description.** The two documents defer to each other and neither defines a
mechanism.

- §19.7: "The Encryption Rules define how encryption is used but do not
  prescribe a specific key exchange mechanism. […] Key generation, exchange, and
  storage are specified in **SECURITY.md**."
- SECURITY.md §8: key generation, storage and destruction are the application's
  responsibility. It specifies no exchange.

§19.7 additionally requires that "the Session SHALL establish a shared
encryption context before Data Packet transmission begins" and §19.12 requires
encryption to be negotiated during the Handshake — but no section defines a
handshake message that could carry a key agreement, and §7's handshake
description contains no such field.

**Impact.** Encryption cannot be implemented interoperably. The optical channel
is one way: two devices cannot agree a key over it without a defined mechanism,
and any mechanism chosen here would be an invented protocol that no other
implementation could match. §19.16.5 requires parameters to be negotiated before
the transfer begins, which is exactly the step that has no definition.

This does **not** block a compliant OSP/1.0 implementation: §19.1 and
SECURITY.md §5 both make encryption optional.

**Deliberately not implemented.** The seam is built and the refusal is real —
`PayloadCipher` fixes §19.5's scope structurally, the pipeline order of §19.3 is
enforced by where the calls sit, and a manifest naming an algorithm this build
cannot perform is rejected rather than treated as plain text (§19.14). What is
absent is a cipher, and it is absent because there is nothing to key it with.

**Suggested resolution.** Specify the exchange. Over a one-way optical channel
the realistic options are a pre-shared secret entered by the user, a key
displayed as a QR code and scanned by the sender before the transfer (which
needs the return path SI-010 also wants), or an out-of-band channel named
explicitly. Whichever is chosen, §19.12's handshake needs a field to carry the
result, and SECURITY.md §8 should say which party generates the key.

---

## SI-013 — The sanctioned camera technology cannot return the payload bytes §14 requires

| | |
| --- | --- |
| **Document** | `TRD.md`, with `QR_SPEC.md` |
| **Section** | TRD §3 Technology Stack (Camera), with QR_SPEC §14 QR Detection |
| **Status** | `Open` — blocking real camera capture |

**Description.** TRD §3 names `expo-camera` as the MVP camera. QR_SPEC §14
requires the decoder to "Decode payload **bytes**" and states that "Decoded
payloads SHALL be forwarded **unchanged** to the Packet Layer."

`expo-camera` cannot do this. Its published type surface (verified against
`expo-camera@57.0.3`, the version matching this project's Expo SDK) offers
exactly two ways to get anything out of the camera, and neither yields bytes:

| API | Returns | Problem |
| --- | --- | --- |
| `onBarcodeScanned` | `{ data: string, raw?: string }` | Both fields are **strings**. There is no `Uint8Array`, `ArrayBuffer` or byte accessor anywhere in the package's declarations. |
| `takePictureAsync` | `CameraCapturedPicture` with `format: 'jpg' \| 'png'` | A compressed image, not pixels. Getting pixels needs a JPEG/PNG decoder that is not in the technology stack. |

There is no raw-frame API at all: the package declares no `onFrame`, no
`frameProcessor` and no pixel accessor.

QR_SPEC §12 adds a second requirement the same API cannot meet: the receiver
SHOULD "continuously capture frames" and "decode frames as quickly as
practical". `takePictureAsync` is still capture, not continuous capture.

**Verified, not assumed.** The type surface above was read from the published
`expo-camera@57.0.3` tarball — the version matching this project's Expo SDK 57.
No camera package is installed in the project at all: the dependency set
contains `jsqr` (a decoder that takes pixel buffers) and the `CameraAdapter`
port, and nothing that can produce frames on a device. `react-native-worklets`
is present, but only as a transitive dependency of `react-native-reanimated`
via `expo-router` — no frame-processor camera uses it.

So there is **no existing supported path in the project**, and the protocol
requirement cannot be satisfied by the technology TRD §3 names.

**Why a string is not merely inconvenient.** Photon's packets are arbitrary
binary — a 50-byte header, raw payload bytes and a CRC footer, encoded as QR
byte-mode segments (ADR-0002). Arbitrary bytes are not valid UTF-8. Passing
them through a string replaces every invalid sequence with U+FFFD and changes
the byte length, so the packet fails CRC validation if it survives parsing at
all. "Forwarded unchanged" is precisely what a string cannot do.

This is the same class of defect ADR-0002 resolved on the encoding side, where
a text-oriented QR library was replaced to keep byte segments intact. The
decoding side now hits it from the other direction.

**Impact.** The `CameraAdapter` contract streams `CameraFrame` pixel buffers to
JavaScript, and `jsQR` decodes them — an architecture that satisfies §14
exactly. No sanctioned dependency can produce those buffers on a device. Real
camera capture is therefore blocked on a technology decision, not on
implementation effort.

**Not worked around.** No adapter was written that decodes to a string and
hopes, and none that silently narrows the protocol to text-safe payloads.
Either would satisfy a demo and corrupt real transfers.

**Suggested resolution.** One of:

1. Name a frame-processor capable camera in TRD §3 — `react-native-vision-camera`
   with frame processors is the usual choice, and this project already carries
   `react-native-worklets`, which such processors need.
2. Keep `expo-camera` and add a native module that exposes ML Kit's
   `Barcode.getRawBytes()`, which does return bytes on Android but is not
   surfaced by `expo-camera`.
3. Accept still-capture: `takePictureAsync` plus a JPEG decoder yields real
   pixels and satisfies §14, at a capture rate far below the 100–350 ms per
   frame QR_SPEC §9 paces the sender at. This would need §9 to admit a slow
   receiver, or the sender to hold each frame far longer.

Option 1 preserves both §14 and §9. Options 2 and 3 each need another
specification change.

---

# 4. Index By Document

| Document | Issues |
| --- | --- |
| `PROTOCOL_SPEC.md` | SI-001, SI-002, SI-004, SI-005, SI-006, SI-007, SI-009, SI-010, SI-012 |
| `STATE_MACHINES.md` | SI-003 |
| `PACKET_SPEC.md` | SI-008 (jointly with PROTOCOL_SPEC) |
| `TRD.md` | SI-010 (jointly with PROTOCOL_SPEC), SI-011 (jointly with IMPLEMENTATION_PLAN), SI-013 (jointly with QR_SPEC) |
| `SECURITY.md` | SI-012 (jointly with PROTOCOL_SPEC) |
| `QR_SPEC.md` | SI-013 (jointly with TRD) |
| `planning/IMPLEMENTATION_PLAN.md` | SI-011 |

# 5. Index By Status

| Status | Issues |
| --- | --- |
| `Working` | SI-001, SI-002, SI-005 |
| `Open` | SI-003, SI-004, SI-006, SI-007, SI-009, SI-010, SI-011 |
| `Open` — blocking for encryption | SI-012 |
| `Open` — blocking real camera capture | SI-013 |
| `Open` — **blocking** | **SI-008** |
| `Resolved` | — |
| `Withdrawn` | — |

**SI-008 is the only issue that blocks work.** Version negotiation (§23.5)
cannot be implemented until the on-wire representation of a `MAJOR.MINOR`
version is defined. Nothing in Milestones A or B depends on it; a v1.0 release
does, since §29.13's compliance checklist includes version negotiation.
