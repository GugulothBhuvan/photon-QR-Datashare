# ADR-0006 — Provisional manifest wire encoding (Photon v0.1)

**Status:** Accepted, **provisional**
**Date:** Stage 1 (post-hardware)
**Relates to:** SI-015 (open), SI-014 (open), A5-01

---

## Context

Two devices could not agree on what was being sent. Every other part of the
pipeline worked — packets serialized, travelled optically, validated and
reassembled — but the receiver learned the manifest from a shared object in the
same process. That is meaningless across two phones, so no transfer was
possible. **The transfer failed at the introduction.**

`PACKET_SPEC.md` §9.2 defines the manifest packet payload as:

| Field | Type |
| --- | --- |
| File Count | UInt16 |
| Metadata | **Variable** |

and defers: "Manifest format is defined in `PROTOCOL_SPEC.md`."

`PROTOCOL_SPEC.md` §10.5 then lists what a manifest *contains* — filename, MIME
type, size, compression, encryption, packet count, hash — and gives **no byte
layout for any of it**. No field order. No string encoding. No length
convention. No delimiter for a variable number of files.

So §9.2's "Metadata" region is undefined, and the specification chain closes
without ever defining it. This is recorded as **SI-015**, escalated from
assumption A5-01, which has been open since Milestone A.

---

## Decision

Implement the two fields §9.2 **does** define, exactly as it defines them, and
fill the undefined "Metadata" region with a Photon-specific encoding.

This does not contradict the specification. It occupies the hole the
specification leaves.

### Encoding rules

| Rule | Reason |
| --- | --- |
| **Length-prefixed, never delimited** | A delimiter can occur inside a filename; a length cannot be forged by content. Every variable field carries a `UInt16` byte count. |
| **Fixed field order** | Nothing iterates an object, so encoding never depends on JavaScript property order. |
| **UTF-8 with explicit byte lengths** | A filename is arbitrary text; a byte length keeps a multi-byte character from being split or miscounted. |
| **64-bit sizes as two 32-bit halves** | JavaScript has no `UInt64`; a file over 4 GB must survive. |
| **Derived values not transmitted** | `totalSize` and `totalPacketCount` are recomputed from the entries. A2-08 makes an inconsistent manifest unconstructable, and sending them would create a second source of truth. |
| **No JSON** | The protocol is binary (§2.3). JSON would make key order, number precision and escaping into protocol facts. |

The layout is documented field by field in `src/core/packet/manifestCodec.ts`.

### Versioning — two separate concepts

The first byte of the metadata region is a **manifest encoding version**, which
is **not** the protocol version:

| | Describes | Governed by |
| --- | --- | --- |
| **Protocol version** | Packet header, session rules, transfer semantics | PROTOCOL_SPEC §23; travels in the packet header |
| **Manifest encoding version** | Only this payload's byte layout | This ADR; exists solely because §9.2 is silent |

They are versioned separately because they change for different reasons. A
future OSP/1.0 implementation could use a completely different manifest encoding
without changing the protocol version — which is exactly why a receiver checks
this byte independently and **refuses** what it cannot read rather than
interpreting it as this layout and producing plausible nonsense.

The encoding version disappears the moment §9.2 supplies a layout.

---

## Compatibility

| | |
| --- | --- |
| Photon v0.1 ↔ Photon v0.1 | **Supported** |
| Interoperability with other OSP implementations | **Not claimed** |
| Future protocol compatibility | **Not claimed** |
| §9.2 compliance | **Not claimed** |

Two independent implementations reading §9.2 would produce different encodings,
because there is nothing there to agree on. This one interoperates with itself
and says so.

---

## Alternatives considered

| Option | Verdict |
| --- | --- |
| **Wait for §9.2 to be completed** | Correct in principle, and it stops the product indefinitely. The gap has been open since Milestone A with no sign of being closed. |
| **JSON payload** | Rejected. §2.3 makes the protocol binary, and `IMPLEMENTATION_NOTES.md` §2.1 already rules JSON out of protocol semantics. |
| **Delimiter-separated fields** | Rejected. No delimiter is safe inside a filename. |
| **Reuse an existing serialization library** | Rejected. A dependency for a format that is provisional by design, and one more thing to remove when §9.2 lands. |
| **Silently define it and claim §9.2 compliance** | Rejected outright. AGENTS.md §7 forbids resolving a specification defect in code, and a false compliance claim is worse than an absent feature. |

---

## Consequences

**Good.**

- Two devices can agree on a transfer for the first time. Discovery is proven
  across the real optical path: encode, rasterise, decode, adopt.
- An unreadable encoding version is refused rather than misread.
- The layout is pinned by tests, so changing it is a deliberate act.

**Bad.**

- Photon speaks a manifest dialect nobody else does. That is the honest cost of
  a gap in the specification, and it is recorded rather than hidden.
- When §9.2 is completed, this becomes a legacy format needing a migration path,
  which is precisely what the encoding version is for.

**SI-015 stays open.** This ADR records how the implementation proceeded despite
the gap; it does not close it. The issue closes when the specification defines
the layout, not when an implementation invents one.
