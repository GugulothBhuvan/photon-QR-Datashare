/**
 * core/ — Core Protocol layer
 *
 * Pure, deterministic implementation of the transfer protocol: sessions,
 * manifests, packets, resume and recovery.
 *
 * Owns the error model. Errors are a protocol concern — a standardized code is
 * part of the contract every layer answers with (docs/API_SPEC.md §12) — so it
 * sits at the bottom of the graph and utilities depend on Core, not the
 * reverse.
 *
 * Purpose, ownership, dependency rules and public exports: see ./README.md.
 * Behaviour is defined by docs/PROTOCOL_SPEC.md and docs/PACKET_SPEC.md.
 */

export { AppError, ErrorCategory, ErrorCode, toUserMessage, type AppErrorOptions } from './errors';
