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
