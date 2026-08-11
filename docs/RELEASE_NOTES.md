# RELEASE_NOTES.md

---

## 0.1.0 — Protocol engine and application, pre-release

**This is not v1.0.** `planning/IMPLEMENTATION_PLAN.md` P12 names v1.0 as the
exit criterion, and it is not met: PROTOCOL_SPEC §29.13 requires Version
Negotiation for any compliance level, and SI-008 blocks it. See
`docs/COMPLIANCE.md` for the full declaration and §6 there for everything else
outstanding.

What this release is: a complete, tested implementation of everything in the
specification that could be implemented from it, with each gap named.

---

### What works

**Protocol engine.** Sessions with a reconciled state machine, manifests,
packets, packet ordering, reconstruction, resume and recovery by natural
repetition. No clock, timer or randomness anywhere inside it — the same inputs
always produce the same run.

**Binary layer.** The §5 packet header, CRC32 footer, serialization and
deserialization, with ten distinct rejection codes so a refused packet says why.

**QR transport.** Encoding, §13-conformant rendering, rasterising, frame
scheduling and lazy frame production. Frames are encoded on demand, so peak
memory is a property of the display window rather than the file.

**Camera path.** Decoding, a luminance pre-check that skips frames too dark or
too bright to read, and downsampling — all behind a port, so the whole receive
pipeline runs and is tested with no hardware.

**Integrity.** SHA-256, implemented from FIPS 180-4 and pinned to the standard's
published vectors including the million-character one. Every reconstructed file
is verified before it is reported as received.

**Application.** Seven screens and seven routes: home, send, receive, transfer
progress, history, settings and about. Theming, accessibility roles and labels,
loading, empty and error states.

---

### What does not work, and why

| Gap | Reason |
| --- | --- |
| Version negotiation | SI-008 — the specification defines a version format the header cannot hold |
| Encryption | SI-012 — §19.7 and SECURITY.md §8 defer key exchange to each other |
| Adaptive transport, closed loop | SI-010 — the signals are receiver-side, the responses sender-side, and there is no back-channel |
| Compression | §18 is unread; the phase has not run |
| Device camera | A12-01 — needs a native module and a development build |
| File picker | A12-02 — the Send route injects a no-op |
| Transfer history | A12-03 — no retention policy is specified |
| Secure storage | A14-03 — no keystore in the technology stack |
| Worker threads | SI-011 — a planned deliverable with no technology and no specification |

Nothing in that list is stubbed to look finished. Encryption is refused rather
than silently skipped; an unsupported integrity algorithm fails closed; the
camera preview is visibly a placeholder.

---

### Not measured

Memory, CPU and battery targets (TRD §34), Android and iOS behaviour
(TEST_SPEC §9), real camera capture and a real optical light path. These need
hardware. They are listed in `docs/CURRENT_STATE.md` §9 and have not been
estimated, simulated or inferred.

Transfer success **is** measured: 100% across the §10 file corpus, including
channels with 20% loss, 20% corruption and 30% duplication.

---

### Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Clean |
| `npm run lint` | Clean, 0 errors and 0 warnings |
| `npm run format:check` | Clean |
| `npm test` | 1239 passing across 53 suites |
| `npm run build:web` | Succeeds, 9 static routes |

Native production builds have not been produced: they need EAS or a configured
native toolchain, neither available in this environment.

---

### Specification defects raised

Twelve, in `docs/SPEC_ISSUES.md`. SI-008 blocks a compliant release; SI-012
blocks encryption. The rest are recorded and worked around without inventing
protocol.

---

### Upgrade notes

None. This is the first release.

Protocol compatibility policy is in `docs/COMPATIBILITY.md`. The six stable
contracts in `docs/CONTRACTS.md` may not change without an ADR.
