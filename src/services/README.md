# src/services — Services

## Purpose

Encapsulates business behaviour by composing the core protocol with
repositories and adapters. A service answers "what should happen", while
`src/core` answers "what the protocol says" and `src/controllers` answers "who
asked".

## Ownership

Owns use cases: starting a transfer, resuming one, verifying a received file.
Services are the only layer permitted to coordinate protocol, persistence and
transport together.

Services do **not** own protocol rules. If a rule can be stated without
reference to storage or transport, it belongs in `src/core`.

## Allowed dependencies

- `@core/*` — protocol engine
- `@repositories/*` — persistence
- `@events/*` — event bus
- `@utils/*`, `@constants/*`, `@domain/*`

## Forbidden dependencies

- `@screens/*`, `@components/*`, `@navigation/*` — a service must never know a
  screen exists
- `@controllers/*` — controllers call services, never the reverse
- React and React Native

Per `planning/DEPENDENCIES.md` §8, collaborators are injected. A service
receives its `PacketManager`; it never constructs one.

## Public exports

None yet — Phase 0 left a placeholder barrel.

Planned surface, from `planning/DEPENDENCIES.md` §5. Authoritative signatures
live in `docs/API_SPEC.md`.

| Export            | Depends on                                                        |
| ----------------- | ----------------------------------------------------------------- |
| `TransferService` | `SessionManager`, `ManifestManager`, `PacketManager`, `QRService` |
| `QRService`       | `PacketManager`, renderer, scheduler                              |
| `CameraService`   | Camera adapter                                                    |

`CameraService` is explicitly forbidden from touching packet serialization —
it hands raw decoded payloads onward and nothing more.
