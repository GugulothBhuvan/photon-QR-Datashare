# src/components — UI Components

## Purpose

Reusable presentational building blocks shared across screens.

## Ownership

Owns appearance and interaction only. Per `AGENTS.md` §8, a component may
render UI, display state and dispatch actions — nothing else.

A component must not serialize packets, read files, generate QR codes, perform
protocol logic or implement business rules. If a component needs a computed
value, that value is computed in a service and delivered through a hook.

`src/components` holds pieces reused by more than one screen; screen-specific
composition lives in `src/screens`.

## Allowed dependencies

- `@hooks/*` — the sanctioned route to controllers
- `@state/*` — observable stores
- `@constants/*`, `@domain/*` (types only), `@utils/*` (pure formatting)
- React, React Native and UI libraries

## Forbidden dependencies

- `@core/*` — protocol and packet layer
- `@services/*`, `@repositories/*`
- `@qr/*`, `@camera/*`, `@storage/*` — encoder, camera and filesystem
- `@workers/*`

These are enforced by the UI boundary rule in `eslint.config.js`.

## Public exports

None yet — Phase 0 left a placeholder barrel.

Components are introduced in Phase 8 (UI-001…UI-007) as `docs/UI_SPEC.md`
requires them. A component is only promoted into this directory once a second
screen needs it; until then it stays local to its screen.
