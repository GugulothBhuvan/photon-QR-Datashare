/**
 * Application state shape (ARC-004).
 *
 * The members are specified in docs/ARCHITECTURE.md §6.6.
 *
 * Invariant §6.14.4: protocol state SHALL NOT be duplicated here. That is why
 * `activeSessionId` and `activeTransferId` are identifiers rather than session
 * or transfer objects — application state *references* protocol state, and the
 * protocol engine remains its single owner.
 */
import type { SessionId, TransferId, TransferProgress } from '@domain/index';

export type { TransferProgress } from '@domain/index';

/** Coarse lifecycle phase, from docs/ARCHITECTURE.md §6.13. */
export const AppPhase = {
  Initializing: 'INITIALIZING',
  Idle: 'IDLE',
  Transferring: 'TRANSFERRING',
  Background: 'BACKGROUND',
} as const;

export type AppPhase = (typeof AppPhase)[keyof typeof AppPhase];

/** Device conditions the UI reacts to (docs/ARCHITECTURE.md §6.6, "Device Status"). */
export interface DeviceStatus {
  readonly cameraAvailable: boolean;
  readonly cameraPermissionGranted: boolean;
  readonly storageAvailable: boolean;
}

export interface AppState {
  readonly phase: AppPhase;
  /** Current route. Owned by navigation; mirrored for non-UI consumers. */
  readonly currentScreen: string | undefined;
  readonly activeSessionId: SessionId | undefined;
  readonly activeTransferId: TransferId | undefined;
  readonly progress: TransferProgress | undefined;
  readonly deviceStatus: DeviceStatus;
}

export const initialAppState: AppState = Object.freeze({
  phase: AppPhase.Initializing,
  currentScreen: undefined,
  activeSessionId: undefined,
  activeTransferId: undefined,
  progress: undefined,
  deviceStatus: Object.freeze({
    cameraAvailable: false,
    cameraPermissionGranted: false,
    storageAvailable: false,
  }),
});
