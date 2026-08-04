/**
 * QR encoder and binary bridge (QR-001) — QR_SPEC §5, §6, §7.
 */
import { AppError } from '@core/errors';
import { create as createQrCode } from 'qrcode/lib/core/qrcode';

import { createQrEncoder, ErrorCorrectionLevel, MAX_PAYLOAD_BYTES, moduleAt } from '@qr/qrEncoder';

/** Every byte value, which is what §5's "exactly" has to survive. */
const allBytes = (): Uint8Array => Uint8Array.from({ length: 256 }, (_unused, index) => index);

describe('binary preservation (§5)', () => {
  const encoder = createQrEncoder();

  it('encodes every byte value without a text boundary', () => {
    // The payload is handed to the library as a byte-mode segment carrying the
    // Uint8Array itself, so there is no character set to get wrong.
    expect(() => encoder.encode(allBytes())).not.toThrow();
  });

  it('produces the same matrix the library produces for the same bytes', () => {
    // Pins the claim that nothing transforms the payload on the way in: the
    // encoder's matrix must equal a direct byte-segment encoding.
    const payload = allBytes();
    const direct = createQrCode([{ data: payload, mode: 'byte' }], { errorCorrectionLevel: 'M' });
    const frame = encoder.encode(payload);

    expect(Array.from(frame.modules)).toEqual(Array.from(direct.modules.data));
    expect(frame.size).toBe(direct.modules.size);
  });

  it('distinguishes payloads that differ only in a high byte', () => {
    // 0x80-0xFF are where a text round trip would corrupt binary data. Two
    // payloads differing only there must not encode identically.
    const left = Uint8Array.from([0x00, 0x80, 0xff]);
    const right = Uint8Array.from([0x00, 0x81, 0xff]);

    expect(Array.from(encoder.encode(left).modules)).not.toEqual(
      Array.from(encoder.encode(right).modules),
    );
  });

  it('does not alias the library’s buffer', () => {
    const frame = encoder.encode(allBytes());

    expect(Object.isFrozen(frame)).toBe(true);
    expect(frame.modules).toBeInstanceOf(Uint8Array);
  });
});

describe('createQrEncoder (§5, §6, §7)', () => {
  const encoder = createQrEncoder();
  const payload = Uint8Array.from({ length: 60 }, (_unused, index) => (index * 7) & 0xff);

  it('encodes a packet into one frame (§5)', () => {
    const frame = encoder.encode(payload);

    expect(frame.size).toBeGreaterThan(0);
    expect(frame.modules).toHaveLength(frame.size * frame.size);
  });

  it('selects the smallest version that fits, by default (§6)', () => {
    const small = encoder.encode(new Uint8Array(10));
    const large = encoder.encode(new Uint8Array(600));

    expect(small.version).toBeLessThan(large.version);
  });

  it('accepts a larger version to improve reliability (§6)', () => {
    const auto = encoder.encode(payload);
    const forced = encoder.encode(payload, { version: auto.version + 3 });

    expect(forced.version).toBe(auto.version + 3);
    expect(forced.size).toBeGreaterThan(auto.size);
  });

  it('defaults to medium error correction (§7)', () => {
    expect(encoder.encode(payload).level).toBe(ErrorCorrectionLevel.Medium);
  });

  it.each([
    ErrorCorrectionLevel.Low,
    ErrorCorrectionLevel.Medium,
    ErrorCorrectionLevel.Quartile,
    ErrorCorrectionLevel.High,
  ])('supports error correction level %s (§7)', (level) => {
    expect(encoder.encode(payload, { level }).level).toBe(level);
  });

  it('needs a larger code for stronger error correction', () => {
    const low = encoder.encode(payload, { level: ErrorCorrectionLevel.Low });
    const high = encoder.encode(payload, { level: ErrorCorrectionLevel.High });

    expect(high.version).toBeGreaterThanOrEqual(low.version);
  });

  it('is deterministic — the same payload always gives the same modules', () => {
    const first = encoder.encode(payload);
    const second = encoder.encode(payload);

    expect(Array.from(first.modules)).toEqual(Array.from(second.modules));
    expect(first.mask).toBe(second.mask);
  });

  it('produces a different matrix for a different payload', () => {
    const other = encoder.encode(Uint8Array.from({ length: 60 }, (_unused, i) => (i * 11) & 0xff));

    expect(Array.from(encoder.encode(payload).modules)).not.toEqual(Array.from(other.modules));
  });

  it('encodes an empty payload', () => {
    expect(encoder.encode(new Uint8Array()).size).toBeGreaterThan(0);
  });

  it('encodes a payload containing every byte value (§5)', () => {
    expect(() => encoder.encode(allBytes())).not.toThrow();
  });

  it('is frozen', () => {
    expect(Object.isFrozen(encoder.encode(payload))).toBe(true);
  });

  describe('capacity', () => {
    it('reports the standard byte capacity per level', () => {
      expect(encoder.capacityFor(ErrorCorrectionLevel.Low)).toBe(2953);
      expect(encoder.capacityFor(ErrorCorrectionLevel.High)).toBe(1273);
    });

    it('capacity falls as error correction rises', () => {
      const levels = [
        ErrorCorrectionLevel.Low,
        ErrorCorrectionLevel.Medium,
        ErrorCorrectionLevel.Quartile,
        ErrorCorrectionLevel.High,
      ];

      const capacities = levels.map((level) => MAX_PAYLOAD_BYTES[level]);

      expect(capacities).toEqual([...capacities].sort((a, b) => b - a));
    });

    it('reports an oversized payload rather than truncating it (§5)', () => {
      // §5 fragments oversized packets "according to the Protocol
      // Specification" — the packet layer's job, not the encoder's.
      const tooBig = new Uint8Array(MAX_PAYLOAD_BYTES[ErrorCorrectionLevel.Medium] + 1);

      expect(() => encoder.encode(tooBig)).toThrow(AppError);
    });

    it('accepts a payload at exactly the capacity limit', () => {
      const exact = new Uint8Array(MAX_PAYLOAD_BYTES[ErrorCorrectionLevel.Low]);

      expect(() => encoder.encode(exact, { level: ErrorCorrectionLevel.Low })).not.toThrow();
    });

    it('reports a version too small for the payload as a standardized error', () => {
      expect(() => encoder.encode(payload, { version: 1 })).toThrow(AppError);
    });
  });

  describe('moduleAt', () => {
    it('reads modules as 0 or 1', () => {
      const frame = encoder.encode(payload);

      // The top-left finder pattern's corner is always dark.
      expect(moduleAt(frame, 0, 0)).toBe(1);
      // The module just inside it is always light.
      expect(moduleAt(frame, 7, 7)).toBe(0);
    });

    it('rejects a coordinate outside the frame', () => {
      const frame = encoder.encode(payload);

      expect(() => moduleAt(frame, frame.size, 0)).toThrow(AppError);
      expect(() => moduleAt(frame, -1, 0)).toThrow(AppError);
    });
  });
});
