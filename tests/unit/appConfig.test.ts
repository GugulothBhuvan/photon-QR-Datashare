/**
 * Application configuration (ARC-005) — docs/ARCHITECTURE.md §6.12.
 */
import {
  assertValidConfig,
  defaultAppConfig,
  PerformanceMode,
  QRSpeedPreference,
  Theme,
  withConfig,
  type AppConfig,
} from '@config/appConfig';
import { AppError, ErrorCode } from '@utils/errors';

describe('defaultAppConfig', () => {
  it('is immutable', () => {
    expect(Object.isFrozen(defaultAppConfig)).toBe(true);
    expect(Object.isFrozen(defaultAppConfig.storage)).toBe(true);

    (defaultAppConfig as { theme: Theme }).theme = Theme.Dark;
    expect(defaultAppConfig.theme).toBe(Theme.System);
  });

  it('follows the device where no preference is expressed', () => {
    expect(defaultAppConfig.theme).toBe(Theme.System);
    expect(defaultAppConfig.language).toBeUndefined();
    expect(defaultAppConfig.storage.downloadDirectory).toBeUndefined();
  });

  it('validates', () => {
    expect(() => assertValidConfig(defaultAppConfig)).not.toThrow();
  });
});

describe('withConfig', () => {
  it('returns a new config and leaves the base untouched', () => {
    const next = withConfig(defaultAppConfig, { theme: Theme.Dark });

    expect(next.theme).toBe(Theme.Dark);
    expect(defaultAppConfig.theme).toBe(Theme.System);
    expect(next).not.toBe(defaultAppConfig);
  });

  it('merges storage preferences one level deep', () => {
    const next = withConfig(defaultAppConfig, {
      storage: { downloadDirectory: '/downloads', keepReceivedFiles: true },
    });

    expect(next.storage.downloadDirectory).toBe('/downloads');
    expect(next.storage.keepReceivedFiles).toBe(true);
  });

  it('preserves unrelated values', () => {
    const next = withConfig(defaultAppConfig, { qrSpeed: QRSpeedPreference.Fast });

    expect(next.qrSpeed).toBe(QRSpeedPreference.Fast);
    expect(next.performanceMode).toBe(PerformanceMode.Balanced);
  });

  it('freezes the result, including nested storage preferences', () => {
    const next = withConfig(defaultAppConfig, { theme: Theme.Light });

    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.storage)).toBe(true);

    (next as { theme: Theme }).theme = Theme.Dark;
    expect(next.theme).toBe(Theme.Light);
  });
});

describe('assertValidConfig', () => {
  it('rejects a value left behind by an older app version', () => {
    // Persisted preferences are untrusted: an upgrade can remove an option.
    const stale = { ...defaultAppConfig, qrSpeed: 'LUDICROUS' } as unknown as AppConfig;

    try {
      assertValidConfig(stale);
      throw new Error('expected validation to fail');
    } catch (error: unknown) {
      expect(AppError.is(error)).toBe(true);
      expect((error as AppError).code).toBe(ErrorCode.INVALID_CONFIGURATION);
      expect((error as AppError).message).toContain('qrSpeed');
    }
  });

  it('reports every invalid field at once', () => {
    const broken = {
      ...defaultAppConfig,
      theme: 'NEON',
      performanceMode: 'TURBO',
    } as unknown as AppConfig;

    try {
      assertValidConfig(broken);
      throw new Error('expected validation to fail');
    } catch (error: unknown) {
      expect((error as AppError).message).toContain('theme');
      expect((error as AppError).message).toContain('performanceMode');
    }
  });
});
