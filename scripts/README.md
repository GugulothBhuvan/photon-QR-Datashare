# Scripts

Developer and CI tooling. Scripts are executable utilities only — they must
never become a home for protocol or application logic, which belongs in
`src/core` and `src/services`.

Planned:

- `generate-test-vectors.ts` — produces the fixtures in `test_vectors/` (Phase 3)
- `benchmark-qr.ts` — QR generation and decode throughput (Phase 10)
- `verify-architecture.ts` — supplementary dependency-boundary audit (Phase 1)
