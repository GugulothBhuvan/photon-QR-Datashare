/**
 * Settings controller (UI-007) — UI_SPEC §5.6; ARCHITECTURE §6.12.
 *
 * Owns user preferences: reading them, changing one at a time, and persisting
 * them through a repository.
 *
 * §6.12 draws the line this controller respects — the application layer owns
 * theme, language, QR speed, performance mode and storage preferences, while
 * *protocol* configuration stays inside the protocol engine. Nothing here can
 * change a packet size or an error correction level for the protocol's own
 * purposes; `qrSpeed` is a user preference that the transport interprets.
 */
import { withConfig, type AppConfig } from '@config/appConfig';
import type { ValueRepository } from '@repositories/repository';
import { createStore, type Store } from '@state/store';

import type { PerformanceMode, QRSpeedPreference, Theme } from '@domain/settings';

export interface SettingsState {
  readonly settings: AppConfig;
  /** True while the stored value is being loaded (§16). */
  readonly loading: boolean;
  readonly errorMessage: string | undefined;
}

export interface SettingsController {
  readonly state: Store<SettingsState>;

  /** Loads persisted preferences. */
  load(): Promise<void>;

  setTheme(theme: Theme): Promise<void>;
  setLanguage(language: string | undefined): Promise<void>;
  setQrSpeed(speed: QRSpeedPreference): Promise<void>;
  setPerformanceMode(mode: PerformanceMode): Promise<void>;
  setKeepReceivedFiles(keep: boolean): Promise<void>;
  setDownloadDirectory(directory: string | undefined): Promise<void>;

  /** Restores every preference to its default. */
  reset(): Promise<void>;
}

export interface SettingsControllerOptions {
  readonly repository: ValueRepository<AppConfig>;
  readonly defaults: AppConfig;
  readonly toUserMessage: (error: unknown) => string;
}

export function createSettingsController(options: SettingsControllerOptions): SettingsController {
  const { repository, defaults, toUserMessage } = options;

  const state = createStore<SettingsState>({
    settings: defaults,
    loading: false,
    errorMessage: undefined,
  });

  /**
   * Applies a change, then persists it.
   *
   * The state updates first so the UI responds immediately (§9), and a failed
   * write surfaces as a message rather than reverting the control under the
   * user's finger.
   */
  async function apply(changes: Partial<AppConfig>): Promise<void> {
    let next: AppConfig;

    try {
      next = withConfig(state.getState().settings, changes);
    } catch (error: unknown) {
      state.setState((previous) => ({ ...previous, errorMessage: toUserMessage(error) }));
      return;
    }

    state.setState((previous) => ({ ...previous, settings: next, errorMessage: undefined }));

    try {
      await repository.set(next);
    } catch (error: unknown) {
      state.setState((previous) => ({ ...previous, errorMessage: toUserMessage(error) }));
    }
  }

  return {
    state,

    async load() {
      state.setState((previous) => ({ ...previous, loading: true }));

      try {
        const stored = await repository.get();
        state.setState((previous) => ({ ...previous, settings: stored, loading: false }));
      } catch (error: unknown) {
        // A corrupt stored value must not prevent the app starting — fall back
        // to defaults and say so.
        state.setState((previous) => ({
          ...previous,
          settings: defaults,
          loading: false,
          errorMessage: toUserMessage(error),
        }));
      }
    },

    setTheme: (theme) => apply({ theme }),
    setLanguage: (language) => apply({ language }),
    setQrSpeed: (qrSpeed) => apply({ qrSpeed }),
    setPerformanceMode: (performanceMode) => apply({ performanceMode }),

    setKeepReceivedFiles(keep) {
      return apply({
        storage: { ...state.getState().settings.storage, keepReceivedFiles: keep },
      });
    },

    setDownloadDirectory(directory) {
      return apply({
        storage: { ...state.getState().settings.storage, downloadDirectory: directory },
      });
    },

    async reset() {
      state.setState((previous) => ({ ...previous, settings: defaults, errorMessage: undefined }));
      await repository.clear();
    },
  };
}
