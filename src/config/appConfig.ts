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
 *
 * The *shape* is the `Settings` domain model (MOD-005) and lives in
 * `src/types/settings.ts`; this module owns the defaults, the validation and
 * the update helper that operate on it. `AppConfig` is an alias of `Settings`,
 * kept so the Phase 1 surface is unchanged — there is one definition of the
 * value, not two.
 */
import { PerformanceMode, QRSpeedPreference, Theme, type Settings } from '@domain/settings';
import { AppError, ErrorCode } from '@core/errors';

export {
  PerformanceMode,
  QRSpeedPreference,
  Theme,
  type Settings,
  type StoragePreferences,
} from '@domain/settings';

/** Alias of the `Settings` domain model. */
export type AppConfig = Settings;

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
