/**
 * Logger — diagnostics for the protocol engine.
 *
 * A narrower interface than the application logger in `src/telemetry`, which
 * the engine may not import (the boundary rule blocks `core -> telemetry`).
 * The composition root adapts one to the other.
 *
 * AGENTS.md §12 forbids logging file contents. Nothing in the engine passes
 * payload bytes to this interface, and the telemetry implementation redacts
 * them regardless.
 */

/** Structured diagnostic context. Never contains payload bytes. */
export type LogContext = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

/**
 * A logger that discards everything.
 *
 * The default for a manager given none, so that logging is never a reason for
 * the engine to fail and tests stay silent without arranging a sink.
 */
export type ProtocolLogger = Logger;
