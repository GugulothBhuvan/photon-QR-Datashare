/**
 * The optical frame (F2) — ADR-0008.
 *
 * **Every frame describes the whole transfer.** There is no handshake and no
 * manifest preamble: a receiver that decodes any single frame knows the block
 * count, the block length, the payload length and how to verify the result. It
 * can begin collecting from that frame onward.
 *
 * That is the property the packet engine cannot have. There, a receiver must
 * catch §9.1's handshake and §9.2's manifest before it can place a single
 * packet, so joining a transfer late means waiting for the cycle to bring the
 * preamble round again.
 *
 * ```text
 *  0  u8    magic 0x50
 *  1  u8    format version — a bump makes an old peer reject cleanly rather
 *           than misparse, which is the failure mode worth engineering for
 *  2  u16   sessionSeed  chosen per transfer; also seeds the frame PRNG
 *  4  u32   seq          which composition this frame carries
 *  8  u16   k            source block count
 * 10  u16   blockLength  payload bytes in this frame
 * 12  u32   totalLength  the payload length being reconstructed
 * 16  u32   payloadCrc   CRC32 of the whole container, checked on completion
 * 20  ...   the coded block
 * ```
 *
 * Twenty bytes against the packet engine's fifty-four, which matters more than
 * it looks: the header is paid on every frame, so at 512-byte blocks it is the
 * difference between 10% and 4% of the channel.
 */
import { crc32 } from '@core/packet/crc32';

/** First byte of every frame. */
export const FRAME_MAGIC = 0x50;

/**
 * Wire format version.
 *
 * Carried in its own byte so a future change is **rejected**, not misread. A
 * receiver that silently misparsed a newer frame would collect garbage and
 * only discover it at the final digest check, after the whole transfer.
 */
export const FRAME_VERSION = 1;

/** Bytes before the coded block. */
export const FRAME_HEADER_BYTES = 20;

/** Everything a receiver learns from one frame. */
export interface FrameHeader {
  readonly sessionSeed: number;
  readonly seq: number;
  readonly k: number;
  readonly blockLength: number;
  readonly totalLength: number;
  /** CRC32 of the reconstructed payload, for the completion check. */
  readonly payloadCrc: number;
}

/** Why a frame was refused. */
export const FrameRejection = {
  /** Fewer bytes than a header. */
  Truncated: 'TRUNCATED',
  /** Not an optical frame at all — almost always another application's QR. */
  NotAFrame: 'NOT_A_FRAME',
  /** A format this build cannot read. */
  UnsupportedVersion: 'UNSUPPORTED_VERSION',
  /** A field held a value no transfer could have produced. */
  InvalidField: 'INVALID_FIELD',
  /** The frame's length disagrees with the block length it declares. */
  LengthMismatch: 'LENGTH_MISMATCH',
} as const;

export type FrameRejection = (typeof FrameRejection)[keyof typeof FrameRejection];

export interface FrameDecodeSuccess {
  readonly ok: true;
  readonly header: FrameHeader;
  /** The coded block. A view, not a copy — the caller must not retain it. */
  readonly block: Uint8Array;
}

export interface FrameDecodeRejection {
  readonly ok: false;
  readonly reason: FrameRejection;
}

export type FrameDecodeResult = FrameDecodeSuccess | FrameDecodeRejection;

const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;

/** Serializes one frame. */
export function encodeFrame(header: FrameHeader, block: Uint8Array): Uint8Array {
  const out = new Uint8Array(FRAME_HEADER_BYTES + block.byteLength);
  const view = new DataView(out.buffer);

  out[0] = FRAME_MAGIC;
  out[1] = FRAME_VERSION;
  view.setUint16(2, header.sessionSeed, true);
  view.setUint32(4, header.seq, true);
  view.setUint16(8, header.k, true);
  view.setUint16(10, header.blockLength, true);
  view.setUint32(12, header.totalLength, true);
  view.setUint32(16, header.payloadCrc, true);
  out.set(block, FRAME_HEADER_BYTES);

  return out;
}

/**
 * Parses one frame.
 *
 * Reports rather than throws. A receiver is pointed at whatever happens to be
 * in front of it, so a QR code belonging to some other application is the
 * ordinary case and not an exceptional one.
 */
export function decodeFrame(bytes: Uint8Array): FrameDecodeResult {
  if (bytes.byteLength <= FRAME_HEADER_BYTES) {
    return { ok: false, reason: FrameRejection.Truncated };
  }

  if (bytes[0] !== FRAME_MAGIC) {
    return { ok: false, reason: FrameRejection.NotAFrame };
  }

  if (bytes[1] !== FRAME_VERSION) {
    return { ok: false, reason: FrameRejection.UnsupportedVersion };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header: FrameHeader = {
    sessionSeed: view.getUint16(2, true),
    seq: view.getUint32(4, true),
    k: view.getUint16(8, true),
    blockLength: view.getUint16(10, true),
    totalLength: view.getUint32(12, true),
    payloadCrc: view.getUint32(16, true),
  };

  if (header.k === 0 || header.blockLength === 0 || header.totalLength === 0) {
    return { ok: false, reason: FrameRejection.InvalidField };
  }

  // A payload cannot need more blocks than it declares, nor fewer than it
  // would take to hold it. Both would produce a decoder that never completes.
  const expectedBlocks = Math.ceil(header.totalLength / header.blockLength);

  if (header.k !== expectedBlocks) {
    return { ok: false, reason: FrameRejection.InvalidField };
  }

  if (bytes.byteLength !== FRAME_HEADER_BYTES + header.blockLength) {
    return { ok: false, reason: FrameRejection.LengthMismatch };
  }

  return { ok: true, header, block: bytes.subarray(FRAME_HEADER_BYTES) };
}

/**
 * Everything that must hold constant for frames to belong to one transfer.
 *
 * `seq` is deliberately absent — it is the one field that varies within a
 * stream. A receiver compares this against what it is already collecting and
 * **resets on any disagreement**, not only on a new session.
 *
 * That matters because `sessionSeed` is sixteen bits chosen per transfer, so a
 * collision across a sender restart is unlikely but real. Feeding a frame from
 * a different transfer into an existing decoder corrupts it silently: the XOR
 * is meaningless, nothing detects it, and the failure surfaces only as a digest
 * mismatch after the entire transfer has run. Including every other field makes
 * that collision harmless.
 *
 * It also means a sender restarted on the *same* file resumes into the same
 * decoder, which is correct — identical parameters produce identical frames.
 */
export function streamIdentity(header: FrameHeader): string {
  return [
    header.sessionSeed,
    header.k,
    header.blockLength,
    header.totalLength,
    header.payloadCrc,
  ].join(':');
}

/** Whether a reconstructed payload is the one the stream promised. */
export function matchesChecksum(header: FrameHeader, payload: Uint8Array): boolean {
  return crc32(payload) === header.payloadCrc;
}

/** Guards a value the caller is about to put in a UInt16 header field. */
export function fitsUint16(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= UINT16_MAX;
}

/** Guards a value the caller is about to put in a UInt32 header field. */
export function fitsUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;
}
