/**
 * Error model — docs/API_SPEC.md §12, docs/ARCHITECTURE.md §6.11.
 */
import { AppError, ErrorCategory, ErrorCode, toUserMessage } from '@utils/errors';

describe('AppError', () => {
  it('classifies each code with a default category', () => {
    expect(new AppError(ErrorCode.STORAGE_ERROR).category).toBe(ErrorCategory.Storage);
    expect(new AppError(ErrorCode.CAMERA_ERROR).category).toBe(ErrorCategory.Platform);
    expect(new AppError(ErrorCode.INVALID_PACKET).category).toBe(ErrorCategory.Protocol);
  });

  it('carries a presentation-safe message that hides internals', () => {
    const error = new AppError(
      ErrorCode.INVALID_PACKET,
      'CRC mismatch at sequence 41, expected 0xAB',
    );

    expect(error.message).toContain('CRC mismatch');
    expect(error.userMessage).not.toContain('CRC');
    expect(error.userMessage).not.toContain('41');
  });

  it('is identifiable across module boundaries', () => {
    expect(AppError.is(new AppError(ErrorCode.NOT_FOUND))).toBe(true);
    expect(AppError.is(new Error('plain'))).toBe(false);
    expect(AppError.is('not an error')).toBe(false);
  });

  describe('wrap', () => {
    it('converts a platform exception so it cannot cross a boundary as itself', () => {
      const platform = new TypeError('ENOENT: no such file');
      const wrapped = AppError.wrap(platform, ErrorCode.STORAGE_ERROR);

      expect(AppError.is(wrapped)).toBe(true);
      expect(wrapped.code).toBe(ErrorCode.STORAGE_ERROR);
      expect(wrapped.cause).toBe(platform);
      expect(wrapped.message).toBe('ENOENT: no such file');
    });

    it('converts non-Error throws', () => {
      const wrapped = AppError.wrap('boom', ErrorCode.CAMERA_ERROR);
      expect(wrapped.message).toBe('boom');
    });

    it('passes an existing AppError through unchanged', () => {
      const original = new AppError(ErrorCode.SESSION_NOT_FOUND);
      expect(AppError.wrap(original, ErrorCode.STORAGE_ERROR)).toBe(original);
    });
  });

  it('omits the cause when serialized, so payloads cannot leak into logs', () => {
    const error = new AppError(ErrorCode.STORAGE_ERROR, 'failed', {
      cause: { secretBytes: new Uint8Array([1, 2, 3]) },
      details: { path: 'session.json' },
    });

    const json = error.toJSON();

    expect(json).toEqual({
      name: 'AppError',
      code: ErrorCode.STORAGE_ERROR,
      category: ErrorCategory.Storage,
      message: 'failed',
      details: { path: 'session.json' },
    });
    expect(JSON.stringify(json)).not.toContain('secretBytes');
  });
});

describe('toUserMessage', () => {
  it('returns the safe message for an AppError', () => {
    expect(toUserMessage(new AppError(ErrorCode.CAMERA_ERROR))).toBe('The camera is unavailable.');
  });

  it('does not surface details of an unknown throw', () => {
    expect(toUserMessage(new Error('stack trace with /data/user/0/files'))).toBe(
      'Something went wrong.',
    );
  });
});
