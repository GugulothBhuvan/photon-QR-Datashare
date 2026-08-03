/**
 * Runtime application configuration (ARC-005).
 *
 * The members are specified in docs/ARCHITECTURE.md §6.12, which also draws
 * the boundary this module respects: **protocol configuration stays inside the
 * protocol engine.** Nothing here describes packet sizes, error correction or
 * timing — only user-facing application preferences.
 *
 * Config is immutable. Changing a preference produces a new config
 * (docs/API_SPEC.md §2: immutable data transfer).
 */
import { AppError, ErrorCode } from '@utils/errors';

export const Theme = {
  System: 'SYSTEM',
  Light: 'LIGHT',
  Dark: 'DARK',
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];

/**
 * User preference for optical throughput.
 *
 * A preference, not a frame rate: the mapping from preference to actual
 * timing belongs to the transport layer and docs/QR_SPEC.md.
 */
export const QRSpeedPreference = {
  Slow: 'SLOW',
  Balanced: 'BALANCED',
  Fast: 'FAST',
} as const;

export type QRSpeedPreference = (typeof QRSpeedPreference)[keyof typeof QRSpeedPreference];

export const PerformanceMode = {
  BatterySaver: 'BATTERY_SAVER',
  Balanced: 'BALANCED',
  Performance: 'PERFORMANCE',
} as const;

export type PerformanceMode = (typeof PerformanceMode)[keyof typeof PerformanceMode];

export interface StoragePreferences {
  /** Where completed transfers are written. `undefined` means platform default. */
  readonly downloadDirectory: string | undefined;
  /** Whether received files are kept after a transfer completes. */
  readonly keepReceivedFiles: boolean;
}

export interface AppConfig {
  readonly theme: Theme;
  /** BCP 47 tag, or `undefined` to follow the device. */
  readonly language: string | undefined;
  readonly qrSpeed: QRSpeedPreference;
  readonly performanceMode: PerformanceMode;
  readonly storage: StoragePreferences;
}

export const defaultAppConfig: AppConfig = Object.freeze({
  theme: Theme.System,
  language: undefined,
  qrSpeed: QRSpeedPreference.Balanced,
  performanceMode: PerformanceMode.Balanced,
  storage: Object.freeze({
    downloadDirectory: undefined,
    keepReceivedFiles: true,
  }),
});

const THEMES = new Set<string>(Object.values(Theme));
const SPEEDS = new Set<string>(Object.values(QRSpeedPreference));
const MODES = new Set<string>(Object.values(PerformanceMode));

/**
 * Validates a config, throwing `INVALID_CONFIGURATION` on a bad value.
 *
 * Persisted preferences are untrusted input: an app update can leave a value
 * behind that no longer exists.
 */
export function assertValidConfig(config: AppConfig): void {
  const invalid: string[] = [];

  if (!THEMES.has(config.theme)) {
    invalid.push('theme');
  }
  if (!SPEEDS.has(config.qrSpeed)) {
    invalid.push('qrSpeed');
  }
  if (!MODES.has(config.performanceMode)) {
    invalid.push('performanceMode');
  }

  if (invalid.length > 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      `Invalid configuration: ${invalid.join(', ')}.`,
      {
        details: { invalid },
      },
    );
  }
}

/**
 * Produces a new config with `changes` applied over `base`.
 *
 * Storage preferences are merged one level deep so a caller can change one
 * without restating the rest. The result is validated and frozen.
 */
export function withConfig(base: AppConfig, changes: Partial<AppConfig>): AppConfig {
  const next: AppConfig = Object.freeze({
    ...base,
    ...changes,
    storage: Object.freeze({ ...base.storage, ...(changes.storage ?? {}) }),
  });

  assertValidConfig(next);
  return next;
}
