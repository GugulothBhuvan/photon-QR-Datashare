/**
 * CRC-32 (PACKET_SPEC §6).
 *
 * §6 names the field "CRC32" without naming a variant. This implements the
 * IEEE 802.3 CRC-32 — reflected polynomial `0xEDB88320`, initial and final
 * value `0xFFFFFFFF` — which is the variant used by zlib, PNG, gzip and
 * Ethernet, and is what "CRC32" means without further qualification.
 *
 * Pure and deterministic: the same bytes always produce the same checksum, on
 * every device. That is what makes the protocol's test vectors meaningful.
 */

/** Lookup table, built once. 256 entries of the reflected polynomial. */
const TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }

  return table;
})();

/**
 * Computes the CRC-32 of a byte range.
 *
 * @param bytes Data to checksum.
 * @param start First byte to include, defaults to 0.
 * @param end One past the last byte, defaults to the end of `bytes`.
 * @returns An unsigned 32-bit checksum.
 */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.byteLength): number {
  let crc = 0xffffffff;

  for (let i = start; i < end; i += 1) {
    const index = (crc ^ (bytes[i] as number)) & 0xff;
    crc = (crc >>> 8) ^ (TABLE[index] as number);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
