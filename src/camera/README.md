# src/camera — Camera Adapter (Receive Side)

## Purpose

Acquires camera frames and extracts QR payloads from them. This is the inbound
half of the optical link; `src/qr` is the outbound half.

## Ownership

Owns capture and detection: camera lifecycle and permissions, frame delivery,
locating a QR code in a frame and decoding it to bytes.

Ownership stops at the bytes. Per `planning/DEPENDENCIES.md` §5, this layer
must not depend on packet serialization — it does not parse headers, verify
checksums or track sequence numbers. Those are protocol concerns owned by
`src/core`, reached through `CameraService`.

## Allowed dependencies

- Platform camera APIs (Vision Camera — `planning/DEPENDENCIES.md` §9)
- A QR decoding library
- `@domain/*` — types
- `@utils/*`, `@constants/*`

## Forbidden dependencies

- `@core/*` — packet serialization and protocol
- `@services/*`, `@controllers/*`, `@repositories/*`
- UI and navigation

## Public exports

None yet — Phase 0 left a placeholder barrel.

Planned surface, from `planning/TASK_GRAPH.md` (CAM-001…CAM-004). Authoritative
signatures live in `docs/API_SPEC.md`.

| Export          | Task    | Responsibility                        |
| --------------- | ------- | ------------------------------------- |
| Camera module   | CAM-001 | Lifecycle, permissions, configuration |
| Frame processor | CAM-002 | Frame delivery and preprocessing      |
| QR detection    | CAM-003 | Locate a code within a frame          |
| QR decoder      | CAM-004 | Code → payload bytes                  |

Frame processing runs off the UI thread. Decoded payloads are handed upward
immediately and never logged (`docs/SECURITY.md`, `AGENTS.md` §12).
