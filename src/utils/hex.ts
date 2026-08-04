/**
 * Hexadecimal conversion.
 *
 * A digest is bytes; a manifest carries its file hashes as text (§10.5). This
 * is the conversion between them, isolated so the comparison in the integrity
 * checker is a string comparison of two values produced the same way.
 *
 * Pure and dependency-free.
 */

/** Encodes bytes as lowercase hexadecimal. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';

  for (let i = 0; i < bytes.length; i += 1) {
    out += (bytes[i] as number).toString(16).padStart(2, '0');
  }

  return out;
}

/** Whether a string is valid hexadecimal of even length. */
export function isHex(value: string): boolean {
  return value.length % 2 === 0 && /^[0-9a-f]*$/i.test(value);
}
