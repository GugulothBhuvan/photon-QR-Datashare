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
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/index.ts', '!src/**/*.d.ts'],
  coverageDirectory: '<rootDir>/coverage',
  clearMocks: true,
  restoreMocks: true,
};
