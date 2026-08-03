# Photon

Offline optical file transfer for Android and iOS, built with Expo, React
Native and TypeScript.

photon moves arbitrary files between two devices with no network, no
pairing and no server — the sending device renders a stream of QR codes and the
receiving device reconstructs the file from its camera.

The project is **protocol-first**: `docs/PROTOCOL_SPEC.md` defines system
behaviour, and the application is an implementation of that specification.

---

## Status

**Phase 1 — Architecture Foundation.** The skeleton, toolchain and CI are in
place (P0), and the architectural machinery now compiles and is tested (P1):
dependency injection, event bus, repository pattern, state store,
configuration, logging and the shared error model.

No protocol or product logic exists yet — that begins with the domain models in
Phase 2. See `planning/IMPLEMENTATION_PLAN.md` for the phase sequence and
`ARCHITECTURE_GRAPH.md` for how the layers fit together.

---

## Requirements

- Node.js 22+
- npm 10+
- Expo Go, or an Android/iOS development build

## Getting started

```bash
npm install
npm start
```

## Scripts

| Command                           | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `npm start`                       | Start the Expo dev server                      |
| `npm run android` / `npm run ios` | Run a native development build                 |
| `npm run typecheck`               | TypeScript, strict, no emit                    |
| `npm run lint`                    | ESLint, including architecture boundary rules  |
| `npm run format`                  | Apply Prettier                                 |
| `npm test`                        | Jest test suites                               |
| `npm run build:web`               | Static web export (used as the CI build check) |
| `npm run verify`                  | Typecheck + lint + format check + tests        |

---

## Architecture

Dependencies flow strictly downward. `npm run lint` fails the build on any
violation, and `import/no-cycle` forbids circular references.

```
UI  →  Controllers  →  Services  →  Core Protocol  →  Repositories  →  Adapters  →  Platform APIs
```

| Path                                                                     | Layer                                         |
| ------------------------------------------------------------------------ | --------------------------------------------- |
| `app/`                                                                   | Expo Router routes                            |
| `src/screens`, `src/components`, `src/hooks`, `src/navigation`           | UI                                            |
| `src/controllers`                                                        | Controllers                                   |
| `src/services`, `src/workers`                                            | Services                                      |
| `src/core`                                                               | Core protocol — pure and platform independent |
| `src/repositories`                                                       | Persistence                                   |
| `src/storage`, `src/camera`, `src/qr`                                    | Platform adapters                             |
| `src/state`, `src/events`                                                | State stores and event bus                    |
| `src/types`, `src/utils`, `src/constants`, `src/config`, `src/telemetry` | Shared                                        |

Each layer's `index.ts` documents what it may and may not depend on. The
authoritative rules live in `planning/DEPENDENCIES.md`.

Path aliases (`@core/*`, `@services/*`, `@/*`, …) are declared once in
`tsconfig.json` and mirrored in `jest.config.js`.

---

## Documentation

Specifications are authoritative and each owns exactly one concept.

| Document                 | Defines                        |
| ------------------------ | ------------------------------ |
| `docs/PRD.md`            | Product requirements           |
| `docs/TRD.md`            | Technical requirements         |
| `docs/ARCHITECTURE.md`   | System organisation            |
| `docs/PROTOCOL_SPEC.md`  | Protocol behaviour (canonical) |
| `docs/PACKET_SPEC.md`    | Binary packet layout           |
| `docs/QR_SPEC.md`        | Optical transport              |
| `docs/SECURITY.md`       | Security requirements          |
| `docs/STATE_MACHINES.md` | Runtime state machines         |
| `docs/UI_SPEC.md`        | Screens                        |
| `docs/API_SPEC.md`       | Internal module interfaces     |
| `docs/TEST_SPEC.md`      | Acceptance tests               |
| `docs/ROADMAP.md`        | Future development             |
| `docs/decisions/`        | Architectural Decision Records |

Execution guidance lives in `planning/`, and `AGENTS.md` is required reading
before any code change.

---

## Contributing

1. Read `AGENTS.md`.
2. Read the specification that owns the behaviour you are changing.
3. Change the specification before the implementation.
4. Run `npm run verify` before committing.
