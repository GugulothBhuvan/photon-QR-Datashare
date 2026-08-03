# src/controllers — Controllers

## Purpose

Translates user intent into service calls and application state. A controller
is the seam between the UI and the business layers, and it is deliberately
thin.

## Ownership

Owns **coordination**, not behaviour: sequencing calls, mapping results onto
state stores, and publishing events. Per `planning/DEPENDENCIES.md` §11.6,
controllers coordinate rather than implement.

If logic in a controller can be stated without reference to the UI, it belongs
in a service.

## Allowed dependencies

- `@services/*` — the work itself
- `@state/*` — observable stores
- `@events/*` — event bus
- `@domain/*`, `@utils/*`, `@constants/*`

## Forbidden dependencies

- React, React Native, Expo — controllers are plain TypeScript and must be
  testable with no renderer
- `@components/*`, `@screens/*`, `@navigation/*`

Components reach controllers through `src/hooks`, which is the only place
React and controllers meet.

## Public exports

None yet — Phase 0 left a placeholder barrel.

The controller set follows the screens in `docs/UI_SPEC.md` (send, receive,
progress, history, settings), but the actual decomposition is defined by
`docs/API_SPEC.md` and implemented in Phase 8. Nothing is committed to here in
advance.
