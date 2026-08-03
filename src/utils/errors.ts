/**
 * Shared error model.
 *
 * Implements docs/API_SPEC.md §12 (standardized error codes, no platform
 * exceptions across API boundaries) and docs/ARCHITECTURE.md §6.11 (error
 * categories, only user-safe representations reach the Presentation Layer).
 *
 * This lives in `utils` because every layer — including adapters, which may not
 * import `core` — must be able to raise and classify errors. It is a leaf
 * module and depends on nothing.
 */

/**
 * Error categories, from docs/ARCHITECTURE.md §6.11.
 */
export const ErrorCategory = {
  /** Caused by user action; recoverable by the user. */
  User: 'USER',
  /** Device, OS or permission failure. */
  Platform: 'PLATFORM',
  /** Protocol rule violation or malformed protocol data. */
  Protocol: 'PROTOCOL',
  /** Persistence failure. */
  Storage: 'STORAGE',
} as const;

export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory];

/**
 * Standardized error codes.
 *
 * The first group is specified in docs/API_SPEC.md §12, which presents them as
 * examples rather than an exhaustive list. The second group covers
 * infrastructure introduced in Phase 1 and is additive only — no code here
 * redefines protocol behaviour.
 */
export const ErrorCode = {
  // docs/API_SPEC.md §12
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  INVALID_PACKET: 'INVALID_PACKET',
  STORAGE_ERROR: 'STORAGE_ERROR',
  CAMERA_ERROR: 'CAMERA_ERROR',
  TRANSFER_FAILED: 'TRANSFER_FAILED',

  // Phase 1 infrastructure
  DEPENDENCY_NOT_REGISTERED: 'DEPENDENCY_NOT_REGISTERED',
  DEPENDENCY_CYCLE: 'DEPENDENCY_CYCLE',
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  EVENT_HANDLER_FAILED: 'EVENT_HANDLER_FAILED',
  NOT_FOUND: 'NOT_FOUND',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Default category for each code, so callers cannot mis-classify. */
const CATEGORY_BY_CODE: Readonly<Record<ErrorCode, ErrorCategory>> = Object.freeze({
  SESSION_NOT_FOUND: ErrorCategory.Protocol,
  INVALID_PACKET: ErrorCategory.Protocol,
  STORAGE_ERROR: ErrorCategory.Storage,
  CAMERA_ERROR: ErrorCategory.Platform,
  TRANSFER_FAILED: ErrorCategory.Protocol,
  DEPENDENCY_NOT_REGISTERED: ErrorCategory.Platform,
  DEPENDENCY_CYCLE: ErrorCategory.Platform,
  INVALID_CONFIGURATION: ErrorCategory.Platform,
  EVENT_HANDLER_FAILED: ErrorCategory.Platform,
  NOT_FOUND: ErrorCategory.Storage,
});

/**
 * Presentation-safe messages.
 *
 * docs/ARCHITECTURE.md §6.11 requires that protocol internals stay
 * encapsulated, so these deliberately say nothing about packets, sessions
 * internals or storage paths.
 */
const USER_MESSAGE_BY_CODE: Readonly<Record<ErrorCode, string>> = Object.freeze({
  SESSION_NOT_FOUND: 'This transfer is no longer available.',
  INVALID_PACKET: 'Some data could not be read. Keep the cameras steady.',
  STORAGE_ERROR: 'The file could not be saved.',
  CAMERA_ERROR: 'The camera is unavailable.',
  TRANSFER_FAILED: 'The transfer could not be completed.',
  DEPENDENCY_NOT_REGISTERED: 'Something went wrong. Please restart the app.',
  DEPENDENCY_CYCLE: 'Something went wrong. Please restart the app.',
  INVALID_CONFIGURATION: 'Something went wrong. Please restart the app.',
  EVENT_HANDLER_FAILED: 'Something went wrong. Please restart the app.',
  NOT_FOUND: 'The requested item could not be found.',
});

export interface AppErrorOptions {
  /** Diagnostic detail. Never rendered to the user; never include file bytes. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** The originating error, if this wraps one. */
  readonly cause?: unknown;
  /** Overrides the default presentation-safe message for this code. */
  readonly userMessage?: string;
  /** Overrides the default category for this code. */
  readonly category?: ErrorCategory;
}

/**
 * The only error type that crosses a module boundary.
 *
 * Platform exceptions are wrapped with {@link AppError.wrap} at the adapter
 * edge so that no SDK-specific exception ever escapes (docs/API_SPEC.md §12).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  /** Safe to display. See docs/ARCHITECTURE.md §6.11. */
  readonly userMessage: string;
  readonly details: Readonly<Record<string, unknown>> | undefined;
  override readonly cause: unknown;

  constructor(code: ErrorCode, message?: string, options: AppErrorOptions = {}) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.category = options.category ?? CATEGORY_BY_CODE[code];
    this.userMessage = options.userMessage ?? USER_MESSAGE_BY_CODE[code];
    this.details = options.details;
    this.cause = options.cause;

    // Preserve the prototype chain when compiled to older targets.
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /** Type guard usable across module boundaries. */
  static is(value: unknown): value is AppError {
    return value instanceof AppError;
  }

  /**
   * Converts an unknown thrown value into an `AppError`.
   *
   * Adapters call this so that platform exceptions never cross an API
   * boundary. An existing `AppError` passes through unchanged.
   */
  static wrap(value: unknown, code: ErrorCode, options: AppErrorOptions = {}): AppError {
    if (AppError.is(value)) {
      return value;
    }

    const message = value instanceof Error ? value.message : String(value);
    return new AppError(code, message, { ...options, cause: value });
  }

  /** Structured form for logging. Excludes `cause` to avoid leaking payloads. */
  toJSON(): Readonly<Record<string, unknown>> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

/**
 * Reduces any thrown value to something safe to show a user.
 *
 * The Presentation Layer calls this and nothing else; it never inspects an
 * error's code, category or details.
 */
export function toUserMessage(value: unknown): string {
  return AppError.is(value) ? value.userMessage : 'Something went wrong.';
}
