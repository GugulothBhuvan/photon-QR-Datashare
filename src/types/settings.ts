/**
 * Settings — user preferences (MOD-005).
 *
 * Members are specified in docs/ARCHITECTURE.md §6.12. Protocol configuration
 * is explicitly *not* here: packet size, error correction and timing belong to
 * the protocol engine and to the manifest.
 *
 * This module owns the shape. `src/config/appConfig.ts` owns the defaults and
 * the validation that operates on it, and re-exports these types so Phase 1's
 * public surface is unchanged — the alternative was two definitions of the same
 * value object, which AGENTS.md §17.3 forbids.
 */

export const Theme = {
  System: 'SYSTEM',
  Light: 'LIGHT',
  Dark: 'DARK',
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];

/**
 * User preference for optical throughput.
 *
 * A preference, not a frame rate: the mapping from preference to actual timing
 * belongs to the transport layer.
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

/** User preferences. Immutable; changing one produces a new value. */
export interface Settings {
  readonly theme: Theme;
  /** BCP 47 tag, or `undefined` to follow the device. */
  readonly language: string | undefined;
  readonly qrSpeed: QRSpeedPreference;
  readonly performanceMode: PerformanceMode;
  readonly storage: StoragePreferences;
}

/** Structural equality. Settings are flat enough that this stays exhaustive. */
export function settingsEquals(left: Settings, right: Settings): boolean {
  return (
    left.theme === right.theme &&
    left.language === right.language &&
    left.qrSpeed === right.qrSpeed &&
    left.performanceMode === right.performanceMode &&
    left.storage.downloadDirectory === right.storage.downloadDirectory &&
    left.storage.keepReceivedFiles === right.storage.keepReceivedFiles
  );
}
