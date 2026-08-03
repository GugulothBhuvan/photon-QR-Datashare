# Tests

| Suite          | Scope                                               |
| -------------- | --------------------------------------------------- |
| `unit/`        | Single modules in isolation. Deterministic, no I/O. |
| `integration/` | Collaboration between adjacent layers.              |
| `e2e/`         | Full user and protocol flows.                       |

Colocated `*.test.ts` files may also live beside the module under test; both
locations are collected by `jest.config.js`.

Acceptance criteria for each suite are defined in `docs/TEST_SPEC.md`.
