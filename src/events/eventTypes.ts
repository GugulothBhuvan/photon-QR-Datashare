/**
 * Event contracts.
 *
 * The event set is specified in docs/API_SPEC.md §11 and docs/ARCHITECTURE.md
 * §6.9. Events SHALL remain immutable (API_SPEC §11, §15.5).
 *
 * Payloads are deliberately thin: an event carries identifiers and progress,
 * never protocol internals and never file content. Application state
 * references protocol state rather than duplicating it
 * (docs/ARCHITECTURE.md §6.6, invariant §6.14.4).
 */

/**
 * Every event name in the system.
 *
 * `SessionExpired` comes from docs/ARCHITECTURE.md §6.9; the remainder appear
 * in both that section and docs/API_SPEC.md §11.
 */
export const AppEvent = {
  SessionCreated: 'SessionCreated',
  SessionExpired: 'SessionExpired',
  TransferStarted: 'TransferStarted',
  TransferPaused: 'TransferPaused',
  TransferCompleted: 'TransferCompleted',
  TransferFailed: 'TransferFailed',
  PacketGenerated: 'PacketGenerated',
  PacketValidated: 'PacketValidated',
} as const;

export type AppEvent = (typeof AppEvent)[keyof typeof AppEvent];

/** Opaque identifiers. Concrete branded types arrive with the domain models in Phase 2. */
export type SessionId = string;
export type TransferId = string;

export interface SessionCreatedPayload {
  readonly sessionId: SessionId;
}

export interface SessionExpiredPayload {
  readonly sessionId: SessionId;
}

export interface TransferStartedPayload {
  readonly transferId: TransferId;
  readonly sessionId: SessionId;
}

export interface TransferPausedPayload {
  readonly transferId: TransferId;
}

export interface TransferCompletedPayload {
  readonly transferId: TransferId;
}

export interface TransferFailedPayload {
  readonly transferId: TransferId;
  /** Standardized code from `@utils/errors`. Never a platform exception. */
  readonly code: string;
}

export interface PacketGeneratedPayload {
  readonly sessionId: SessionId;
  readonly sequence: number;
}

export interface PacketValidatedPayload {
  readonly sessionId: SessionId;
  readonly sequence: number;
  readonly valid: boolean;
}

/**
 * Maps each event name to its payload type.
 *
 * Publishing or subscribing with a mismatched payload is a compile error, so
 * the bus needs no runtime type checking.
 */
export interface AppEventMap {
  readonly [AppEvent.SessionCreated]: SessionCreatedPayload;
  readonly [AppEvent.SessionExpired]: SessionExpiredPayload;
  readonly [AppEvent.TransferStarted]: TransferStartedPayload;
  readonly [AppEvent.TransferPaused]: TransferPausedPayload;
  readonly [AppEvent.TransferCompleted]: TransferCompletedPayload;
  readonly [AppEvent.TransferFailed]: TransferFailedPayload;
  readonly [AppEvent.PacketGenerated]: PacketGeneratedPayload;
  readonly [AppEvent.PacketValidated]: PacketValidatedPayload;
}
