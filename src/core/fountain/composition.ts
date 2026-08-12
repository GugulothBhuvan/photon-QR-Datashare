/**
 * Which source blocks go into which frame (ADR-0008).
 *
 * The sender and the receiver derive this **independently and never compare
 * notes**, so it is wire format rather than an implementation detail: any
 * change here breaks every peer. That is also why nothing in this file uses a
 * floating-point operation.
 *
 * **The carousel.** A cycle is `k` systematic frames — block 0, block 1, …
 * block k−1 — followed by `k` repair frames, each the XOR of a pseudorandom
 * subset. The cycle repeats forever. Three properties fall out of that:
 *
 * - A receiver that catches a clean sweep completes in **exactly k frames**,
 *   with no coding overhead at all.
 * - A dropped frame costs time, never correctness: repair frames from any
 *   later cycle patch it.
 * - Frames may arrive in any order, and the two devices' frame rates need not
 *   match.
 *
 * **Why repair frames are uniform mid-degree rather than robust soliton.**
 * Textbook LT codes draw the degree from a robust-soliton distribution, which
 * puts heavy mass on degree 1 and 2. That is right when a decoder starts from
 * nothing. It is wrong here: after a systematic sweep the receiver already
 * holds most blocks, so a low-degree repair frame usually re-sends something it
 * has. A uniform degree over a mid range keeps each repair frame useful for
 * longer, and — the reason that matters most — it needs no logarithm, so there
 * is no floating-point arithmetic anywhere in the wire format.
 *
 * That last point is not a micro-optimisation. `Math.log` is
 * implementation-approximated, so two JavaScript engines may differ by one unit
 * in the last place, which is enough to shift a cumulative distribution and
 * flip a sampled degree. Sender and receiver would then build different subsets
 * for the same sequence number and the transfer would fail with no diagnosable
 * cause. Avoiding the distribution avoids the class of bug.
 */

/** Lowest and highest degree of a repair frame. */
export const REPAIR_DEGREE_MIN = 4;
export const REPAIR_DEGREE_MAX = 24;

/**
 * Frames in one carousel cycle.
 *
 * `k` systematic then `k` repair. Exported because a receiver's progress
 * estimate and a sender's status line both need it, and neither should
 * rediscover the shape of the stream.
 */
export function cycleLength(k: number): number {
  return 2 * k;
}

/**
 * splitmix32 — deterministic across engines, integer operations only.
 *
 * `Math.imul` is exactly specified, and every other operation here is a 32-bit
 * integer op, so two devices running different JavaScript engines produce
 * identical sequences. A `Math.random` or any float-derived source would make
 * the stream unreadable by anything but the device that produced it.
 */
export function splitmix32(seed: number): () => number {
  let state = seed | 0;

  return (): number => {
    state = (state + 0x9e3779b9) | 0;
    let z = state ^ (state >>> 16);
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return z >>> 0;
  };
}

/**
 * Seeds one frame's generator.
 *
 * Mixes the session with the sequence number so two concurrent senders do not
 * produce identical subsets, and so the same sequence number in a different
 * session draws a different one.
 */
function frameSeed(sessionSeed: number, seq: number): number {
  let h = (Math.imul(sessionSeed + 1, 0x9e3779b1) ^ (seq + 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

/**
 * The block indices a repair frame covers.
 *
 * Seeded from the **absolute** sequence number rather than a position within
 * the cycle, so every cycle's repair frames draw different subsets. A receiver
 * watching the carousel round a second time gets new combinations rather than
 * a replay of ones it already has.
 */
function repairIndices(k: number, sessionSeed: number, seq: number): number[] {
  const next = splitmix32(frameSeed(sessionSeed, seq));
  const span = REPAIR_DEGREE_MAX - REPAIR_DEGREE_MIN + 1;
  const degree = Math.min(k, REPAIR_DEGREE_MIN + (next() % span));

  const chosen = new Set<number>();

  while (chosen.size < degree) {
    chosen.add(next() % k);
  }

  return [...chosen];
}

/**
 * The source blocks XORed into frame `seq`.
 *
 * A systematic frame carries exactly one block and no coding overhead; a repair
 * frame carries several. The caller does not need to know which it got — the
 * decoder works it out from the same function.
 *
 * @param k Source block count. Must be at least 1.
 * @param sessionSeed A per-transfer value both devices read from the frame header.
 * @param seq The frame's sequence number.
 */
export function frameComposition(k: number, sessionSeed: number, seq: number): number[] {
  if (k < 1) {
    return [];
  }

  const position = seq % cycleLength(k);

  return position < k ? [position] : repairIndices(k, sessionSeed, seq);
}
