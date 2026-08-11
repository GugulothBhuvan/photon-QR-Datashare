/**
 * Jest configuration.
 *
 * Test taxonomy (docs/TEST_SPEC.md governs the content of these suites):
 *   tests/unit         — deterministic, dependency-free units
 *   tests/integration  — layer collaboration
 *   tests/e2e          — end-to-end flows
 * Colocated `*.test.ts(x)` files next to their module are also collected.
 */
const ALIASES = [
  'core',
  'qr',
  'camera',
  'storage',
  'repositories',
  'services',
  'controllers',
  'workers',
  'hooks',
  'state',
  'components',
  'screens',
  'navigation',
  'constants',
  'config',
  'utils',
  'events',
  'telemetry',
];

/** Mirrors the `paths` map in tsconfig.json so imports resolve identically. */
const moduleNameMapper = {
  '^@/(.*)$': '<rootDir>/src/$1',
  '^@domain/(.*)$': '<rootDir>/src/types/$1',
  ...Object.fromEntries(ALIASES.map((alias) => [`^@${alias}/(.*)$`, `<rootDir>/src/${alias}/$1`])),
};

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper,
  testMatch: [
    '<rootDir>/tests/**/*.test.{ts,tsx}',
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/app/**/*.test.{ts,tsx}',
  ],
  /**
   * Benchmarks are excluded from the default run.
   *
   * `tests/performance/*.bench.test.ts` encodes and decodes hundreds of QR
   * frames to report timings. That is worth running deliberately and not worth
   * running on every pull request, so `npm run benchmark` overrides this.
   */
  testPathIgnorePatterns: ['/node_modules/', '\\.bench\\.test\\.tsx?$'],

  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/index.ts', '!src/**/*.d.ts'],
  coverageDirectory: '<rootDir>/coverage',
  clearMocks: true,
  restoreMocks: true,

  /**
   * TEST_SPEC §13: test automation SHALL remain deterministic.
   *
   * Jest's five-second default is not a deterministic budget — it is a
   * wall-clock one. Rendering a screen under coverage instrumentation costs
   * several times what it costs uninstrumented, so `npm test` and
   * `npm run test:ci` disagreed about whether a screen test passed. The tests
   * themselves are deterministic; the budget was not generous enough to say so
   * in both modes. Raised so a slow machine or an instrumented run reports the
   * same result as a fast one, while a genuinely hung test still fails.
   */
  testTimeout: 30_000,
};
