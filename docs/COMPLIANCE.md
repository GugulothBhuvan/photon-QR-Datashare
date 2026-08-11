# COMPLIANCE.md

**Compliance declaration** — PROTOCOL_SPEC §29.14.

§29.14 asks an implementation claiming compliance to declare its protocol
version, compliance level, optional features and supported algorithms. This is
that declaration, and the first thing it has to say is that **no compliance
level is claimed**.

The same facts are available as implementation metadata in
`src/config/compliance.ts` and on the application's About screen, so the three
cannot drift apart.

---

## 1. Declaration

| | |
| --- | --- |
| **Protocol version** | OSP/1.0 |
| **Compliance level (§29.3)** | **None claimed** |
| **Compression algorithms** | None |
| **Encryption algorithms** | None |
| **Integrity algorithms** | SHA-256 |

---

## 2. Why no level is claimed

§29.3 Level 1 — Core Compliance requires Version Negotiation. §29.4 repeats it
among the mandatory requirements, and §29.13's checklist marks it Required.

It is not implemented, and it cannot be implemented from the specification as
written. **SI-008**: §23.3 requires a protocol version of the form
`MAJOR.MINOR`, while `PACKET_SPEC.md` §5 gives the version field of the packet
header a single byte. No document defines how two components pack into one
byte. Every possible reading invents a wire format, so the implementation was
deliberately left alone (AGENTS.md §7) and the defect raised instead.

Claiming Level 1 regardless would be the most misleading thing this project
could publish. §29.6 makes Level 1 a promise of interoperability with every
other Level 1 implementation, and a build that cannot negotiate a version
cannot keep that promise.

Every other §29.13 requirement is implemented.

---

## 3. §29.13 checklist

| Requirement | Status | Note |
| --- | --- | --- |
| Session Management | Implemented | FSM reconciled across three conflicting sources (ADR-0001) |
| Handshake | **Device validation required** | The session walks Waiting → Handshake → Active. No two-device handshake has been exercised — that needs a camera adapter and two devices. |
| Manifest Processing | Implemented | Create, parse, validate, retain |
| Packet Validation | Implemented | Ten rejection codes, one per §12 validation item |
| Packet Ordering | Implemented | Reassembly by index, never by arrival (§13.12) |
| File Reconstruction | Implemented | Byte-identical across the §10 corpus |
| Integrity Verification | Implemented | SHA-256, pinned to FIPS 180-4 vectors |
| Error Handling | Implemented | Validators report; they do not throw |
| **Version Negotiation** | **Blocked** | SI-008 |
| Deterministic Behavior | Implemented | No clock, timer or randomness inside the protocol engine |

---

## 4. Optional features (§29.5)

| Feature | Status | Note |
| --- | --- | --- |
| Resume | Implemented | Paused → Active preserves validated packets (§20.13) |
| Recovery | Implemented | Natural repetition, §15.6 Strategy 1. Forward error correction is not implemented. |
| Adaptive Transport | Partial | The four §25 signals are monitored; the loop cannot close without a back-channel (SI-010). |
| Compression | Not implemented | §18 unread |
| Encryption | Not implemented | Optional per §19.1. Key exchange is undefined (SI-012). |

§29.5 is explicit that implementations MAY omit optional features and that
unsupported optional features SHALL NOT prevent communication when they are not
required. Nothing here is negotiated as required.

---

## 5. Security posture

Four properties that are commonly conflated, stated separately:

| Property | Provided | By what |
| --- | --- | --- |
| **Corruption detection** | Yes | CRC32 per packet (SECURITY.md §6) |
| **Integrity** | Yes | SHA-256 over each reconstructed file (§20.6) |
| **Confidentiality** | **No** | No encryption exists (SI-012) |
| **Authenticity** | **No** | An unkeyed hash proves the bytes match the manifest, not who wrote it (A14-02) |

A transfer over this build is readable by anyone who can point a camera at the
sending screen. That is a property of the transport, not a defect, but it should
be said plainly rather than left for a reader to infer from the absence of an
encryption section.

---

## 6. What blocks a v1.0 release

| Blocker | Effect |
| --- | --- |
| SI-008 — version negotiation | No compliance level may be claimed |
| Device validation outstanding | Memory, CPU, battery, Android and iOS behaviour are unmeasured — see `docs/CURRENT_STATE.md` §9 |
| No device camera adapter (A12-01) | No transfer has ever crossed a real optical path |
| No file picker (A12-02) | A user cannot choose a file on a device |

The first is a specification defect and needs a specification change. The rest
are implementation work that needs hardware.

---

## 7. Interoperability

None has been demonstrated. §29.6's guarantee is between two *compliant*
implementations, and no second implementation of OSP exists to test against.
What has been demonstrated is a complete transfer through the real protocol
engine, packet layer, QR transport and reconstruction, over a simulated optical
channel with loss, corruption, duplication and repetition — see
`tests/system/`.

---

## 8. Where this is kept true

`src/config/compliance.ts` holds the same declaration as data. If a requirement
changes status, change it there and here together. The About screen renders it,
so a divergence is visible in the application itself.
