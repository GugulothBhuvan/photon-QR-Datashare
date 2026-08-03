# src/storage — Storage Adapters

## Purpose

Isolates platform storage behind narrow interfaces: the filesystem for file
content and chunk staging, and key-value storage for session and settings
records.

## Ownership

Owns _mechanism_. This is the only place platform storage APIs may be named
(`AGENTS.md` §17.6). Everything above it — including repositories — depends on
the interface, never on the SDK.

Adapters are dumb on purpose: read, write, delete, list, exists. Policy
(what to store, when to evict, how long a temporary file may live) belongs to
`src/repositories` and the security rules in `docs/SECURITY.md`.

## Allowed dependencies

- Platform storage APIs (Expo filesystem, MMKV — see
  `planning/DEPENDENCIES.md` §9)
- `@utils/*`, `@constants/*`

## Forbidden dependencies

- `@core/*` — protocol logic
- `@services/*`, `@controllers/*`, `@repositories/*`
- UI of any kind

An adapter that knows what a packet is has already broken this boundary.

## Public exports

None yet — Phase 0 left a placeholder barrel.

Planned surface. Authoritative signatures live in `docs/API_SPEC.md`; secure
storage requirements are defined by `docs/SECURITY.md` (P11 / SEC-002).

| Export                    | Wraps                                           |
| ------------------------- | ----------------------------------------------- |
| File storage adapter      | Filesystem reads, writes, streaming, temp files |
| Key-value storage adapter | Fast synchronous key-value store                |
| Secure storage adapter    | Encrypted storage for sensitive material        |

Adapters are injected, so tests substitute in-memory implementations and the
suite touches no real device storage.
