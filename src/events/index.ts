/**
 * events/ — Shared layer
 *
 * Owns: Typed event bus and event contracts used for cross-layer
 * communication (ARC-002).
 *
 * May depend on:
 *   - Domain models (@domain/*)
 *   - Shared error model (@core/errors)
 *
 * Must NOT depend on:
 *   - UI
 *   - Services
 *   - Adapters
 *
 * Event set: docs/API_SPEC.md §11 and docs/ARCHITECTURE.md §6.9.
 * Authority: planning/DEPENDENCIES.md and docs/ARCHITECTURE.md.
 */

export {
  createEventBus,
  type EventBus,
  type EventBusOptions,
  type EventHandler,
  type SubscriberErrorHandler,
  type Unsubscribe,
} from './eventBus';

export {
  AppEvent,
  type AppEventMap,
  type PacketGeneratedPayload,
  type PacketValidatedPayload,
  type SessionCreatedPayload,
  type SessionExpiredPayload,
  type SessionId,
  type TransferCompletedPayload,
  type TransferFailedPayload,
  type TransferId,
  type TransferPausedPayload,
  type TransferStartedPayload,
} from './eventTypes';
