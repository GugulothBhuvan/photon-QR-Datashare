/**
 * utils/ — Shared layer
 *
 * Owns: Pure helper functions. Deterministic, side-effect free.
 *
 * May depend on:
 *   - Core (@core/errors), for the standardized error model
 *
 * Must NOT depend on:
 *   - Every other module
 *
 * Authority: planning/DEPENDENCIES.md and docs/ARCHITECTURE.md.
 * Placeholder barrel — the error model moved to @core/errors.
 */

export { bytesToHex, isHex } from './hex';
