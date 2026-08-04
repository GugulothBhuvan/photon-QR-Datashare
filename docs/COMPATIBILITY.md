# COMPATIBILITY.md

# Compatibility Policy

**Status:** Living Document

---

# 1. Purpose

This document states what photon promises about interoperating with other
builds of itself — across versions, across devices and across time.

It covers four surfaces, which fail in different ways and therefore need
different rules:

| Surface | What breaks if it changes | Governed by |
| --- | --- | --- |
| **Protocol** | Two devices cannot complete a transfer | `PROTOCOL_SPEC.md` §23, §24 |
| **Packet** | A receiver misreads bytes it believes it understands | `PACKET_SPEC.md` |
| **QR transport** | A camera cannot read what a screen displays | `QR_SPEC.md` §17 |
| **Internal contracts** | The build fails | `docs/CONTRACTS.md` |

The first three are visible between devices and are the specification's to
define. The fourth is ours alone.

---

# 2. Protocol Version

## 2.1 Format

`PROTOCOL_SPEC.md` §23.3 defines a protocol version as `MAJOR.MINOR`:

- **MAJOR** increments mark breaking protocol changes.
- **MINOR** increments mark backward-compatible enhancements.

photon targets **OSP/1.0**.

## 2.2 An unresolved conflict — SI-008

**The version format cannot currently be represented on the wire.** §23.3
requires two components; `PACKET_SPEC.md` §5 gives the Protocol Version header
field **one byte**, and no document defines how two components pack into it.

The implementation carries a single integer bounded 0–255, satisfying
PACKET_SPEC §5 and §3.29 but not §23.3. This is recorded as **SI-008** and as
assumption **A2-04**, and it is deliberate: inventing a packing for a mandatory
header field would be changing protocol behaviour silently, which AGENTS.md §7
forbids.

**Consequence.** Version negotiation (§23.5) is not implemented and cannot be
until the specification resolves this. A single-version deployment is
unaffected; a second version is not possible without a decision.

## 2.3 Supported versions

§23.4 requires every implementation to declare a minimum and maximum supported
version, exchanged during the handshake.

| | Value |
| --- | --- |
| Minimum supported | 1 |
| Maximum supported | 1 |

Declared as a single ordinal for the reason in §2.2. When SI-008 is resolved
these become `MAJOR.MINOR` pairs.

---

# 3. Packet Compatibility

## 3.1 What is fixed

`PACKET_SPEC.md` §5 fixes the header at **50 bytes** with fields at stated
offsets, and §3 fixes every multi-byte integer as **big endian**. Both are
frozen for the lifetime of a MAJOR version. The layout is pinned by byte-exact
fixtures in `test_vectors/packets/`, which fail on any change:

```bash
npm test -- packetVectors
```

A vector changing without a matching change to `PACKET_SPEC.md` is a defect,
not an update.

## 3.2 What may change within a MAJOR version

| Change | Permitted | Why |
| --- | --- | --- |
| New packet type from the §7 registry | Yes | §24.10 governs unknown types |
| New flag bit from the §8 reserved range | Yes | §24.8: reserved bits transmitted unchanged, ignored unless defined |
| New optional manifest field | Yes | §24.5: older implementations ignore unknown optional fields |
| Header field offset or width | **No** | Breaks every existing receiver |
| Header size | **No** | As above |
| CRC coverage or algorithm | **No** | Every packet would fail validation |
| Meaning of an existing flag bit | **No** | §24.8 forbids repurposing |

## 3.3 Footer

`PACKET_SPEC.md` §6 makes the SHA-256 field optional, so a packet's footer is
4 or 36 bytes. **A receiver cannot infer which from the bytes** — 36 trailing
bytes are indistinguishable from 4 followed by 32 bytes of payload. The layout
is therefore a session-wide parameter agreed before the first packet, not a
per-packet choice. Recorded as A3-05.

---

# 4. QR Compatibility

## 4.1 Across platforms

`QR_SPEC.md` §17 requires the QR transport to remain compatible across Android
and iOS. photon satisfies this by construction: encoding and decoding are pure
JavaScript with no platform-specific paths, so both devices run identical code
on identical bytes.

## 4.2 What a receiver must accept

| Property | Range | Source |
| --- | --- | --- |
| QR version | 1–40, auto-selected | §6 |
| Error correction | L, M, Q, H — **all four** | §7: "the receiver SHALL support all advertised levels" |
| Frame duration | 100 ms – 350 ms presets, adaptable | §9, §10 |

A sender MAY change version, error correction and frame duration mid-transfer
(§10). A receiver that assumed any of them fixed would fail on a link that
adapted, so none of the three is negotiated — each is carried in the QR symbol
itself and read back per frame.

## 4.3 Transport replacement

§17 anticipates future transports — colour QR, visible light, dynamic optical
codes — replacing QR entirely while preserving the protocol layer.

This is why `CameraAdapter` and the QR encoder sit behind interfaces and why
the protocol engine cannot import either (enforced by `eslint.config.js`). A
new transport implements the same ports; nothing above them changes.

---

# 5. Forward Compatibility

`PROTOCOL_SPEC.md` §24.5 requires older implementations to ignore unknown
optional fields, reject unknown mandatory ones, and preserve known behaviour.

| Requirement | Status |
| --- | --- |
| Ignore unknown optional fields | **Implemented** — `parseManifest` drops unrecognised properties |
| Reject unknown packet types | **Implemented** — the deserializer rejects unregistered type bytes |
| Reject unknown **mandatory** fields | **Not implemented** — see below |
| Preserve known protocol behaviour | **Implemented** |

## 5.1 The gap — SI-006 and SI-009

§10.12 and §24.9 both require an unknown *mandatory* field to terminate
validation, and §24.9 adds that implementations "SHALL NOT guess". Neither
section defines how a receiver tells a mandatory unknown field from an optional
one.

The practical effect is that everything unrecognised is ignored — §24.9's
*optional* branch applied universally. **A future mandatory field would be
silently ignored by this build rather than terminating the session**, which is
the opposite of the intent. This is a known gap, not an oversight, and it is
blocked on the specification.

## 5.2 Reserved fields

§24.8: reserved fields are transmitted unchanged, ignored unless the negotiated
version defines them, and never repurposed.

photon honours this for packet flags: bits 6–15 are reserved (`PACKET_SPEC` §8),
`flagsToBits` never sets them, and a packet arriving with any of them set is
rejected as `RESERVED_FLAGS_SET`.

---

# 6. Breaking Change Policy

## 6.1 What counts as breaking

A change is breaking if a device running the previous build and a device running
the new one can no longer complete a transfer they previously could.

By surface:

| Surface | Breaking |
| --- | --- |
| Packet | Any header layout change; CRC coverage or algorithm; footer sizing rules |
| Protocol | Removing a state or transition; changing manifest validation to reject what was accepted; changing packet ordering or reconstruction rules |
| QR | Requiring a version or error correction level a prior receiver rejects; changing the quiet zone below 4 modules |
| Contracts | Any change to a stable interface in `docs/CONTRACTS.md` |

## 6.2 Procedure

A breaking change requires all four, in order:

1. **Amend the specification first.** AGENTS.md §7: update the specification,
   then the implementation, then the tests. A change that appears in code
   before the specification is a defect regardless of merit.
2. **Write an ADR** under `docs/decisions/` recording what changed, why, what
   was rejected, and what it costs.
3. **Update documentation** — this file, `docs/CONTRACTS.md` where a contract
   moved, and `IMPLEMENTATION_NOTES.md` where an assumption is affected.
4. **Compatibility review.** State explicitly which builds can still
   interoperate, and what a user of an older build experiences.

## 6.3 Version increments

| Change | Increment |
| --- | --- |
| Breaking protocol change | MAJOR |
| Backward-compatible enhancement | MINOR |
| Implementation fix with no wire effect | Neither |

§23.3 governs. Note that a MAJOR increment is not currently expressible on the
wire — see §2.2.

## 6.4 What is deliberately not promised

- **Interoperability with builds predating v1.0.** There are none.
- **Stability of anything under `src/` that is not in `docs/CONTRACTS.md`.**
  Internal modules are refactored freely; the boundaries are contracts.
- **Bit-identical QR frames across encoder library versions.** The *decoded
  bytes* are guaranteed; the module pattern producing them is not, since mask
  selection is the library's. `test_vectors/packets/` pins the packet bytes,
  which is the layer that matters.

---

# 7. Related Documents

| Document | Covers |
| --- | --- |
| `docs/CONTRACTS.md` | The internal interfaces and their stability |
| `docs/SPEC_ISSUES.md` | Specification defects, including SI-006, SI-008, SI-009 cited here |
| `docs/IMPLEMENTATION_NOTES.md` | Assumptions made where a section was unread |
| `docs/decisions/` | Architectural decision records |
