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

**Pre-release, 0.1.0.** Phases 0–12 are implemented: architecture, domain
models, packet layer, protocol engine, QR transport, camera engine,
reconstruction, user interface, testing, performance, security and release
preparation.

**This is not v1.0**, and the reason is specific. PROTOCOL_SPEC §29.13 requires
Version Negotiation for any compliance level, and §23.3 defines a `MAJOR.MINOR`
version that PACKET_SPEC §5's one-byte header field cannot hold. The defect is
recorded as SI-008 and the implementation was deliberately left alone rather
than inventing a wire format. See `docs/COMPLIANCE.md`.

Nothing has run on a device. Memory, CPU, battery, Android and iOS behaviour and
the real optical path are unmeasured and are listed in `docs/CURRENT_STATE.md`
§9. A complete transfer _has_ been demonstrated end to end in software, over a
simulated optical channel with loss, corruption and duplication.

Start at `docs/CURRENT_STATE.md` — it is a short navigation document that says
what exists, what does not, and where the detail lives.

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
| `npm run benchmark`               | Pipeline benchmark (excluded from `npm test`)  |

---

## Architecture

Dependencies flow strictly downward. `npm run lint` fails the build on any
violation, and `import/no-cycle` forbids circular references.

```
UI  →  Controllers  →  Services  →  Core Protocol  →  Repositories  →  Adapters  →  Platform APIs
```

| Path                                                                     | Layer                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------- |
| `app/`                                                                   | Expo Router routes                             |
| `src/screens`, `src/components`, `src/hooks`, `src/navigation`           | UI                                             |
| `src/controllers`                                                        | Controllers                                    |
| `src/services`, `src/workers`                                            | Services                                       |
| `src/core`                                                               | Core protocol — pure and platform independent  |
| `src/repositories`                                                       | Persistence                                    |
| `src/storage`, `src/camera`, `src/qr`                                    | Platform adapters                              |
| `src/security`                                                           | Cryptography — reachable only from composition |
| `src/state`, `src/events`                                                | State stores and event bus                     |
| `src/types`, `src/utils`, `src/constants`, `src/config`, `src/telemetry` | Shared                                         |

Each layer's `index.ts` documents what it may and may not depend on. The
authoritative rules live in `planning/DEPENDENCIES.md`.

Path aliases (`@core/*`, `@services/*`, `@/*`, …) are declared once in
`tsconfig.json` and mirrored in `jest.config.js`.

---

## Documentation

Specifications are authoritative and each owns exactly one concept.

| Document                       | Defines                                |
| ------------------------------ | -------------------------------------- |
| `docs/PRD.md`                  | Product requirements                   |
| `docs/TRD.md`                  | Technical requirements                 |
| `docs/ARCHITECTURE.md`         | System organisation                    |
| `docs/PROTOCOL_SPEC.md`        | Protocol behaviour (canonical)         |
| `docs/PACKET_SPEC.md`          | Binary packet layout                   |
| `docs/QR_SPEC.md`              | Optical transport                      |
| `docs/SECURITY.md`             | Security requirements                  |
| `docs/STATE_MACHINES.md`       | Runtime state machines                 |
| `docs/UI_SPEC.md`              | Screens                                |
| `docs/API_SPEC.md`             | Internal module interfaces             |
| `docs/TEST_SPEC.md`            | Acceptance tests                       |
| `docs/ROADMAP.md`              | Future development                     |
| `docs/CURRENT_STATE.md`        | What exists today (start here)         |
| `docs/COMPLIANCE.md`           | §29.14 compliance declaration          |
| `docs/RELEASE_NOTES.md`        | What shipped, and what did not         |
| `docs/SPEC_ISSUES.md`          | Defects found in the specifications    |
| `docs/IMPLEMENTATION_NOTES.md` | Assumptions, and what verifies them    |
| `docs/CONTRACTS.md`            | Stable contracts and how to change one |
| `docs/COMPATIBILITY.md`        | What may change between versions       |
| `docs/decisions/`              | Architectural Decision Records         |

Execution guidance lives in `planning/`, and `AGENTS.md` is required reading
before any code change.

---

## Contributing

1. Read `AGENTS.md`.
2. Read the specification that owns the behaviour you are changing.
3. Change the specification before the implementation.
4. Run `npm run verify` before committing.
