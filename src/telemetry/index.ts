/**
 * telemetry/ — Shared layer
 *
 * Owns: Structured logging, metrics and diagnostics. Never records file
 * contents (AGENTS.md §12; docs/SECURITY.md owns the full rule set).
 *
 * May depend on:
 *   - Constants (@constants/*)
 *   - Utilities (@utils/*)
 *
 * Must NOT depend on:
 *   - Core protocol
 *   - UI
 *
 * Authority: planning/DEPENDENCIES.md and docs/ARCHITECTURE.md.
 */

export {
  consoleSink,
  createLogger,
  LogLevel,
  type LogContext,
  type Logger,
  type LoggerOptions,
  type LogRecord,
  type LogSink,
} from './logger';
