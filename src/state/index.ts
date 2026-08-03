/**
 * state/ — State layer
 *
 * Owns: Observable application state stores and their selectors (ARC-004).
 *
 * May depend on:
 *   - Domain models (@domain/*)
 *   - Event contracts (@events/*)
 *
 * Must NOT depend on:
 *   - Screens
 *   - Navigation
 *   - Adapters
 *
 * Protocol state is referenced, never duplicated
 * (docs/ARCHITECTURE.md §6.6, invariant §6.14.4).
 *
 * Authority: planning/DEPENDENCIES.md and docs/ARCHITECTURE.md.
 */

export {
  AppPhase,
  initialAppState,
  type AppState,
  type DeviceStatus,
  type TransferProgress,
} from './appState';

export {
  createStore,
  type Listener,
  type Selector,
  type Store,
  type Unsubscribe,
  type Updater,
} from './store';
