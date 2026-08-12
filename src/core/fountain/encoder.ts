/**
 * Fountain encoder (ADR-0008).
 *
 * Splits a payload into `k` fixed-length source blocks and produces an endless
 * stream of coded blocks. The sender never decides how many frames a transfer
 * needs: it emits until the receiver stops watching.
 *
 * Blocks are held as `Uint32Array` so a XOR costs one operation per four bytes
 * rather than per byte. A repair frame of degree 24 over a 2 KB block is 12,000
 * word operations instead of 48,000 byte operations, and it runs once per
 * displayed frame.
 */
import { AppError, ErrorCode } from '@core/errors';

import { frameComposition } from './composition';

export interface FountainEncoder {
  /** Source block count. Both devices must agree; it travels in every header. */
  readonly k: number;
  /** Bytes per block. */
  readonly blockLength: number;
  /** The payload length this stream reconstructs. */
  readonly totalLength: number;
  /**
   * The coded block for one sequence number.
   *
   * Deterministic: the same arguments always produce the same bytes, which is
   * what lets a receiver derive the composition without being told.
   *
   * The returned array is **freshly allocated** on each call. Reusing a buffer
   * would be cheaper and is deliberately not done — a caller that queues frames
   * for display would otherwise find every queued frame holding the same bytes.
   */
  block(seq: number): Uint8Array;
}

export interface FountainEncoderOptions {
  readonly payload: Uint8Array;
  /** Bytes per source block, after the frame header has taken its cut. */
  readonly blockLength: number;
  /** Mixed into every frame's PRNG seed. Travels in the header. */
  readonly sessionSeed: number;
}

/**
 * Largest source block count.
 *
 * `k` is a 16-bit field in the frame header, so a payload large enough to need
 * more blocks than this cannot be carried at that block length — the caller
 * must raise bytes per frame instead. Catching it here means a sender fails
 * before it starts displaying rather than part way through.
 */
export const MAX_SOURCE_BLOCKS = 0xffff;

export function createFountainEncoder(options: FountainEncoderOptions): FountainEncoder {
  const { payload, blockLength, sessionSeed } = options;

  if (blockLength < 1) {
    throw new AppError(ErrorCode.INVALID_CONFIGURATION, 'Block length must be positive.', {
      details: { blockLength },
    });
  }

  if (payload.length === 0) {
    throw new AppError(ErrorCode.INVALID_CONFIGURATION, 'Nothing to send.', {});
  }

  const k = Math.ceil(payload.length / blockLength);

  if (k > MAX_SOURCE_BLOCKS) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'This file needs more blocks than a stream can number. Raise bytes per frame.',
      { details: { k, blockLength, maximum: MAX_SOURCE_BLOCKS } },
    );
  }

  // Padded up to a word boundary so XOR can work on 32-bit lanes. The final
  // block's padding is whatever the payload did not fill; the decoder trims to
  // `totalLength` and never sees it.
  const words = Math.ceil(blockLength / 4);
  const blocks = new Uint32Array(k * words);
  const asBytes = new Uint8Array(blocks.buffer);

  for (let index = 0; index < k; index += 1) {
    const start = index * blockLength;
    asBytes.set(
      payload.subarray(start, Math.min(start + blockLength, payload.length)),
      index * words * 4,
    );
  }

  return {
    k,
    blockLength,
    totalLength: payload.length,

    block(seq) {
      const out = new Uint32Array(words);

      for (const index of frameComposition(k, sessionSeed, seq)) {
        const offset = index * words;

        for (let word = 0; word < words; word += 1) {
          out[word] = ((out[word] ?? 0) ^ (blocks[offset + word] ?? 0)) >>> 0;
        }
      }

      // Trimmed to the declared block length: the word padding is an internal
      // detail and must not reach the wire, where it would inflate every frame.
      return new Uint8Array(out.buffer, 0, blockLength);
    },
  };
}
