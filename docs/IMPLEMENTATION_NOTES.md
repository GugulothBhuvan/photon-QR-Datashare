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

# 3. Open Assumptions

## 3.1 Domain Models (Phase 2)

| ID | Assumption | Why necessary | Where | Verify in |
| --- | --- | --- | --- | --- |
| A2-01 | `Session` omits the accumulating members of §8.7 — packet statistics, packet map, stored manifest. Those are managed state, not part of the value object. | A value object that accumulates is never equal to itself twice. §8.7 lists them as Session Context without saying whether they are one object. | `src/types/session.ts` | Verified — see §5 |
| A2-02 | `Transfer` carries identity and shape with **no state machine**. | §12 Transfer Protocol and §26 Transfer FSM were both out of scope. Inventing states would create a second, unauthoritative definition of protocol behaviour. | `src/types/transfer.ts` | TransferManager, against §12 and §26.7 |
| A2-03 | The domain packet kinds are Manifest, Data and Recovery. | §11.4 enumerates packet types formally and was unread. The three were attested by §8.5 and §10.10, which had been read. | `src/types/packet.ts` | PRO-003, against §11.4 |
| A2-04 | `ProtocolVersion` is a single number, later bounded to 0–255 by PACKET_SPEC §5. | §3.29 defines it as a numeric identifier. §23.3 defines the version *format* and was unread; if it is structured (major/minor), this type changes. | `src/types/ids.ts` | Version negotiation, against §23.3 |
| A2-05 | Compression method, encryption method, recovery method and integrity algorithm are **opaque strings**, not enumerations. `'NONE'` is the only named constant. | §15, §18, §19 and §20 name the permitted values and were all unread. Enumerating them from guesswork would have invented protocol values. | `src/types/manifest.ts` | PRO-005 (§15), and the compression, encryption and integrity phases (§18, §19, §20) |
| A2-06 | A manifest packet has no `fileId`; a data packet must have one. | §3.13 places a packet index within a *file* transfer, and a manifest describes the transfer rather than one file. §11 was unread. | `src/types/packet.ts` | PRO-003, against §11.4 and §11.7 |
| A2-07 | A zero-byte file and a zero-packet manifest entry are legal. | §3.8 admits any byte sequence as a file. No section read said otherwise. | `src/types/fileMetadata.ts`, `src/types/manifest.ts` | PRO-002, against §10.7 and §10.13 |
| A2-08 | The manifest **derives** `fileCount`, `totalSize` and `totalPacketCount` from its entries rather than accepting them as input. | §10.5 lists them as contents and §10.13 makes an inconsistent count grounds for rejection. Deriving them makes an inconsistent manifest unconstructable. Receiver-side validation of a manifest that arrived over the wire (§10.7) is a separate concern. | `src/types/manifest.ts` | PRO-002, against §10.7 and §10.13 |

## 3.2 Packet Layer (Phase 3)

| ID | Assumption | Why necessary | Where | Verify in |
| --- | --- | --- | --- | --- |
| A3-01 | "CRC32" in PACKET_SPEC §6 means IEEE 802.3 — reflected polynomial `0xEDB88320`, init and final `0xFFFFFFFF`. | §6 names the field without naming a variant. This is what CRC32 means unqualified (zlib, PNG, gzip, Ethernet). Pinned by the standard `"123456789"` → `0xCBF43926` check vector. | `src/core/packet/crc32.ts` | Integrity phase, against §20.7 |
| A3-02 | The CRC covers the header and payload — every byte before the footer. | §6 does not state the coverage. This is the only definition under which a receiver can verify a packet it has not yet trusted. | `src/core/packet/serializer.ts` | Integrity phase, against §20.5 |
| A3-03 | The nil UUID in the header's File ID field means "belongs to no single file". | §5 makes the field mandatory, but a manifest packet belongs to no file. All-zero bytes are the natural encoding; §5 gives no sentinel. | `src/core/packet/serializer.ts` | PRO-003, against §11.7 |
| A3-04 | A packet index at or beyond the declared total is invalid, when the total is non-zero. | §12 lists "Packet Index" as a validation item without stating the rule. §3.13 makes indices zero-based. §13 Packet Ordering was unread. | `src/core/packet/validator.ts` | Packet ordering work, against §13.4 |
| A3-05 | The footer layout — whether the optional SHA-256 field is present — is fixed for a session and supplied to both serializer and parser. | §6 says footer size "depends on protocol configuration" without saying where that is carried. A reader cannot infer it: 36 trailing bytes are indistinguishable from 4 plus 32 bytes of payload. | `src/core/packet/footer.ts` | PRO-002 (manifest protocol configuration, §10.5) and the integrity phase |
| A3-06 | The magic number is `0x4F53`. | The value appears nowhere in §5, which defines the field. Obtained by a targeted single-line search of §13, now sanctioned by AGENTS.md §7.1. | `src/core/packet/header.ts` | Any phase reading §13 |

## 3.3 Session Manager (PRO-001)

| ID | Assumption | Why necessary | Where | Verify in |
| --- | --- | --- | --- | --- |
| A4-01 | The session lifecycle is not literally linear. The transition table encodes §8.8 and the §8.17 invariants, with §8.3 as the happy path. | §8.3 draws a chain, but §8.8 has Active returning from Paused via Resuming, and §8.9 lets a timeout expire any live state. §26.4 Session FSM and `docs/STATE_MACHINES.md` were both out of scope. | `src/core/session/transitions.ts` | Against §26.4 and `docs/STATE_MACHINES.md`, before PRO-004 |
| A4-02 | `Handshake → Waiting` is a legal transition: a failed handshake need not end the session. | §8.8 has the sender waiting for receivers, but §9 Handshake Protocol was unread and may specify otherwise. | `src/core/session/transitions.ts` | Handshake work, against §9.14 |
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

---

# 4. Assumptions By Verifying Phase

A phase should check these before building on them.

| Phase / work | Entries to verify |
| --- | --- |
| PRO-002 ManifestManager | A2-07, A2-08, A3-05 |
| PRO-003 PacketManager | A2-03, A2-06, A3-03 |
| PRO-004 ResumeEngine | A4-01 (check §26.4 first) |
| PRO-005 RecoveryEngine | A2-05 (§15) |
| TransferManager | A2-02, A4-05 |
| Packet ordering | A3-04 |
| Handshake | A4-02 |
| Manifest wire format (PACKET_SPEC §9.2) | A5-01, A5-02 |
| Compression / Encryption | A2-05 (§18, §19), A5-04 |
| Integrity / Security (P11) | A3-01, A3-02, A2-05 (§20), A5-02 |
| Compatibility rules (§24) | A5-03 |
| Reconstruction / persistence | A5-05 |
| Version negotiation | A2-04 |
| Timing | A4-03 |

---

# 5. Resolved Assumptions

| ID | Assumption | Outcome |
| --- | --- | --- |
| A2-09 | Identifiers are opaque non-empty strings. | **Corrected.** PACKET_SPEC §5 gives the Session ID and File ID fields 16 bytes, encoded per §3 as UUIDs. The domain model was refactored to UUID-based value types so an identifier that cannot be serialized cannot be constructed. Recorded as a demonstration that this ledger works: the assumption was made before PACKET_SPEC was read, and reading it corrected the model. |
| A2-01 | `Session` omits the accumulating members of §8.7. | **Confirmed** by PRO-001. The SessionManager owns `lastActivityAt` and the session registry; the domain model stayed a value object. |

---

# 6. What Does Not Belong Here

- Decisions made **with** the governing specification in hand. Those belong in
  code comments citing the section, not here.
- Architectural choices that no specification governs — dependency injection
  style, module layout. Those belong in `ARCHITECTURE_GRAPH.md` or an ADR under
  `docs/decisions/`.
- Known defects. Those are defects, not assumptions.
