# IMPLEMENTATION_NOTES.md

# Implementation Assumptions Ledger

**Status:** Living Document

---

# 1. Purpose

This document records every implementation decision made **because the relevant
specification section had not yet been read**.

The project loads documentation incrementally: a phase reads only the sections
its tasks require. That keeps context small and implementation focused, but it
has a cost — some decisions must be made before the section that governs them
has been opened. Those decisions are assumptions, and an assumption that lives
only in a progress report is an assumption nobody will ever check.

Each entry records:

- **What** was assumed.
- **Why** it was necessary — which section was unavailable, and what was blocked.
- **Where** it is implemented.
- **Which phase** should verify it, and against which section.

---

# 2. How To Use This Document

**When making an assumption**

Add an entry. Do not bury it in a commit message or a report.

**When starting a phase**

Search this document for entries whose "Verify in" column names the phase or a
section that phase reads. Those are the first thing to check against the
specification, before writing code that builds on them.

**When an assumption is verified**

Move it to §5 with the outcome. If the specification contradicts it, the
specification wins: update the implementation and the tests, and record what
changed.

**Precedence**

This document is subordinate to every specification in `docs/`. It records what
was assumed in their absence, never what is true. Where an entry and a
specification disagree, the specification is correct and the entry is a defect
report.

---

# 2.1 JSON Is Not Part Of The Protocol

**JSON is a testing and development convenience. It is not, and must never
become, part of protocol semantics.**

The protocol is binary. `PACKET_SPEC.md` §3 defines the encoding — fixed-width
big-endian integers, 16-byte UUIDs, raw payload bytes — and PROTOCOL_SPEC §2.3
makes binary-native communication a design principle. Nothing that travels
between two devices is JSON.

Where JSON currently appears, and why each is legitimate:

| Where | Why it is not protocol |
| --- | --- |
| `test_vectors/packets/*.json` | A container for a hex string and its description. The *vector* is the hex; the JSON is the envelope the test reads it from. The bytes are what is pinned. |
| `ManifestManager.parseManifest` tests | The manager parses an already-decoded **structural value**, not JSON specifically. Tests hand it plain objects, and one test round-trips through `JSON.parse(JSON.stringify(...))` purely to prove the parser accepts a value it did not itself construct. |
| `EntityCodec` in `createKeyValueRepository` | Local persistence of application records. Never transmitted. The codec is injected precisely so the storage format is a caller's choice, not a protocol fact. |

Two rules follow:

1. **No wire format is defined by a JSON shape.** The manifest's byte layout is
   `PACKET_SPEC.md` §9.2 and will be implemented against that section. If a
   manifest is ever serialized as JSON on the wire, that is a specification
   change (AGENTS.md §7), not an implementation choice.
2. **No protocol behaviour may depend on JSON's data model.** Key ordering,
   number precision, absent-versus-`null`, and string escaping are JSON
   concerns. The protocol's data model is bytes.

Recorded here because A5-01 defers the manifest's wire encoding, and a deferred
encoding is exactly the circumstance in which a convenience quietly becomes a
contract.

---

# 3. Open Assumptions

## 3.1 Domain Models (Phase 2)

| ID | Assumption | Why necessary | Where | Verify in |
| --- | --- | --- | --- | --- |
| A2-01 | `Session` omits the accumulating members of §8.7 — packet statistics, packet map, stored manifest. Those are managed state, not part of the value object. | A value object that accumulates is never equal to itself twice. §8.7 lists them as Session Context without saying whether they are one object. | `src/types/session.ts` | Verified — see §5 |
| A2-02 | `Transfer` carries identity and shape with **no state machine**. | §12 Transfer Protocol and §26 Transfer FSM were both out of scope. Inventing states would create a second, unauthoritative definition of protocol behaviour. | `src/types/transfer.ts` | TransferManager, against §12 and §26.7 |
| A2-03 | The domain packet kinds are Manifest, Data and Recovery. | §11.4 enumerates packet types formally and was unread. The three were attested by §8.5 and §10.10, which had been read. | `src/types/packet.ts` | Verified — see §5 |
| A2-04 | `ProtocolVersion` is a single number, later bounded to 0–255 by PACKET_SPEC §5. | §3.29 defines it as a numeric identifier. §23.3 defines the version *format* and was unread; if it is structured (major/minor), this type changes. | `src/types/ids.ts` | Version negotiation, against §23.3 |
| A2-05 | Compression method, encryption method and integrity algorithm are **opaque strings**, not enumerations. `'NONE'` is the only named constant. **Recovery method is now enumerated** — see §5. | §15, §18, §19 and §20 name the permitted values and were all unread. Enumerating them from guesswork would have invented protocol values. | `src/types/manifest.ts` | PRO-005 (§15), and the compression, encryption and integrity phases (§18, §19, §20) |
| A2-06 | A manifest packet has no `fileId`; a data packet must have one. | §3.13 places a packet index within a *file* transfer, and a manifest describes the transfer rather than one file. §11 was unread. | `src/types/packet.ts` | Verified — see §5 |
| A2-07 | A zero-byte file and a zero-packet manifest entry are legal. | §3.8 admits any byte sequence as a file. No section read said otherwise. | `src/types/fileMetadata.ts`, `src/types/manifest.ts` | Verified — see §5 |
| A2-08 | The manifest **derives** `fileCount`, `totalSize` and `totalPacketCount` from its entries rather than accepting them as input. | §10.5 lists them as contents and §10.13 makes an inconsistent count grounds for rejection. Deriving them makes an inconsistent manifest unconstructable. Receiver-side validation of a manifest that arrived over the wire (§10.7) is a separate concern. | `src/types/manifest.ts` | Verified — see §5 |

## 3.2 Packet Layer (Phase 3)

| ID | Assumption | Why necessary | Where | Verify in |
| --- | --- | --- | --- | --- |
| A3-01 | "CRC32" in PACKET_SPEC §6 means IEEE 802.3 — reflected polynomial `0xEDB88320`, init and final `0xFFFFFFFF`. | §6 names the field without naming a variant. This is what CRC32 means unqualified (zlib, PNG, gzip, Ethernet). Pinned by the standard `"123456789"` → `0xCBF43926` check vector. | `src/core/packet/crc32.ts` | Integrity phase, against §20.7 |
| A3-02 | The CRC covers the header and payload — every byte before the footer. | §6 does not state the coverage. This is the only definition under which a receiver can verify a packet it has not yet trusted. | `src/core/packet/serializer.ts` | Integrity phase, against §20.5 |
| A3-03 | The nil UUID in the header's File ID field means "belongs to no single file". | §5 makes the field mandatory, but a manifest packet belongs to no file. All-zero bytes are the natural encoding; §5 gives no sentinel. | `src/core/packet/serializer.ts` | Retained — see §5; recheck against PACKET_SPEC §9.2 |
| A3-04 | A packet index at or beyond the declared total is invalid, when the total is non-zero. | §12 lists "Packet Index" as a validation item without stating the rule. §3.13 makes indices zero-based. §13 Packet Ordering was unread. | `src/core/packet/validator.ts` | Packet ordering work, against §13.4 |
| A3-05 | The footer layout — whether the optional SHA-256 field is present — is fixed for a session and supplied to both serializer and parser. | §6 says footer size "depends on protocol configuration" without saying where that is carried. A reader cannot infer it: 36 trailing bytes are indistinguishable from 4 plus 32 bytes of payload. | `src/core/packet/footer.ts` | PRO-002 (manifest protocol configuration, §10.5) and the integrity phase |
| A3-06 | The magic number is `0x4F53`. | The value appears nowhere in §5, which defines the field. Obtained by a targeted single-line search of §13, now sanctioned by AGENTS.md §7.1. | `src/core/packet/header.ts` | Any phase reading §13 |

## 3.3 Session Manager (PRO-001)

| ID | Assumption | Why necessary | Where | Verify in |
| --- | --- | --- | --- | --- |
| A4-01 | The session lifecycle is not literally linear. The transition table encodes §8.8 and the §8.17 invariants, with §8.3 as the happy path. | §8.3 draws a chain, but §8.8 has Active returning from Paused via Resuming, and §8.9 lets a timeout expire any live state. §26.4 Session FSM and `docs/STATE_MACHINES.md` were both out of scope. | `src/core/session/transitions.ts` | Verified — see §5 |
| A4-02 | `Handshake → Waiting` is a legal transition: a failed handshake need not end the session. | §8.8 has the sender waiting for receivers, but §9 Handshake Protocol was unread and may specify otherwise. | `src/core/session/transitions.ts` | Removed — see §5 |
| A4-03 | The default session timeout is 15 minutes. | §8.9 states timeout values MAY be implementation-specific, so this is a choice rather than a protocol constant. §22 Timing Rules was unread and may constrain it. | `src/core/session/sessionManager.ts` | Against §22.5 |
| A4-04 | A generator that repeats a session id is a fatal error rather than a retryable one. | §8.17.2 requires exactly one immutable id per session; a repeat would silently merge two transfers (§8.11). No section read describes recovery from this. | `src/core/session/sessionManager.ts` | Against §8, when session persistence is implemented |
| A4-05 | `closeSession` moves a live session to `Expired`; reaching `Completed` is the caller's transition first. | §8.14 lists successful completion among termination conditions without saying which state a close produces. | `src/core/session/sessionManager.ts` | TransferManager, against §12.11 |

## 3.4 Manifest Manager (PRO-002)

| ID | Assumption | Why necessary | Where | Verify in |
| --- | --- | --- | --- | --- |
| A5-01 | The manifest's **wire encoding** is out of scope for the manager. `parseManifest` takes an already-decoded structural value and produces a validated `Manifest`; bytes-to-structure is left to the packet layer. | §10 defines what a manifest *contains*, never how it is laid out in bytes. PACKET_SPEC §9.2 Manifest defines the layout and was out of scope. The manager still needs a boundary between untrusted input and a domain object, and this is the half §10 governs. | `src/core/manifest/manifestManager.ts` | Whichever phase reads PACKET_SPEC §9.2 |
| A5-02 | Manifest integrity (§10.7.3, §10.8) is **an input** to validation, not something the manager computes: the caller states whether verification passed. | §10.8 requires the manifest to carry its own integrity protection and be verified before acceptance, but §10 never says where that value lives or how it is computed. Making it a required field means the check cannot be skipped by omitting an option. | `src/core/manifest/manifestManager.ts` | Integrity phase (§20), and PACKET_SPEC §9.2 |
| A5-03 | Only "unknown optional fields SHALL be ignored" (§10.12) is implemented. Unknown **mandatory** fields are not detected. | §10.12 requires unknown mandatory fields to terminate validation, but defines no mechanism by which a receiver could tell that an unrecognised field was mandatory. §24 Compatibility Rules was unread and may define one. | `src/core/manifest/manifestManager.ts` | Against §24.9 and §24.12 |
| A5-04 | A file's packet count defaults to `ceil(size / packetSize)` and may be overridden per file. | §10.5 requires a per-file packet count but does not say how it is derived. The derivation only holds when the transferred stream is the original bytes; a compressed or encrypted file occupies a different number of packets, and §18 and §19 were unread. | `src/core/manifest/manifestManager.ts` | Compression and encryption phases (§18, §19) |
| A5-05 | An accepted manifest is retained **in memory**, keyed by session, and a second manifest for the same session is refused. | §10.14 requires the receiver to retain the manifest for the session's duration and forbids regenerating it during an active session; §10.9 makes it immutable once accepted. Where retention lives is not stated, and storage is out of scope for this milestone. | `src/core/manifest/manifestManager.ts` | Reconstruction and persistence work, against §10.14 |

## 3.5 Packet Manager (PRO-003)

| ID | Assumption | Why necessary | Where | Verify in |
| --- | --- | --- | --- | --- |
| A6-01 | §11.5's "every packet SHALL belong to exactly one File" is read as describing **data** packets. A manifest packet belongs to no file and is stored under a nil-UUID key. | Read literally, §11.5 would require a manifest packet to name one file — but §11.4 has exactly one manifest per session and §10.11 has it describing many files, so no single file could be named. The nil UUID is the same sentinel PACKET_SPEC §5 needs for the mandatory File ID field. | `src/core/registry/packetRegistry.ts`, `src/core/packet/packetManager.ts` | Reconstruction work, against §13 and §16 |
| A6-02 | Unknown packet types (§11.4) are not handled by PacketManager. | §11.4 requires unknown *optional* types to be ignored and unknown *mandatory* types to terminate the session, but defines no way to tell which an unrecognised type is. The binary layer already rejects unregistered type bytes (`UNKNOWN_PACKET_TYPE`), so nothing is silently accepted. | `src/core/packet/deserializer.ts` | Against §24.10 Unknown Packet Types |
| A6-03 | `packetize` divides a stream at exactly `packetSize` boundaries, producing contiguous indices from zero. | §11.9 says packets SHOULD use the negotiated size with a possibly shorter final packet, and §11.11 has the sender transmitting sequentially by index; neither states the division rule. §11.9 also permits smaller payloads "for transport optimization", which this does not implement. | `src/core/packet/packetManager.ts` | Adaptive transport (§17) |
| A6-04 | `serialize`/`deserialize` on PacketManager (API_SPEC §7) are delegations to an injected codec, and the manager holds no byte logic. | API_SPEC §7 places both on this interface, while the layering requires the protocol layer not to implement binary concerns. Delegation satisfies both: the call direction Protocol → Binary is the permitted one. A manager built without a codec still performs every protocol operation. | `src/core/packet/packetManager.ts` | Whichever phase wires the codec in |

## 3.6 Resume Engine (PRO-004)

| ID | Assumption | Why necessary | Where | Verify in |
| --- | --- | --- | --- | --- |
| A7-01 | Resume acts on a session in `Paused` (or already `Resuming`). A session still `Active`, or one that never reached `Active`, is refused as not resumable. | §14.3's lifecycle starts at Active → Interrupted → Paused, and §14.7 transitions Paused → Resuming, but §14 never states which states are ineligible. "Interrupted" appears in §14.3's diagram and is not a `SessionState` in §8.8 or §26.4 — it is read as the event that causes the pause, not a state. | `src/core/resume/resumeEngine.ts` | Against §12 Transfer Protocol, which may name an interrupted transfer state |
| A7-02 | Packet-map integrity (§14.7.4) is checked as: every stored index is below its file's declared count, and every file holding packets is described by the manifest. | §14.7.4 requires "Packet Map integrity" to be verified without defining what integrity of the map means. These are the two ways a map and a manifest can disagree using only information both hold. | `src/core/resume/resumeEngine.ts` | Against §13.16 Packet Map |
| A7-03 | Resume is split into `requestResume` (validate, Paused → Resuming) and `completeResume` (Resuming → Active). | §14.3 lists "Resume Requested", "Session Validation" and "Continue Transfer" as distinct steps, but §14 gives no API. Splitting them lets a caller prepare between validation and continuation; collapsing them would make the `Resuming` state unobservable. | `src/core/resume/resumeEngine.ts` | Against §26.8 Resume FSM |
| A7-04 | On resume failure the engine terminates the session **and** releases packet storage, then reports. It does not set a `Failed` transfer state. | §14.7 and §14.13 require the session to terminate and temporary packet storage to be released. §14.13 also says "the transfer SHALL enter the Failed state" — but Transfer has no state machine yet (A2-02), so that part is not implemented. | `src/core/resume/resumeEngine.ts` | TransferManager, against §12 and §26.7 |

## 3.8 QR Transport (Phase 5)

| ID | Assumption | Why necessary | Where | Verify in |
| --- | --- | --- | --- | --- |
| A9-01 | The adaptation policy — a 20-frame window, degrade below 80% success, improve above 98%, one ladder step at a time — is chosen, not specified. | QR_SPEC §10 permits adapting frame duration, version and error correction but gives no thresholds, window or algorithm. PROTOCOL_SPEC §17 Adaptive Transport was not read. A policy reacting per frame oscillates, so some window had to be picked. | `src/qr/adaptiveTiming.ts` | Against PROTOCOL_SPEC §17 |
| A9-02 | Degrading moves rate **and** error correction one step each; improving moves only rate. | §10 lists both as adjustable without saying how they relate. Raising throughput is cheaply reversible; lowering error correction gives up margin that was doing work. | `src/qr/adaptiveTiming.ts` | Against PROTOCOL_SPEC §17.7, §17.8 |
| A9-03 | The quiet zone is 4 modules, and narrower is refused. | §13 requires the quiet zone "preserved" without giving a width. Four is the ISO/IEC 18004 requirement, and narrowing it is the commonest cause of codes that scan in testing and fail in the hand. | `src/qr/qrRenderer.ts` | Any phase reading QR_SPEC §16 or Appendix A |
| A9-04 | Module size is floored to a whole unit, so a rendered code may be smaller than the requested target. | §13 forbids distortion, and fractional module sizes produce seams and blurred edges. §13 gives no sizing rule. | `src/qr/qrRenderer.ts` | UI phase, against §11 |
| A9-05 | Maximum byte capacities per level (2953 / 2331 / 1663 / 1273) are hard-coded. | §6 leaves supported versions implementation-defined and gives no capacity table. These are the ISO/IEC 18004 values for version 40, not invented ones, and are needed so the transport can choose a packet size instead of discovering the limit by failing. | `src/qr/qrEncoder.ts` | Any phase reading QR_SPEC Appendix A |

## 3.7 Recovery Engine (PRO-005)

| ID | Assumption | Why necessary | Where | Verify in |
| --- | --- | --- | --- | --- |
| A8-01 | A recovery packet (`PacketType.Recovery`) is reported as **unusable** rather than stored. | §15.7 says recovery packets MAY exist and SHALL never replace original data packets, and their content is parity for forward error correction — which §15.6 Strategy 2 marks OPTIONAL in OSP/1.0 and not implemented. Storing one at a data index would violate §15.7; silently dropping it would hide the fact that a peer is using a strategy we cannot perform. | `src/core/recovery/recoveryEngine.ts` | When forward error correction is implemented, against §15.6 and PACKET_SPEC §9.4 |
| A8-02 | `RecoveryCondition` is an enumeration the caller supplies; the engine does not detect which condition occurred. | §15.4 lists recoverable and non-recoverable conditions but gives no mechanism for classifying an observed failure — and several ("dropped optical frames", "camera frame loss") are transport observations the protocol layer cannot make without violating §15.14.7. | `src/core/recovery/recoveryEngine.ts` | Camera and transport phases |
| A8-03 | The manifest's `recoveryMethod` string is matched against the three §15.6 strategy names; an unrecognised value yields no strategy rather than an error. | §10.5 carries a recovery method and §15.6 names three strategies, but neither states the wire spelling. §24.11 Unknown Algorithms was unread. | `src/core/recovery/recoveryEngine.ts` | Against §24.11 |

---

# 4. Assumptions By Verifying Phase

A phase should check these before building on them.

| Phase / work | Entries to verify |
| --- | --- |
| Forward error correction | A8-01 |
| Camera / transport phases | A8-02 |
| Unknown algorithms (§24.11) | A8-03 |
| TransferManager | A2-02, A4-05 |
| Packet ordering (§13) | A3-04 |
| Reconstruction (§13, §16) | A6-01, A5-05 |
| TransferManager | A7-01, A7-04 |
| Packet map (§13.16) | A7-02 |
| Resume FSM (§26.8) | A7-03 |
| Manifest wire format (PACKET_SPEC §9.2) | A5-01, A5-02, A3-03, A3-05 |
| Compression / Encryption (§18, §19) | A2-05, A5-04 |
| Integrity / Security (§20, P11) | A3-01, A3-02, A2-05, A5-02, A3-05 |
| Compatibility rules (§24) | A5-03, A6-02 |
| Adaptive transport (§17) | A6-03, A9-01, A9-02 |
| QR rendering and capacity (QR_SPEC §16, Appendix A) | A9-03, A9-04, A9-05 |
| Version negotiation (§23) | A2-04 |
| Timing (§22) | A4-03 |
| Codec wiring | A6-04 |

---

# 5. Resolved Assumptions

| ID | Assumption | Outcome |
| --- | --- | --- |
| A2-09 | Identifiers are opaque non-empty strings. | **Corrected.** PACKET_SPEC §5 gives the Session ID and File ID fields 16 bytes, encoded per §3 as UUIDs. The domain model was refactored to UUID-based value types so an identifier that cannot be serialized cannot be constructed. Recorded as a demonstration that this ledger works: the assumption was made before PACKET_SPEC was read, and reading it corrected the model. |
| A2-01 | `Session` omits the accumulating members of §8.7. | **Confirmed** by PRO-001. The SessionManager owns `lastActivityAt` and the session registry; the domain model stayed a value object. |
| A4-01 | The session lifecycle is not literally linear; the table encoded §8.8 and the §8.17 invariants. | **Partly corrected** by reading §26.4 and STATE_MACHINES.md §6 before PRO-004. §26.4 supplies an explicit allowed-transition list, which is now honoured in full — including the direct `Paused → Active` edge, which the table had been missing. `Resuming` is kept because §8.8 defines its semantics and §8.3 lists it; §26.4 omitting it is read as showing the shortest path, not as deleting a state. Every live state may still expire, because §8.9's SHALL outranks §26.4's unkeyworded list under the §4.6 precedence rule. Full reasoning is in `src/core/session/transitions.ts`. |
| A4-02 | `Handshake → Waiting` is legal: a failed handshake need not end the session. | **Contradicted and removed.** §26.4's allowed-transition list does not contain it, and no other section supports it. The edge was an inference from §8.8's description of the sender waiting for receivers. A handshake that fails now either retries within `Handshake` or expires. |
| A2-07 | A zero-byte file and a zero-packet manifest entry are legal. | **Confirmed** by PRO-002. §10.7 and §10.13 impose no minimum size or packet count; `packetsFor(0, n)` is 0 and a file declaring zero packets is complete. |
| A2-08 | The manifest derives its totals rather than accepting them. | **Confirmed** by PRO-002 against §10.7.5 and §10.13. Deriving on creation and *checking* on parse turned out to be the right split: a manifest built locally cannot be inconsistent, and one that arrived is checked against exactly the §10.7.5 rule. |
| A2-05 (recovery method only) | Recovery method is an opaque string. | **Partly resolved** by PRO-005. §15.6 names three strategies — Natural Repetition (the OSP/1.0 default), Forward Error Correction (OPTIONAL, future) and Selective Recovery (not part of OSP/1.0) — so `RecoveryStrategy` is now an enumeration in `src/core/recovery/recoveryEngine.ts`. The manifest field stays a string, because §15.6 does not give the wire spelling (A8-03). Compression, encryption and integrity algorithms remain opaque; §18, §19 and §20 are still unread. |
| A2-03 | The domain packet kinds are Manifest, Data and Recovery. | **Confirmed** by PRO-003 against §11.4, which defines exactly those three logical types plus a rule for future ones (see A6-02). No change needed. |
| A2-06 | A manifest packet has no `fileId`; a data packet must have one. | **Confirmed for data packets** by §11.5, and PRO-003 now enforces it: a data packet with no file is rejected as `MISSING_FILE`. §11.5's literal text would also require a manifest packet to name one file, which is impossible — see A6-01. |
| A3-03 | The nil UUID in the header's File ID field means "belongs to no single file". | **Retained.** §11.5 does not name a sentinel, and §11.4 with §10.11 confirm a manifest packet cannot belong to one file. The same key is now used by the packet registry, so encoding and storage agree. Still to be checked against PACKET_SPEC §9.2. |

---

# 6. What Does Not Belong Here

This document tracks **implementation assumptions only** — decisions taken
because a governing section had not been read yet.

| Not this | Goes here instead |
| --- | --- |
| A defect in a specification: internally inconsistent, contradicts another document, requires behaviour with no mechanism, omits a needed value | `docs/SPEC_ISSUES.md` |
| A decision made **with** the governing specification in hand | A code comment citing the section |
| An architectural choice no specification governs — injection style, module layout | `ARCHITECTURE_GRAPH.md`, or an ADR under `docs/decisions/` |
| A known bug | The defect tracker |

The distinction between this file and `SPEC_ISSUES.md` is worth keeping sharp:
an entry here says *"we had not read the rule yet"*, and an entry there says
*"the rule is wrong"*. The first is resolved by reading; the second only by
amending the specification.
