/**
 * The file container (F2) — ADR-0008.
 *
 * One file, its name, its media type and its digest, packed into the byte
 * string that the fountain code carries. **The metadata is inside the payload,
 * not in front of it**, which is what removes the manifest preamble: a receiver
 * cannot miss the file's name, because the name arrives through the same
 * rateless mechanism as the bytes and is not available until enough of the
 * transfer has arrived to reconstruct all of it.
 *
 * ```text
 *  0  4     magic "PHC1"
 *  4  u8    flags — bit 0 reserved for compression, currently always clear
 *  5  u16   name length, UTF-8 bytes
 *  7  u16   media type length, UTF-8 bytes
 *  9  u32   content length
 * 13  32    SHA-256 of the content
 * 45  ...   name, then media type, then content
 * ```
 *
 * The digest is over the **content**, so it stays meaningful if compression is
 * added later: whatever transformation the payload undergoes, this verifies the
 * file the user chose.
 *
 * **The digest is supplied, not computed here.** The core protocol layer may
 * not reach into `@security` — the boundary is enforced by lint — and it should
 * not want to: which algorithm verifies a transfer is the composition root's
 * decision, made once against the `IntegrityVerifier` contract, not a choice
 * this codec makes on its own.
 *
 * One file per transfer, deliberately (ADR-0008). The packet engine keeps the
 * multi-file manifest; this engine does not have one.
 */
/** Magic bytes: `PHC1`. */
export const CONTAINER_MAGIC = Object.freeze([0x50, 0x48, 0x43, 0x31]);

/** Bytes before the variable-length fields. */
export const CONTAINER_HEADER_BYTES = 45;

const SHA256_BYTES = 32;
const UINT16_MAX = 0xffff;

export interface ContainerFile {
  readonly name: string;
  readonly mediaType: string;
  readonly content: Uint8Array;
}

/** A file recovered from a completed transfer. */
export interface UnpackedFile extends ContainerFile {
  /** The digest the sender recorded, for the caller to verify against. */
  readonly digest: Uint8Array;
}

/** Why a container was refused. */
export const ContainerRejection = {
  Truncated: 'TRUNCATED',
  NotAContainer: 'NOT_A_CONTAINER',
  /** A declared length runs past the end, or the parts do not sum to the whole. */
  LengthMismatch: 'LENGTH_MISMATCH',
  /** A flag this build does not implement, such as compression. */
  UnsupportedFlags: 'UNSUPPORTED_FLAGS',
} as const;

export type ContainerRejection = (typeof ContainerRejection)[keyof typeof ContainerRejection];

export type ContainerResult =
  | { readonly ok: true; readonly file: UnpackedFile }
  | { readonly ok: false; readonly reason: ContainerRejection };

const textEncoder = new TextEncoder();
// Non-fatal: a name that is not valid UTF-8 becomes replacement characters
// rather than failing a transfer whose *content* is perfectly fine. The bytes
// that matter are checked by digest, and a mangled filename is recoverable in
// a way a refused file is not.
const textDecoder = new TextDecoder('utf-8', { fatal: false });

/**
 * Reduces a name to a bare basename.
 *
 * Applied on both ends, and the receiving end is the one that matters: the
 * name arrives over an optical channel and is whatever the other screen chose
 * to send. A path separator or a traversal segment must never reach a
 * filesystem call.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // Control characters, NUL and newline in particular, are stripped rather
  // than escaped — no filesystem wants them and no user typed them.
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();

  return cleaned === '' || cleaned === '.' || cleaned === '..' ? 'received.bin' : cleaned;
}

/** Whether a file can be described by this container's field widths. */
export function fitsContainer(file: ContainerFile): boolean {
  return (
    textEncoder.encode(safeFileName(file.name)).byteLength <= UINT16_MAX &&
    textEncoder.encode(file.mediaType).byteLength <= UINT16_MAX
  );
}

/**
 * Packs one file into the byte string a fountain stream carries.
 *
 * @param digest SHA-256 of `file.content`, computed by the caller. Thirty-two
 *   bytes; anything else is a programming error rather than a wire condition,
 *   so it is not reported as a rejection.
 */
export function packContainer(file: ContainerFile, digest: Uint8Array): Uint8Array {
  const name = textEncoder.encode(safeFileName(file.name));
  const mediaType = textEncoder.encode(file.mediaType);

  const out = new Uint8Array(
    CONTAINER_HEADER_BYTES + name.byteLength + mediaType.byteLength + file.content.byteLength,
  );
  const view = new DataView(out.buffer);

  out.set(CONTAINER_MAGIC, 0);
  view.setUint8(4, 0);
  view.setUint16(5, name.byteLength, true);
  view.setUint16(7, mediaType.byteLength, true);
  view.setUint32(9, file.content.byteLength, true);
  out.set(digest, 13);
  out.set(name, CONTAINER_HEADER_BYTES);
  out.set(mediaType, CONTAINER_HEADER_BYTES + name.byteLength);
  out.set(file.content, CONTAINER_HEADER_BYTES + name.byteLength + mediaType.byteLength);

  return out;
}

/**
 * Parses a reconstructed payload.
 *
 * Reports rather than throws, and validates lengths against the buffer it was
 * given rather than trusting them: every field here arrived over the optical
 * channel, so a declared length is a claim and not a fact.
 */
export function unpackContainer(payload: Uint8Array): ContainerResult {
  if (payload.byteLength < CONTAINER_HEADER_BYTES) {
    return { ok: false, reason: ContainerRejection.Truncated };
  }

  for (let index = 0; index < CONTAINER_MAGIC.length; index += 1) {
    if (payload[index] !== CONTAINER_MAGIC[index]) {
      return { ok: false, reason: ContainerRejection.NotAContainer };
    }
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const flags = view.getUint8(4);

  if (flags !== 0) {
    // Compression is the reserved bit. Refusing is right: a build that ignored
    // the flag would hand the user a gzip stream named as their file.
    return { ok: false, reason: ContainerRejection.UnsupportedFlags };
  }

  const nameLength = view.getUint16(5, true);
  const mediaTypeLength = view.getUint16(7, true);
  const contentLength = view.getUint32(9, true);

  const expected = CONTAINER_HEADER_BYTES + nameLength + mediaTypeLength + contentLength;

  // Exact, not "at least": a payload longer than its parts describe means the
  // lengths are wrong, and guessing which one would be inventing data.
  if (expected !== payload.byteLength) {
    return { ok: false, reason: ContainerRejection.LengthMismatch };
  }

  const nameAt = CONTAINER_HEADER_BYTES;
  const mediaTypeAt = nameAt + nameLength;
  const contentAt = mediaTypeAt + mediaTypeLength;

  return {
    ok: true,
    file: {
      // Sanitised again on the way out. The sender doing it is a convenience;
      // the receiver doing it is the part that protects anything.
      name: safeFileName(textDecoder.decode(payload.subarray(nameAt, mediaTypeAt))),
      mediaType:
        textDecoder.decode(payload.subarray(mediaTypeAt, contentAt)) || 'application/octet-stream',
      content: payload.slice(contentAt),
      digest: payload.slice(13, 13 + SHA256_BYTES),
    },
  };
}
