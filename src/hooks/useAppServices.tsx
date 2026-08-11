/**
 * Application services provider.
 *
 * Carries the wired object graph — controllers and services — to the component
 * tree. The graph itself is built by the composition root; this only makes it
 * reachable from a screen.
 *
 * Why a context rather than module-level singletons: a test renders a screen
 * with its own graph, and two tests never share state. Singletons would make
 * that impossible and would reintroduce the global mutable state AGENTS.md §6
 * asks us to avoid.
 */
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

import type { ReceiveController } from '@controllers/receiveController';
import type { SendController } from '@controllers/sendController';
import type { SettingsController } from '@controllers/settingsController';
import type { Store } from '@state/store';
import type { TransferRecord } from '@domain/history';

/** Everything a screen may reach. Controllers only — never a service directly. */
export interface AppServices {
  readonly send: SendController;
  readonly receive: ReceiveController;
  readonly settings: SettingsController;
  /**
   * The application's notion of now.
   *
   * A bare function rather than the `Clock` contract, because the UI layer may
   * not import from the core — and because a screen needs the reading, not the
   * abstraction. Present so §5.4's elapsed time comes from the same clock the
   * protocol uses and a test can control it.
   */
  readonly now: () => number;
  /**
   * The live camera preview, when the platform has a real camera.
   *
   * An opaque component rather than anything camera-shaped: the UI may not
   * import the adapter layer, so the composition root hands it a component it
   * can render without knowing what is inside (ADR-0005).
   */
  readonly cameraPreview?: ComponentType;
  /** Why there is no camera preview, when there is none. */
  readonly cameraUnavailableReason?: string;
  /**
   * Failures reported by a camera that did load.
   *
   * A store rather than a value, because the failure arrives after the screen
   * has mounted — a camera that loads and then cannot start is exactly the
   * case a static reason cannot describe.
   */
  readonly cameraErrors?: Store<string | undefined>;
  /** Opens the platform file picker (A12-02). Empty when cancelled. */
  readonly pickFiles: () => Promise<readonly { name: string; content: Uint8Array }[]>;
  /** Saves a received file, returning where it was written. */
  readonly saveFile: (name: string, bytes: Uint8Array, directoryUri?: string) => Promise<string>;
  /** Asks the user for a download folder (§5.6). `undefined` if cancelled. */
  readonly pickDirectory: () => Promise<string | undefined>;
  /** Holds the screen awake, bright and unrotated (QR_SPEC §11). Returns the undo. */
  readonly beginTransferDisplay?: () => () => void;
  /** Records a finished transfer (A12-03, ADR-0007). */
  readonly recordTransfer: (record: TransferRecord) => Promise<void>;
  /** Finished transfers, newest first (ADR-0007). */
  readonly recentTransfers: () => Promise<readonly TransferRecord[]>;
  /** What the platform provided, and why anything missing is missing. */
  readonly diagnostics?: readonly { readonly name: string; readonly status: string }[];
}

const AppServicesContext = createContext<AppServices | undefined>(undefined);

export interface AppServicesProviderProps {
  readonly services: AppServices;
  readonly children: ReactNode;
}

export function AppServicesProvider({ services, children }: AppServicesProviderProps) {
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}

/**
 * The wired controllers.
 *
 * Throws when no provider is present, rather than returning `undefined` for
 * every screen to guard against. A missing provider is a wiring mistake that
 * should fail loudly at the first render, not silently produce a dead screen.
 */
export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);

  if (services === undefined) {
    throw new Error('useAppServices must be used within an AppServicesProvider.');
  }

  return services;
}
