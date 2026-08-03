# src/repositories — Repositories

## Purpose

Owns persistence. Every read and write of a session, packet, transfer or
setting passes through this layer, so the rest of the system can be written
against interfaces instead of a filesystem.

## Ownership

Owns _what_ is stored, its lifetime and its invariants. `src/storage` owns
_how_ bytes reach the device.

A repository exposes domain types, never storage primitives: callers receive a
`Session`, not a JSON blob or an MMKV key. This is what lets storage be swapped
without touching a service.

## Allowed dependencies

- `@storage/*` — storage adapters, injected
- `@domain/*` — domain model types
- `@utils/*`, `@constants/*`

## Forbidden dependencies

- UI of any kind, `@controllers/*`, `@services/*` — dependencies flow downward
- React and React Native
- Direct platform storage APIs — those belong behind `src/storage`

Bypassing a repository to reach storage directly is a non-negotiable violation
(`AGENTS.md` §17.5).

## Public exports

Phase 1 (ARC-003) established the pattern; the concrete repositories arrive
with the domain models they persist.

| Export                     | Kind                                                     |
| -------------------------- | -------------------------------------------------------- |
| `Repository<TId, TEntity>` | Interface — collection of entities keyed by id           |
| `ValueRepository<TValue>`  | Interface — a single stored value, e.g. preferences      |
| `createKeyValueRepository` | Generic implementation over a `KeyValueStore` port       |
| `EntityCodec`              | Injected serialization and validation for stored records |

### Planned

From `planning/IMPLEMENTATION_PLAN.md` (P2, P7) and `planning/TASK_GRAPH.md`
(REC-001). Authoritative signatures live in `docs/API_SPEC.md`.

| Export              | Persists                         | Phase        |
| ------------------- | -------------------------------- | ------------ |
| Packet repository   | Received packets, ordering, gaps | P7 / REC-001 |
| Session repository  | Session state, resume points     | P4           |
| Transfer repository | Transfer records and history     | P2           |
| Settings repository | User settings                    | P2           |

Each is introduced as an interface first so services can be tested against an
in-memory implementation.
