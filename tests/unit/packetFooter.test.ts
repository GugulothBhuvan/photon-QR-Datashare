/**
 * Packet footer (PKT-002) and CRC-32 — PACKET_SPEC §6.
 */
import { AppError } from '@core/errors';
import { crc32 } from '@core/packet/crc32';
import {
  createPacketFooter,
  CRC32_SIZE,
  DIGEST_FOOTER,
  footerEquals,
  footerSize,
  FOOTER_SIZE_MINIMAL,
  FOOTER_SIZE_WITH_DIGEST,
  layoutOf,
  MINIMAL_FOOTER,
  SHA256_SIZE,
} from '@core/packet/footer';

const digest = (fill = 7): Uint8Array => new Uint8Array(SHA256_SIZE).fill(fill);

describe('footer sizes (§6)', () => {
  it('reserves 4 bytes for the CRC and 32 for the digest', () => {
    expect(CRC32_SIZE).toBe(4);
    expect(SHA256_SIZE).toBe(32);
  });

  it('is 4 bytes without the optional digest and 36 with it', () => {
    expect(FOOTER_SIZE_MINIMAL).toBe(4);
    expect(FOOTER_SIZE_WITH_DIGEST).toBe(36);
    expect(footerSize(MINIMAL_FOOTER)).toBe(4);
    expect(footerSize(DIGEST_FOOTER)).toBe(36);
  });

  it('reports the layout a footer conforms to', () => {
    expect(layoutOf(createPacketFooter(1))).toEqual(MINIMAL_FOOTER);
    expect(layoutOf(createPacketFooter(1, digest()))).toEqual(DIGEST_FOOTER);
  });
});

describe('createPacketFooter', () => {
  it('is frozen', () => {
    const footer = createPacketFooter(0x1234);

    expect(Object.isFrozen(footer)).toBe(true);
    (footer as { checksum: number }).checksum = 0;
    expect(footer.checksum).toBe(0x1234);
  });

  it('omits the digest when none is supplied', () => {
    expect(createPacketFooter(1).digest).toBeUndefined();
  });

  it('copies the digest so a reused buffer cannot alter a built footer', () => {
    const buffer = digest();
    const footer = createPacketFooter(1, buffer);

    buffer[0] = 255;

    expect(footer.digest?.[0]).toBe(7);
  });

  it('accepts the full UInt32 range', () => {
    expect(createPacketFooter(0xffffffff).checksum).toBe(0xffffffff);
    expect(createPacketFooter(0).checksum).toBe(0);
  });

  it.each([-1, 0x100000000, 1.5])('rejects a checksum of %p', (checksum) => {
    expect(() => createPacketFooter(checksum)).toThrow(AppError);
  });

  it.each([31, 33, 0])('rejects a digest of %p bytes', (length) => {
    // A short digest would silently shift every following byte.
    expect(() => createPacketFooter(1, new Uint8Array(length))).toThrow(AppError);
  });
});

describe('crc32', () => {
  it('matches the known IEEE 802.3 check value for "123456789"', () => {
    // The standard CRC-32 check vector.
    const input = new Uint8Array([...'123456789'].map((char) => char.charCodeAt(0)));

    expect(crc32(input)).toBe(0xcbf43926);
  });

  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('is deterministic', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    expect(crc32(bytes)).toBe(crc32(bytes));
  });

  it('detects a single flipped bit', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const altered = Uint8Array.from(original);
    altered[2] = (altered[2] as number) ^ 0b1;

    expect(crc32(original)).not.toBe(crc32(altered));
  });

  it('detects reordering', () => {
    expect(crc32(new Uint8Array([1, 2]))).not.toBe(crc32(new Uint8Array([2, 1])));
  });

  it('honours an explicit range', () => {
    const bytes = new Uint8Array([9, 9, 1, 2, 3, 9]);

    expect(crc32(bytes, 2, 5)).toBe(crc32(new Uint8Array([1, 2, 3])));
  });

  it('returns an unsigned 32-bit value', () => {
    // A signed implementation returns a negative number for this input.
    const bytes = new Uint8Array([0xff, 0xff, 0xff, 0xff]);

    expect(crc32(bytes)).toBeGreaterThanOrEqual(0);
    expect(crc32(bytes)).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('footerEquals', () => {
  it('compares checksums', () => {
    expect(footerEquals(createPacketFooter(1), createPacketFooter(1))).toBe(true);
    expect(footerEquals(createPacketFooter(1), createPacketFooter(2))).toBe(false);
  });

  it('compares digest bytes', () => {
    expect(footerEquals(createPacketFooter(1, digest(1)), createPacketFooter(1, digest(1)))).toBe(
      true,
    );
    expect(footerEquals(createPacketFooter(1, digest(1)), createPacketFooter(1, digest(2)))).toBe(
      false,
    );
  });

  it('treats a present and an absent digest as different', () => {
    expect(footerEquals(createPacketFooter(1), createPacketFooter(1, digest()))).toBe(false);
  });
});
