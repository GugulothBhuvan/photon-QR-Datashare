/**
 * Settings model (MOD-005) — docs/ARCHITECTURE.md §6.12.
 *
 * The defaults and validation that operate on this shape live in
 * `src/config/appConfig.ts` and are covered by `appConfig.test.ts`. This suite
 * covers the value object itself.
 */
import {
  PerformanceMode,
  QRSpeedPreference,
  settingsEquals,
  Theme,
  type Settings,
} from '@domain/settings';
import { defaultAppConfig } from '@config/appConfig';

const base: Settings = {
  theme: Theme.System,
  language: undefined,
  qrSpeed: QRSpeedPreference.Balanced,
  performanceMode: PerformanceMode.Balanced,
  storage: { downloadDirectory: undefined, keepReceivedFiles: true },
};

describe('Settings', () => {
  it('is the shape the application configuration uses — one definition, not two', () => {
    // `AppConfig` is an alias of `Settings`; this assignment only compiles
    // because they are the same type.
    const asSettings: Settings = defaultAppConfig;

    expect(settingsEquals(asSettings, base)).toBe(true);
  });

  it('holds no protocol configuration (§6.12)', () => {
    // Packet size, error correction and timing belong to the manifest and the
    // protocol engine, never to user preferences.
    expect(Object.keys(base).sort()).toEqual([
      'language',
      'performanceMode',
      'qrSpeed',
      'storage',
      'theme',
    ]);
  });
});

describe('settingsEquals', () => {
  it('compares structurally, nested storage preferences included', () => {
    expect(settingsEquals(base, { ...base, storage: { ...base.storage } })).toBe(true);
  });

  it.each([
    ['theme', { theme: Theme.Dark }],
    ['language', { language: 'en-GB' }],
    ['qrSpeed', { qrSpeed: QRSpeedPreference.Fast }],
    ['performanceMode', { performanceMode: PerformanceMode.Performance }],
  ])('detects a difference in %s', (_label, change) => {
    expect(settingsEquals(base, { ...base, ...change })).toBe(false);
  });

  it.each([
    ['downloadDirectory', { downloadDirectory: '/downloads' }],
    ['keepReceivedFiles', { keepReceivedFiles: false }],
  ])('detects a difference in storage.%s', (_label, change) => {
    expect(settingsEquals(base, { ...base, storage: { ...base.storage, ...change } })).toBe(false);
  });
});
