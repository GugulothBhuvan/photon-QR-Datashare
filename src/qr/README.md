# src/qr — QR Transport (Send Side)

## Purpose

Turns protocol packets into displayable optical frames, and paces them. This is
the outbound half of the optical link; `src/camera` is the inbound half.

## Ownership

Owns encoding and scheduling: how a byte payload becomes a QR matrix, and when
the next frame is shown. Frame timing and adaptive rate live here, not in a
screen — a component only renders what this layer produces.

Does **not** own packet contents. It receives bytes from the packet layer and
treats them as opaque; it never inspects, reorders or re-frames them.

Behaviour is defined by `docs/QR_SPEC.md`.

## Allowed dependencies

- A third-party QR encoding library (`planning/DEPENDENCIES.md` §9)
- `@domain/*` — types
- `@utils/*`, `@constants/*`

## Forbidden dependencies

- `@storage/*` — the send path streams, it does not persist
- UI, `@controllers/*`, `@repositories/*`, `@services/*`

Per `planning/DEPENDENCIES.md` §5, `QRService` depends on this layer; this
layer never depends on `QRService`.

## Public exports

None yet — Phase 0 left a placeholder barrel.

Planned surface, from `planning/TASK_GRAPH.md` (QR-001…QR-004). Authoritative
signatures live in `docs/API_SPEC.md`.

| Export          | Task   | Responsibility                |
| --------------- | ------ | ----------------------------- |
| QR generator    | QR-001 | Bytes → QR matrix             |
| QR renderer     | QR-002 | Matrix → drawable frame data  |
| Scheduler       | QR-003 | Frame sequencing and pacing   |
| Adaptive timing | P5     | Rate adjustment from feedback |

Generation is expensive and must never block the UI thread
(`AGENTS.md` §11); Phase 10 moves it behind `src/workers`.
