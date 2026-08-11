# ADR-0007 — What transfer history stores, and for how long

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-08-11 |
| **Relates to** | UI_SPEC §5.5, A12-03, `src/types/history.ts`, `src/repositories/historyRepository.ts` |

## Context

UI_SPEC §5.5 requires a History screen and lists its controls — search, filter,
transfer list, details sheet. It does not say:

- what a history record contains,
- what order records are listed in,
- how long a record is kept,
- whether history survives reinstalling the application.

No other specification section covers it. `PROTOCOL_SPEC.md` describes
transfers, not what an application remembers after one. So these are product
decisions, and implementing History means making them. Making them inside a
repository without recording them would leave four undocumented behaviours in a
component a user's privacy depends on.

## Decision

### 1. Metadata only, never content

A record holds the session id, direction, outcome, completion time, and per
file: name, size, whether integrity verification passed, and where a received
file was written.

It does **not** hold payload bytes. Received files are written to the
destination the user chose; history does not keep a second copy.

An application that duplicated every transfer into its own log would grow
without bound and would retain copies of files a user believed they had
deleted. Neither is something a user asks for by opening History.

### 2. Newest first

§5.5 shows a list without specifying its order. Storage order is insertion
order, which is the oldest first — the opposite of what a transfer log is for.
Ordering is by completion time descending, with the session id breaking ties so
the order is total and two records completed in the same millisecond do not
swap places between reads.

### 3. The most recent 100 records are kept

Alternatives considered:

| Policy | Rejected because |
| --- | --- |
| Keep everything | Unbounded growth on a device with no interface for pruning. |
| Keep for *N* days | Needs a clock in the repository, and deletes records on a schedule the user never sees. A transfer disappearing overnight looks like data loss. |
| Keep the most recent *N* | **Chosen.** Predictable, needs no clock, and bounded. |

100 is far more than a user will scroll and keeps the whole log to a few
kilobytes, which matters because the store is read whole at startup.

Pruning happens on write. A log that pruned on read would grow without bound on
a device that never opens History, and a user opening the screen should not pay
for records they are about to be shown none of.

### 4. History is local and unencrypted, and does not survive reinstalling

Records live in the same application-private store as settings, under the
document directory. They are removed when the application is uninstalled, along
with everything else in that directory.

They are **not** encrypted. `SECURITY.md` has not been read on this point, and
this decision does not claim it satisfies any requirement in it — the store
holds file names and sizes, not payloads, and Photon has no key management
(SI-012), so an encrypted history store would need a key with nowhere to live.
**If `SECURITY.md` turns out to require encryption at rest for metadata, this
decision must be revisited before release.**

## Consequences

- History is bounded, ordered and cheap to read.
- A record written by a later build, or half-written, is refused rather than
  surfaced as a transfer that did not happen.
- The 101st transfer silently removes the oldest. No interface announces this;
  if that turns out to matter, the limit becomes a setting.
- No "clear history" control exists yet. The repository supports it (`clear`),
  and §5.6's Storage section is where it would belong.
