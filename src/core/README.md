# src/core — Core Protocol

## Purpose

Implements the optical transfer protocol: sessions, manifests, packets, resume
and recovery. This is the layer the rest of the application exists to serve.

Code here is **pure, deterministic and platform independent**. Given the same
inputs it produces the same bytes, on any device, with no clock, no randomness
and no I/O unless injected. That property is what makes the protocol testable
against `test_vectors/`.

## Ownership

Owns protocol _behaviour_. Does not own how bytes are displayed (`src/qr`),
captured (`src/camera`), persisted (`src/repositories`) or orchestrated
(`src/services`).

Behaviour is defined by `docs/PROTOCOL_SPEC.md` and `docs/PACKET_SPEC.md`; this
layer implements those documents and never redefines them. A protocol change
updates the specification first, then this layer, then its tests.

## Allowed dependencies

- `@domain/*` — domain model types
- `@utils/*` — pure helpers
- `@constants/*` — shared constants

### One exception, in the other direction

`@core/errors` is the standardized error model (`docs/API_SPEC.md` §12), and
**every layer may import it** — including adapters, which are otherwise barred
from `core`. An error code is part of the contract each layer answers with, so
it belongs at the bottom of the graph rather than beside the utilities.

It imports nothing, so it cannot participate in a cycle. `eslint.config.js`
allows `@core/errors` and nothing else from `core` in the adapter layers.

## Forbidden dependencies

- React, React Native, Expo — any platform API
- `@services/*`, `@controllers/*`, UI, `@state/*`, `@hooks/*`
- `@repositories/*`, `@storage/*`, `@camera/*`, `@qr/*`

Anything this layer needs from the outside is passed in as an argument or an
injected interface. `npm run lint` enforces every rule above.

## Public exports

| Export                       | Kind                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| `AppError`                   | The only error type that crosses a module boundary         |
| `ErrorCode`, `ErrorCategory` | Standardized codes and categories (`docs/API_SPEC.md` §12) |
| `toUserMessage`              | Reduces any thrown value to something safe to display      |

### Planned

From `planning/TASK_GRAPH.md`. Authoritative signatures live in
`docs/API_SPEC.md`; this table is a map, not a contract.

| Export                           | Task             | Specification           |
| -------------------------------- | ---------------- | ----------------------- |
| Packet header / footer           | PKT-001, PKT-002 | `docs/PACKET_SPEC.md`   |
| Packet serializer / deserializer | PKT-003, PKT-004 | `docs/PACKET_SPEC.md`   |
| Packet validator                 | PKT-005          | `docs/PACKET_SPEC.md`   |
| `SessionManager`                 | PRO-001          | `docs/PROTOCOL_SPEC.md` |
| `ManifestManager`                | PRO-002          | `docs/PROTOCOL_SPEC.md` |
| `PacketManager`                  | PRO-003          | `docs/PROTOCOL_SPEC.md` |
| Resume engine                    | PRO-004          | `docs/PROTOCOL_SPEC.md` |
| Recovery engine                  | PRO-005          | `docs/PROTOCOL_SPEC.md` |

Consumers import from the barrel (`@core/...`), never from internal files.
