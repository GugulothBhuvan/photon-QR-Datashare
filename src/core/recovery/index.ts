/**
 * recovery/ — Recovery Protocol (PRO-005)
 *
 * Implements docs/PROTOCOL_SPEC.md §15: missing packet detection, recovery
 * eligibility, recovered packet handling and completion.
 *
 * Independent of resume (§15.12), of transport (§15.14.7) and of
 * reconstruction (§15.3).
 */

export {
  createRecoveryEngine,
  RecoveryAcceptOutcome,
  RecoveryCondition,
  RecoveryRefusal,
  RecoveryStrategy,
  SUPPORTED_STRATEGIES,
  type FileGap,
  type RecoveryAcceptResult,
  type RecoveryEngine,
  type RecoveryEngineOptions,
  type RecoveryStatus,
  type RecoveryValidationResult,
} from './recoveryEngine';
