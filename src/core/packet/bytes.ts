/**
 * Binary primitives (PACKET_SPEC §3).
 *
 * Every multi-byte integer in the protocol is **big endian**, and every width
 * is fixed. These helpers exist so that no other module writes an offset
 * arithmetic expression by hand.
 *
 * `DataView` is used rather than index arithmetic because it makes endianness
 * explicit at every call site and bounds-checks for free.
 */
import { AppError, ErrorCode } from '@core/errors';

/** Field widths from the PACKET_SPEC §3 encoding table. */
export const ByteWidth = {
  UInt8: 1,
  UInt16: 2,
  UInt32: 4,
  UInt64: 8,
  Uuid: 16,
} as const;

export const UINT8_MAX = 0xff;
export const UINT16_MAX = 0xffff;
export const UINT32_MAX = 0xffff_ffff;

/** Canonical all-zero UUID, used where a 16-byte id field has no value. */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a string is a canonical 36-character UUID. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function fail(message: string, details?: Readonly<Record<string, unknown>>): never {
  throw new AppError(ErrorCode.INVALID_PACKET, message, details === undefined ? {} : { details });
}

/**
 * Converts a canonical UUID string to its 16-byte big-endian form (§3).
 *
 * Throws `INVALID_PACKET` for anything that is not a UUID — the wire format
 * has no way to carry an arbitrary identifier in 16 bytes.
 */
export function uuidToBytes(value: string): Uint8Array {
  if (!isUuid(value)) {
    fail(`Identifier "${value}" is not a UUID and cannot be encoded in 16 bytes.`, {
      length: value.length,
    });
  }

  const hex = value.replace(/-/g, '');
  const bytes = new Uint8Array(ByteWidth.Uuid);

  for (let i = 0; i < ByteWidth.Uuid; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

/** Converts 16 bytes to a canonical lowercase UUID string. */
export function bytesToUuid(bytes: Uint8Array, offset = 0): string {
  if (bytes.byteLength < offset + ByteWidth.Uuid) {
    fail('Not enough bytes to read a UUID.', { offset, available: bytes.byteLength });
  }

  let hex = '';
  for (let i = 0; i < ByteWidth.Uuid; i += 1) {
    hex += (bytes[offset + i] as number).toString(16).padStart(2, '0');
  }

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** Sequential big-endian writer over a fixed-size buffer. */
export class ByteWriter {
  private readonly view: DataView;
  private cursor = 0;

  constructor(private readonly buffer: Uint8Array) {
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  /** Bytes written so far. */
  get offset(): number {
    return this.cursor;
  }

  private require(size: number): number {
    if (this.cursor + size > this.buffer.byteLength) {
      fail('Write would exceed the packet buffer.', {
        offset: this.cursor,
        size,
        capacity: this.buffer.byteLength,
      });
    }
    const at = this.cursor;
    this.cursor += size;
    return at;
  }

  uint8(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > UINT8_MAX) {
      fail('Value does not fit in a UInt8.', { value });
    }
    this.view.setUint8(this.require(ByteWidth.UInt8), value);
    return this;
  }

  uint16(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > UINT16_MAX) {
      fail('Value does not fit in a UInt16.', { value });
    }
    this.view.setUint16(this.require(ByteWidth.UInt16), value, false);
    return this;
  }

  uint32(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
      fail('Value does not fit in a UInt32.', { value });
    }
    this.view.setUint32(this.require(ByteWidth.UInt32), value, false);
    return this;
  }

  bytes(value: Uint8Array): this {
    this.buffer.set(value, this.require(value.byteLength));
    return this;
  }

  uuid(value: string): this {
    return this.bytes(uuidToBytes(value));
  }
}

/** Sequential big-endian reader over a buffer. */
export class ByteReader {
  private readonly view: DataView;
  private cursor = 0;

  constructor(private readonly buffer: Uint8Array) {
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  /** Bytes consumed so far. */
  get offset(): number {
    return this.cursor;
  }

  /** Bytes not yet consumed. */
  get remaining(): number {
    return this.buffer.byteLength - this.cursor;
  }

  private require(size: number): number {
    if (this.cursor + size > this.buffer.byteLength) {
      fail('Read would exceed the available bytes.', {
        offset: this.cursor,
        size,
        available: this.buffer.byteLength,
      });
    }
    const at = this.cursor;
    this.cursor += size;
    return at;
  }

  uint8(): number {
    return this.view.getUint8(this.require(ByteWidth.UInt8));
  }

  uint16(): number {
    return this.view.getUint16(this.require(ByteWidth.UInt16), false);
  }

  uint32(): number {
    return this.view.getUint32(this.require(ByteWidth.UInt32), false);
  }

  /** Returns a copy of the next `size` bytes. */
  bytes(size: number): Uint8Array {
    const at = this.require(size);
    return this.buffer.slice(at, at + size);
  }

  uuid(): string {
    const at = this.require(ByteWidth.Uuid);
    return bytesToUuid(this.buffer, at);
  }
}
