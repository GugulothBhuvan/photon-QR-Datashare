/**
 * utils/ — Shared layer
 *
 * Owns: Pure helper functions and the shared error model. Deterministic,
 * side-effect free, dependency free.
 *
 * May depend on:
 *   - Nothing
 *
 * Must NOT depend on:
 *   - Every other module
 *
 * The error model lives here rather than in a layer because every layer —
 * including adapters, which may not import core — must be able to raise and
 * classify errors.
 *
 * Authority: planning/DEPENDENCIES.md and docs/ARCHITECTURE.md.
 */

export { AppError, ErrorCategory, ErrorCode, toUserMessage, type AppErrorOptions } from './errors';
