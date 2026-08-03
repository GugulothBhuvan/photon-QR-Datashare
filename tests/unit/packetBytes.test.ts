/**
 * Binary primitives — PACKET_SPEC §3.
 */
import { AppError } from '@core/errors';
import {
  bytesToUuid,
  ByteReader,
  ByteWriter,
  isUuid,
  NIL_UUID,
  uuidToBytes,
} from '@core/packet/bytes';

const UUID = '0f9e8d7c-6b5a-4938-8271-605f4e3d2c1b';

describe('big-endian encoding (§3)', () => {
  it('writes UInt16 most significant byte first', () => {
    const buffer = new Uint8Array(2);
    new ByteWriter(buffer).uint16(0x4f53);

    expect(Array.from(buffer)).toEqual([0x4f, 0x53]);
  });

  it('writes UInt32 most significant byte first', () => {
    const buffer = new Uint8Array(4);
    new ByteWriter(buffer).uint32(0x01020304);

    expect(Array.from(buffer)).toEqual([0x01, 0x02, 0x03, 0x04]);
  });

  it('round-trips every integer width', () => {
    const buffer = new Uint8Array(7);
    new ByteWriter(buffer).uint8(0xab).uint16(0xcdef).uint32(0x12345678);

    const reader = new ByteReader(buffer);
    expect(reader.uint8()).toBe(0xab);
    expect(reader.uint16()).toBe(0xcdef);
    expect(reader.uint32()).toBe(0x12345678);
  });

  it('reads back the maximum value of each width', () => {
    const buffer = new Uint8Array(7);
    new ByteWriter(buffer).uint8(0xff).uint16(0xffff).uint32(0xffffffff);

    const reader = new ByteReader(buffer);
    expect(reader.uint8()).toBe(0xff);
    expect(reader.uint16()).toBe(0xffff);
    expect(reader.uint32()).toBe(0xffffffff);
  });
});

describe('ByteWriter', () => {
  it.each([
    ['uint8', 0x100],
    ['uint16', 0x10000],
    ['uint32', 0x100000000],
  ])('rejects a value too large for %s', (method, value) => {
    const writer = new ByteWriter(new Uint8Array(8));
    expect(() =>
      (writer as unknown as Record<string, (v: number) => void>)[method]?.(value),
    ).toThrow(AppError);
  });

  it('rejects a negative value', () => {
    expect(() => new ByteWriter(new Uint8Array(4)).uint32(-1)).toThrow(AppError);
  });

  it('refuses to write past the end of the buffer', () => {
    const writer = new ByteWriter(new Uint8Array(2));
    writer.uint16(1);

    expect(() => writer.uint8(1)).toThrow(AppError);
  });

  it('tracks how many bytes it has written', () => {
    const writer = new ByteWriter(new Uint8Array(8));
    writer.uint8(1).uint32(2);

    expect(writer.offset).toBe(5);
  });
});

describe('ByteReader', () => {
  it('refuses to read past the end of the buffer', () => {
    const reader = new ByteReader(new Uint8Array(2));
    reader.uint16();

    expect(() => reader.uint8()).toThrow(AppError);
  });

  it('reports remaining bytes', () => {
    const reader = new ByteReader(new Uint8Array(10));
    reader.uint32();

    expect(reader.remaining).toBe(6);
  });

  it('returns a copy from bytes(), not a view', () => {
    const buffer = new Uint8Array([1, 2, 3, 4]);
    const slice = new ByteReader(buffer).bytes(4);

    slice[0] = 99;

    expect(buffer[0]).toBe(1);
  });
});

describe('UUID conversion (§3: 16 bytes)', () => {
  it('encodes to exactly 16 bytes', () => {
    expect(uuidToBytes(UUID).byteLength).toBe(16);
  });

  it('round-trips through bytes', () => {
    expect(bytesToUuid(uuidToBytes(UUID))).toBe(UUID);
  });

  it('preserves byte order', () => {
    expect(Array.from(uuidToBytes(UUID).slice(0, 4))).toEqual([0x0f, 0x9e, 0x8d, 0x7c]);
  });

  it('normalises to lowercase', () => {
    expect(bytesToUuid(uuidToBytes(UUID.toUpperCase()))).toBe(UUID);
  });

  it('round-trips the nil UUID, which marks "no file"', () => {
    const bytes = uuidToBytes(NIL_UUID);

    expect(Array.from(bytes).every((byte) => byte === 0)).toBe(true);
    expect(bytesToUuid(bytes)).toBe(NIL_UUID);
  });

  it.each([
    ['an arbitrary string', 'session-1'],
    ['a truncated uuid', '0f9e8d7c-6b5a-4938-8271'],
    ['a uuid with a bad character', '0f9e8d7c-6b5a-4938-8271-605f4e3d2c1g'],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(isUuid(value)).toBe(false);
    expect(() => uuidToBytes(value)).toThrow(AppError);
  });

  it('rejects reading a UUID from too few bytes', () => {
    expect(() => bytesToUuid(new Uint8Array(8))).toThrow(AppError);
  });
});
