# ADR-0001: Session FSM Reconciliation

**Status:** Accepted
**Date:** Phase 4 (PRO-004)
**Supersedes:** the transition table established in PRO-001

---

## Context

Three documents describe the session state machine, and they do not agree.

| Source | States | Form |
| --- | --- | --- |
| PROTOCOL_SPEC §8.3, §8.8 | Created, Waiting, Handshake, Active, Paused, **Resuming**, Completed, Expired | Narrative; defines each state's meaning |
| PROTOCOL_SPEC §26.4 | **Idle**, Created, Waiting, Handshake, Active, Paused, Completed, Expired | Explicit allowed-transition list; no Resuming; `Paused → Active` direct |
| STATE_MACHINES.md §6 | Created, Handshake, Active, Paused, **Resumed**, Completed, Expired | Linear chain; no Waiting; "Resumed" not "Resuming" |

PRO-001 built its transition table from §8.3 and §8.8 alone, because §26.4 and
STATE_MACHINES.md were outside that milestone's reading scope. The Resume
Protocol acts directly on these states, so the machine had to be made
authoritative before PRO-004 could build on it.

PROTOCOL_SPEC §4.6 defines conflict resolution — but by RFC 2119 **keyword**
precedence (MUST > SHALL > REQUIRED > SHOULD > MAY), not by document. It does
not say which document wins.

---

## Decision

### 1. PROTOCOL_SPEC outranks STATE_MACHINES.md

AGENTS.md §3 names `docs/PROTOCOL_SPEC.md` the canonical source of protocol
behaviour and forbids redefining that behaviour elsewhere. STATE_MACHINES.md
§6's omission of `Waiting`, and its "Resumed" spelling, are therefore not
authoritative.

### 2. Every transition §26.4 allows is allowed

§26.4 is the only source giving an explicit allowed-transition list, which
makes it the most specific statement of the machine. Its full list is honoured
— including `Paused → Active` directly, **which the PRO-001 table was missing**.

### 3. `Resuming` is kept

§8.8 defines `Resuming` with distinct semantics — "only missing packets SHALL
require further transmission" — and §8.3 lists it in the lifecycle. §26.4
omitting it is read as the FSM showing the shortest path out of `Paused`, not
as deleting a state another section defines. Both routes are therefore legal:

```text
Paused → Active              (§26.4)
Paused → Resuming → Active   (§8.3, §8.8)
```

### 4. Every live state may expire

§26.4 lists only `Active → Expired` and `Paused → Expired`. But §8.9 states a
session **SHALL** terminate automatically after exceeding its timeout, with no
qualification by state. Under §4.6, a SHALL outranks an unkeyworded list.

The alternative reading is also plainly wrong on its own terms: a session
abandoned in `Waiting` before any receiver joined could never expire, and §8.10
requires expired sessions to release their resources.

### 5. `Idle` is not a `SessionState`

§26.4 begins `Idle → Created`. But §7.3 describes Idle as the phase where "no
protocol state exists" and there is "no active session". A session that does
not exist cannot hold a state, so Idle is modelled as the **absence of a
session in the registry**, not as a value the `Session` model can take.

---

## Consequences

**Changed from PRO-001:**

| Change | Reason |
| --- | --- |
| Added `Paused → Active` | §26.4 requires it; the table lacked it |
| Removed `Handshake → Waiting` | No section supports it — it was an inference from §8.8's description of the sender waiting for receivers (ledger entry A4-02) |
| Removed `Resuming → Paused` | Unsupported by any source |

A handshake that fails now either retries within `Handshake` or expires; it
cannot return to `Waiting`.

**Kept:** `Resuming`, and expiry from every live state.

**Enforcement:** `src/core/session/transitions.ts` carries the table and the
reasoning; `tests/unit/sessionTransitions.test.ts` asserts every §26.4 edge is
permitted and that the removed edges are refused. A future change to the
machine fails those tests rather than passing silently.

**Recorded in:** `docs/IMPLEMENTATION_NOTES.md` §5 (A4-01 partly corrected,
A4-02 contradicted and removed).

---

## Specification defects this exposes

These are reported, not resolved. The specification is authoritative; where it
is self-inconsistent, that is a defect worth fixing at the source.

1. **§26.4 omits `Resuming`, which §8.3 and §8.8 define.** Either §26.4 should
   list `Paused → Resuming → Active`, or §8.8 should drop the state.
2. **§26.4's expiry edges contradict §8.9.** §26.4 should either list expiry
   from every live state or state that it shows only the principal paths.
3. **STATE_MACHINES.md §6 contradicts PROTOCOL_SPEC on two points** — the
   missing `Waiting` state and the "Resumed" spelling. It should be regenerated
   from §26.4.
4. **§4.6 gives keyword precedence but not document precedence.** The rule that
   PROTOCOL_SPEC outranks the other specifications lives only in AGENTS.md §3,
   which is a contributor guide rather than a specification.
