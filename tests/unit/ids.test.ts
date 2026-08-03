/**
 * Identifiers — PROTOCOL_SPEC §3.4, §3.29, §8.5, §10.15.5; PACKET_SPEC §3, §5.
 *
 * Identifiers are UUID-based value types: the domain model matches what the
 * wire format can carry, so an id that cannot be serialized cannot be built.
 */
import { AppError } from '@core/errors';
import {
  fileId,
  isUuid,
  MAX_PROTOCOL_VERSION,
  NIL_UUID,
  protocolVersion,
  sessionId,
  transferId,
} from '@domain/ids';

const UUID = '0f9e8d7c-6b5a-4938-8271-605f4e3d2c1b';

describe('identifier factories', () => {
  it('carry a UUID through unchanged', () => {
    expect(sessionId(UUID)).toBe(UUID);
    expect(transferId(UUID)).toBe(UUID);
    expect(fileId(UUID)).toBe(UUID);
  });

  it('normalise case, so one UUID is one identifier', () => {
    // Session isolation (§8.11) is enforced by comparing these; two spellings
    // of the same id must not read as two sessions.
    expect(sessionId(UUID.toUpperCase())).toBe(UUID);
  });

  it('accept the nil UUID, which the wire format uses for "no file"', () => {
    expect(fileId(NIL_UUID)).toBe(NIL_UUID);
  });

  it.each([
    ['sessionId', sessionId],
    ['transferId', transferId],
    ['fileId', fileId],
  ])('%s rejects anything that is not a UUID', (_label, factory) => {
    // PACKET_SPEC §5 gives each id field 16 bytes, so these could never be
    // put on the wire. The failure happens here, where the mistake is.
    expect(() => factory('')).toThrow(AppError);
    expect(() => factory('   ')).toThrow(AppError);
    expect(() => factory('session-1')).toThrow(AppError);
    expect(() => factory('0f9e8d7c-6b5a-4938-8271')).toThrow(AppError);
    expect(() => factory('0f9e8d7c6b5a49388271605f4e3d2c1b')).toThrow(AppError);
    expect(() => factory('0f9e8d7c-6b5a-4938-8271-605f4e3d2c1g')).toThrow(AppError);
  });

  it('accepts any UUID version — the protocol needs 16 unique bytes, not a version', () => {
    expect(isUuid('00000000-0000-1000-8000-000000000000')).toBe(true);
    expect(isUuid('00000000-0000-7000-b000-000000000000')).toBe(true);
  });

  describe('protocolVersion', () => {
    it('accepts the range the one-byte header field can carry', () => {
      expect(protocolVersion(0)).toBe(0);
      expect(protocolVersion(1)).toBe(1);
      expect(protocolVersion(MAX_PROTOCOL_VERSION)).toBe(255);
    });

    it.each([-1, 256, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p', (value) => {
      expect(() => protocolVersion(value)).toThrow(AppError);
    });
  });

  it('keeps identifier kinds distinct at compile time', () => {
    // The compiler is the real assertion: uncommenting the line below is a
    // type error, which is the point of branding (§8.11 forbids cross-session
    // packet mixing).
    //   const wrong: SessionId = fileId(UUID);
    const session = sessionId(UUID);
    const file = fileId(UUID);

    // Identical strings, different types.
    expect(String(session)).toBe(String(file));
  });
});
