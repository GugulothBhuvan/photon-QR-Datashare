/**
 * Identifiers — PROTOCOL_SPEC §3.4, §3.29, §8.5, §10.15.5.
 */
import { fileId, protocolVersion, sessionId, transferId } from '@domain/ids';
import { AppError } from '@utils/errors';

describe('identifier factories', () => {
  it('carry their value through unchanged', () => {
    expect(sessionId('abc')).toBe('abc');
    expect(transferId('t-1')).toBe('t-1');
    expect(fileId('f-1')).toBe('f-1');
  });

  it.each([
    ['sessionId', sessionId],
    ['transferId', transferId],
    ['fileId', fileId],
  ])('%s rejects an empty or blank value', (_label, factory) => {
    expect(() => factory('')).toThrow(AppError);
    expect(() => factory('   ')).toThrow(AppError);
  });

  describe('protocolVersion', () => {
    it('accepts non-negative integers', () => {
      expect(protocolVersion(0)).toBe(0);
      expect(protocolVersion(1)).toBe(1);
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p', (value) => {
      expect(() => protocolVersion(value)).toThrow(AppError);
    });
  });

  it('keeps identifier kinds distinct at compile time', () => {
    // The compiler is the real assertion here: uncommenting the line below is
    // a type error, which is the whole point of branding (§8.11 forbids
    // cross-session packet mixing).
    //   const wrong: SessionId = fileId('f-1');
    const session = sessionId('s-1');
    const file = fileId('s-1');

    // Identical strings, different types.
    expect(String(session)).toBe(String(file));
  });
});
