/**
 * resume/ — Resume Protocol (PRO-004)
 *
 * Implements docs/PROTOCOL_SPEC.md §14: eligibility, resume request
 * validation, remaining work, and state restoration.
 *
 * Performs no recovery (§15, PRO-005), no reconstruction, no transport and no
 * serialization.
 */

export {
  createResumeEngine,
  ResumeRefusal,
  type FileRemainder,
  type PreservedParameters,
  type RemainingWork,
  type ResumeAccepted,
  type ResumeEngine,
  type ResumeEngineOptions,
  type ResumeRejected,
  type ResumeResult,
  type ResumeValidationResult,
} from './resumeEngine';
