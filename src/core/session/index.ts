/**
 * session/ — Session management (PRO-001)
 *
 * Implements docs/PROTOCOL_SPEC.md §7.4 and §8: session creation, lifecycle,
 * timeout, expiration, isolation and termination.
 *
 * Transport-agnostic and deterministic. The clock and the id generator are
 * injected; nothing here schedules, publishes events or persists.
 */

export {
  createSessionManager,
  DEFAULT_SESSION_TIMEOUT_MS,
  TransitionRefusal,
  type CreateSessionOptions,
  type SessionManager,
  type SessionManagerOptions,
  type TransitionResult,
} from './sessionManager';

export { allowedTransitions, canTransition, isActive, isLive, isTerminal } from './transitions';
