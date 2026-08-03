/**
 * Structured logging.
 *
 * AGENTS.md §12 forbids logging sensitive file contents, and docs/SECURITY.md
 * owns the full rule set. This logger is built so that obeying it is the
 * default rather than a habit: binary payloads are replaced with a description
 * of their size, and known-sensitive keys are redacted, before any sink runs.
 *
 * Sinks are injected. Nothing here writes to a console on its own.
 */

export const LogLevel = {
  Debug: 10,
  Info: 20,
  Warn: 30,
  Error: 40,
  Silent: 100,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export type LogContext = Readonly<Record<string, unknown>>;

export interface LogRecord {
  readonly level: LogLevel;
  readonly levelName: string;
  readonly scope: string;
  readonly message: string;
  readonly context: LogContext | undefined;
  /** Milliseconds since epoch, from the injected clock. */
  readonly timestamp: number;
}

/** Destination for log records. */
export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Derives a logger that tags every record with a nested scope. */
  child(scope: string): Logger;
}

export interface LoggerOptions {
  /** Records below this level are dropped. Defaults to `Info`. */
  readonly level?: LogLevel;
  /** Where records go. Defaults to none, which makes the logger inert. */
  readonly sinks?: readonly LogSink[];
  /** Injected for determinism in tests. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Extra context keys to redact, beyond the built-in list. */
  readonly redactKeys?: readonly string[];
}

const LEVEL_NAMES: Readonly<Record<LogLevel, string>> = Object.freeze({
  [LogLevel.Debug]: 'DEBUG',
  [LogLevel.Info]: 'INFO',
  [LogLevel.Warn]: 'WARN',
  [LogLevel.Error]: 'ERROR',
  [LogLevel.Silent]: 'SILENT',
});

/**
 * Context keys never written to a sink.
 *
 * Matching is case-insensitive and substring-based, so `fileData`,
 * `packetPayload` and `sessionKey` are all caught.
 */
const REDACTED_KEY_FRAGMENTS: readonly string[] = [
  'payload',
  'content',
  'data',
  'bytes',
  'buffer',
  'key',
  'secret',
  'token',
  'password',
];

const REDACTED = '[redacted]';

/** Values above this length are truncated rather than logged whole. */
const MAX_STRING_LENGTH = 256;

function isBinary(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value);
}

/**
 * Removes anything that must not reach a sink.
 *
 * Binary values are described, not serialized — the size of a payload is
 * useful for diagnosis, and its bytes never are.
 */
function sanitize(value: unknown, redactFragments: readonly string[], depth = 0): unknown {
  if (isBinary(value)) {
    return `[binary ${value.byteLength} bytes]`;
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}… (${value.length} chars)`
      : value;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Guard against deep or cyclic structures reaching a sink.
  if (depth >= 4) {
    return '[nested]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, redactFragments, depth + 1));
  }

  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    const lowered = key.toLowerCase();
    result[key] = redactFragments.some((fragment) => lowered.includes(fragment))
      ? REDACTED
      : sanitize(item, redactFragments, depth + 1);
  }

  return result;
}

/**
 * Creates a logger.
 *
 * Constructed once in the composition root and injected. A module that wants
 * to log receives a logger; it does not import a global one.
 */
export function createLogger(scope: string, options: LoggerOptions = {}): Logger {
  const level = options.level ?? LogLevel.Info;
  const sinks = options.sinks ?? [];
  const now = options.now ?? Date.now;
  const redactFragments = [
    ...REDACTED_KEY_FRAGMENTS,
    ...(options.redactKeys ?? []).map((key) => key.toLowerCase()),
  ];

  function write(recordLevel: LogLevel, message: string, context?: LogContext): void {
    if (recordLevel < level || sinks.length === 0) {
      return;
    }

    const record: LogRecord = Object.freeze({
      level: recordLevel,
      levelName: LEVEL_NAMES[recordLevel],
      scope,
      message,
      context:
        context === undefined ? undefined : (sanitize(context, redactFragments) as LogContext),
      timestamp: now(),
    });

    for (const sink of sinks) {
      sink(record);
    }
  }

  return {
    debug: (message, context) => write(LogLevel.Debug, message, context),
    info: (message, context) => write(LogLevel.Info, message, context),
    warn: (message, context) => write(LogLevel.Warn, message, context),
    error: (message, context) => write(LogLevel.Error, message, context),
    child: (childScope) => createLogger(`${scope}:${childScope}`, options),
  };
}

/** Sink that writes to the console. Intended for development builds only. */
export const consoleSink: LogSink = (record) => {
  const line = `[${record.levelName}] ${record.scope}: ${record.message}`;
  const context = record.context ?? '';

  if (record.level >= LogLevel.Error) {
    console.error(line, context);
  } else if (record.level >= LogLevel.Warn) {
    console.warn(line, context);
  } else {
    // eslint-disable-next-line no-console -- this sink exists to reach the console
    console.log(line, context);
  }
};
