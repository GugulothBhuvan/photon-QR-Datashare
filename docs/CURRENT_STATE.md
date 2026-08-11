# CURRENT_STATE.md

**A navigation document, not a specification.** It says where things are and
what is true today. Every detail it points at is owned by another document,
named in the last section.

**Updated:** end of Milestone B (Phases 8–10).

---

## 1. Architecture

```text
Domain  →  Protocol  →  Binary  →  Transport  →  Adapters  →  UI
```

| Layer | Directory | Owns |
| --- | --- | --- |
| Domain | `src/types` (`@domain/*`) | Immutable value objects, branded ids |
| Protocol | `src/core/{session,manifest,packet,resume,recovery,reconstruction}` | Protocol semantics; no I/O, no clock, no randomness |
| Registry | `src/core/registry` | In-memory storage of live protocol state |
| Binary | `src/core/packet/{header,footer,serializer,deserializer,crc32}` | Wire format |
| Transport | `src/qr` | Encoding, rendering, scheduling, adaptation |
| Adapters | `src/camera`, `src/storage` | Platform edges, reached only through ports |
| Repositories | `src/repositories` | Durable persistence |
| Services | `src/services` | Compose protocol with transport |
| Controllers | `src/controllers` | Screen-facing workflow state; no React |
| UI | `src/components`, `src/screens`, `src/hooks`, `app` | Rendering and platform capabilities |

**Registry → Manager → Contract → Implementation.** A manager owns rules; a
registry owns storage; a contract is what everything above depends on.

Composition happens only in `src/config/appComposition.ts`.

---

## 2. Layer boundaries

Enforced by `eslint.config.js` as `no-restricted-imports` patterns, not by
convention. Notable rules:

- UI may not import core, services, repositories, adapters or workers.
- Controllers may not import React or any platform API.
- Core may not import adapters, telemetry, events, state or hooks.
- Adapters may not import core except `@core/errors` and `@core/contracts`.
- `import/no-cycle` is an error everywhere.

Boundary violations are build failures. They have been fixed by moving work
down a layer, never by widening a rule.

---

## 3. Stable contracts

Frozen. Changing one requires an ADR, documentation updates and a compatibility
review — see `docs/CONTRACTS.md` §4.

`PacketCodec` · `CameraAdapter` · `Clock` · `Logger` · `IdGenerator` ·
`IntegrityVerifier`

---

## 4. Protocol version

`PROTOCOL_VERSION = 1` (OSP/1.0), one byte on the wire.

Version **negotiation is blocked** by SI-008: §23.3 requires `MAJOR.MINOR` and
PACKET_SPEC §5 gives one byte. Compatibility policy: `docs/COMPATIBILITY.md`.

---

## 5. Implemented capabilities

- Sessions with the reconciled FSM (ADR-0001), expiry, and resume
- Manifests: create, parse, validate, retain
- Packets: packetize, serialize, deserialize, validate, accept, release
- CRC32 integrity over header and payload
- QR encoding, rendering, rasterising, scheduling, lazy frame production
- QR decoding from camera frames, luminance pre-check, downsampling
- Reconstruction: packet map, file builder, integrity check
- Recovery via natural repetition; resume from a partial transfer
- Adaptive transport monitoring (recommendation only — see §6)
- Full UI: 7 screens, 7 routes, theming, accessibility
- End-to-end optical loopback in software

---

## 6. Known limitations

| Limitation | Reference |
| --- | --- |
| No device camera adapter; the receive preview is a placeholder | A12-01 |
| No file picker; the Send route injects a no-op | A12-02 |
| No history repository; history renders what it is given | A12-03 |
| Integrity uses `PHOTON-PLACEHOLDER-32`, **not cryptographic** | A12-04 |
| No encryption; Send and Settings report it as unavailable | §19 unread |
| Adaptive transport cannot close its loop — no back-channel | SI-010 |
| No worker threads; lazy encoding used instead | SI-011 |
| Manifest travels in-process, not optically — no wire format defined | A5-01 |

---

## 7. Specification issues

Eleven recorded in `docs/SPEC_ISSUES.md`. **SI-008 is the only blocking one**
and blocks version negotiation, which a v1.0 release needs (§29.13).

`Working` — SI-001, SI-002, SI-005
`Open` — SI-003, SI-004, SI-006, SI-007, SI-009, SI-010, SI-011
`Open, blocking` — SI-008

---

## 8. Unresolved implementation assumptions

Full ledger with rationale: `docs/IMPLEMENTATION_NOTES.md`. Open groups:

| Group | IDs | Verify against |
| --- | --- | --- |
| Domain and packet layer | A2-02, A2-05, A3-01…A3-05, A5-01…A5-05 | §12, §15, §18–§20, PACKET_SPEC §9.2 |
| Protocol engine | A6-01…A6-03, A7-01…A7-04, A8-01…A8-03 | §13, §17, §24, §26 |
| QR and camera | A9-01…A9-05, A10-01…A10-04 | QR_SPEC §16, Appendix A |
| Reconstruction | A11-01…A11-04 | §13.16, §20 |
| UI capability gaps | A12-01…A12-04 | Device work, §20 |
| Performance | A13-01…A13-04 | Device measurement, TRD §25 |

---

## 9. Device-only validation requirements

**Not measurable in this environment. Never simulated, never estimated.**

| Requirement | Source | Needs |
| --- | --- | --- |
| Memory under 150 MB | TRD §34 | Handset under load |
| CPU under 35% | TRD §34 | Process sampler on device |
| Battery under 15% | TRD §34 | Physical handset |
| Android behaviour | TEST_SPEC §9 | Android device |
| iOS behaviour | TEST_SPEC §9 | iOS device |
| Real camera capture, autofocus, exposure | QR_SPEC §12 | A12-01's adapter |
| Real optical light path | — | Two physical devices |
| Startup time in milliseconds | TEST_SPEC §7 | React Native runtime on device |

Transfer success (TRD §34, >99%) **is** verified in software: 100% across the
file corpus, including channels with loss, corruption and duplication.

---

## 10. Verification status

| Check | Status |
| --- | --- |
| `npm run typecheck` | Clean |
| `npm run lint` | Clean — 0 errors, 0 warnings |
| `npm run format:check` | Clean |
| `npm test` | 1177 passing, 51 suites |
| `npm run build:web` | Succeeds, 8 static routes |
| Statement coverage | 93.9% (branch 89.6%, function 90.9%) |

Coverage is reported, not targeted. `tests/system/invariants.test.ts` enforces
the property that matters: every public module is exercised by some test, with
exemptions listed and justified.

---

## 11. Milestones

**Current:** Milestone B complete — Phase 8 (UI), Phase 9 (Testing),
Phase 10 (Performance).

**Next:** Milestone C — Phase 11 (Security), Phase 12 (Release), final
validation.

---

## 12. Where detail lives

| Question | Document |
| --- | --- |
| What the protocol requires | `docs/PROTOCOL_SPEC.md` (canonical) |
| Wire format | `docs/PACKET_SPEC.md` |
| Why an assumption was made | `docs/IMPLEMENTATION_NOTES.md` |
| A defect in the specification | `docs/SPEC_ISSUES.md` |
| A decision that became permanent | `docs/decisions/` |
| What may change and what may not | `docs/COMPATIBILITY.md`, `docs/CONTRACTS.md` |
| Module dependencies | `ARCHITECTURE_GRAPH.md`, `planning/DEPENDENCIES.md` |
| How to work in this repository | `AGENTS.md` |
