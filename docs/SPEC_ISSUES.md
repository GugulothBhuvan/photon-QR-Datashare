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

# 4. Index By Document

| Document | Issues |
| --- | --- |
| `PROTOCOL_SPEC.md` | SI-001, SI-002, SI-004, SI-005, SI-006, SI-007 |
| `STATE_MACHINES.md` | SI-003 |
| `PACKET_SPEC.md` | — |

# 5. Index By Status

| Status | Issues |
| --- | --- |
| `Working` | SI-001, SI-002, SI-005 |
| `Open` | SI-003, SI-004, SI-006, SI-007 |
| `Resolved` | — |
| `Withdrawn` | — |
