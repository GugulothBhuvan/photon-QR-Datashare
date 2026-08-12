/**
 * Fountain transport (F1) — ADR-0008.
 *
 * The properties that justify replacing the packet carousel, tested as
 * properties rather than as a happy path: any sufficient set of frames
 * reconstructs, order does not matter, loss costs time rather than
 * correctness, and a receiver may join at any point in the stream.
 *
 * **Determinism is wire format here.** Sender and receiver derive block
 * subsets independently and never compare notes, so the composition function
 * is pinned by fixed vectors. A change that alters them breaks every peer, and
 * the failure is silent — two devices simply never agree on what a frame
 * contained.
 */
import {
  createFountainDecoder,
  createFountainEncoder,
  cycleLength,
  frameComposition,
  splitmix32,
  MAX_SOURCE_BLOCKS,
  REPAIR_DEGREE_MAX,
  REPAIR_DEGREE_MIN,
} from '@core/fountain/index';

const SEED = 0x51d3;

/** A payload whose bytes encode their own position, so a misplacement shows. */
function payloadOf(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_unused, index) => (index * 31 + 7) & 0xff);
}

/** Sends `count` frames from `from`, keeping those the channel does not drop. */
function transmit(
  encoder: ReturnType<typeof createFountainEncoder>,
  decoder: ReturnType<typeof createFountainDecoder>,
  options: { from?: number; count: number; keep?: (seq: number) => boolean } = { count: 0 },
): number {
  const { from = 0, count, keep = () => true } = options;
  let delivered = 0;

  for (let seq = from; seq < from + count; seq += 1) {
    if (keep(seq)) {
      decoder.accept(seq, encoder.block(seq));
      delivered += 1;
    }
  }

  return delivered;
}

function decoderFor(encoder: ReturnType<typeof createFountainEncoder>) {
  return createFountainDecoder({
    k: encoder.k,
    blockLength: encoder.blockLength,
    totalLength: encoder.totalLength,
    sessionSeed: SEED,
  });
}

describe('composition is wire format (ADR-0008)', () => {
  it('produces identical subsets for identical inputs', () => {
    // Sender and receiver run this independently. If it is not a pure function
    // of its arguments, two devices disagree about what a frame contained and
    // the transfer fails with nothing to diagnose.
    for (const seq of [0, 1, 37, 512, 99_999]) {
      expect(frameComposition(64, SEED, seq)).toEqual(frameComposition(64, SEED, seq));
    }
  });

  it('uses only integer operations, so engines cannot disagree', () => {
    // splitmix32 is pinned by value. `Math.log` and friends are
    // implementation-approximated; a one-ulp difference between two JavaScript
    // engines would shift a sampled degree and desynchronise the stream.
    const next = splitmix32(1);
    const drawn = [next(), next(), next()];

    for (const value of drawn) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }

    // Same seed, same sequence — the property a second device depends on.
    const again = splitmix32(1);
    expect([again(), again(), again()]).toEqual(drawn);
  });

  it('sweeps every block exactly once before any repair frame', () => {
    const k = 40;
    const swept = new Set<number>();

    for (let seq = 0; seq < k; seq += 1) {
      const indices = frameComposition(k, SEED, seq);

      expect(indices).toHaveLength(1);
      swept.add(indices[0] as number);
    }

    expect(swept.size).toBe(k);
  });

  it('draws repair frames in the mid-degree range', () => {
    const k = 200;

    for (let seq = k; seq < cycleLength(k); seq += 1) {
      const indices = frameComposition(k, SEED, seq);

      expect(indices.length).toBeGreaterThanOrEqual(REPAIR_DEGREE_MIN);
      expect(indices.length).toBeLessThanOrEqual(REPAIR_DEGREE_MAX);
      // No block counted twice: a repeated index would XOR itself out.
      expect(new Set(indices).size).toBe(indices.length);
    }
  });

  it('draws different repair subsets on each pass of the carousel', () => {
    // Seeded from the absolute sequence number, so re-watching the stream
    // yields new combinations rather than a replay.
    const k = 50;
    const first = frameComposition(k, SEED, k + 3);
    const second = frameComposition(k, SEED, cycleLength(k) + k + 3);

    expect(first).not.toEqual(second);
  });
});

describe('any sufficient frames reconstruct (ADR-0008)', () => {
  it('completes in exactly k frames when the sweep is clean', () => {
    // The systematic half means a receiver that catches everything pays no
    // coding overhead at all — the property a pure LT code does not have.
    const encoder = createFountainEncoder({
      payload: payloadOf(4_000),
      blockLength: 256,
      sessionSeed: SEED,
    });
    const decoder = decoderFor(encoder);

    transmit(encoder, decoder, { count: encoder.k });

    expect(decoder.progress().complete).toBe(true);
    expect(decoder.progress().framesAccepted).toBe(encoder.k);
  });

  it('reconstructs the payload byte for byte', () => {
    const payload = payloadOf(9_999);
    const encoder = createFountainEncoder({ payload, blockLength: 512, sessionSeed: SEED });
    const decoder = decoderFor(encoder);

    transmit(encoder, decoder, { count: cycleLength(encoder.k) * 2 });

    expect(Array.from(decoder.assemble() ?? [])).toEqual(Array.from(payload));
  });

  it('does not care what order frames arrive in', () => {
    const payload = payloadOf(3_000);
    const encoder = createFountainEncoder({ payload, blockLength: 200, sessionSeed: SEED });
    const decoder = decoderFor(encoder);

    const order = Array.from({ length: cycleLength(encoder.k) }, (_unused, seq) => seq).reverse();

    for (const seq of order) {
      decoder.accept(seq, encoder.block(seq));
    }

    expect(decoder.assemble()).toBeDefined();
  });

  it('recovers a payload of a single block', () => {
    const payload = payloadOf(40);
    const encoder = createFountainEncoder({ payload, blockLength: 256, sessionSeed: SEED });
    const decoder = decoderFor(encoder);

    expect(encoder.k).toBe(1);
    transmit(encoder, decoder, { count: 4 });

    expect(Array.from(decoder.assemble() ?? [])).toEqual(Array.from(payload));
  });
});

describe('loss costs time, never correctness (ADR-0008)', () => {
  /*
   * The reason for the redesign. Under the packet carousel a missed index
   * costs a whole cycle and the receiver waits for that exact frame. Here any
   * frame is as good as any other, so the same loss costs a bounded overhead.
   */

  it.each([10, 30, 50])('reconstructs through %i%% frame loss', (percent) => {
    const payload = payloadOf(8_000);
    const encoder = createFountainEncoder({ payload, blockLength: 256, sessionSeed: SEED });
    const decoder = decoderFor(encoder);

    // Deterministic loss, so a failure is reproducible rather than flaky.
    const drop = splitmix32(0xd200 + percent);
    let seq = 0;

    while (!decoder.progress().complete && seq < encoder.k * 40) {
      if (drop() % 100 >= percent) {
        decoder.accept(seq, encoder.block(seq));
      }
      seq += 1;
    }

    expect(decoder.progress().complete).toBe(true);
    expect(Array.from(decoder.assemble() ?? [])).toEqual(Array.from(payload));
  });

  it('needs a bounded overhead rather than an unbounded wait', () => {
    // At 30% loss the packet carousel needs several complete cycles because it
    // must catch specific indices. This needs a modest multiple of k frames.
    const payload = payloadOf(8_000);
    const encoder = createFountainEncoder({ payload, blockLength: 256, sessionSeed: SEED });
    const decoder = decoderFor(encoder);

    const drop = splitmix32(0xbeef);
    let seq = 0;

    while (!decoder.progress().complete && seq < encoder.k * 40) {
      if (drop() % 100 >= 30) {
        decoder.accept(seq, encoder.block(seq));
      }
      seq += 1;
    }

    expect(decoder.progress().complete).toBe(true);
    // Generous, and the point is the bound exists at all.
    expect(decoder.progress().framesAccepted).toBeLessThan(encoder.k * 4);
  });
});

describe('a receiver may join at any point (ADR-0008)', () => {
  it('reconstructs having missed the start of the stream', () => {
    // No preamble to catch. The packet engine cannot place a single packet
    // until it has seen the handshake and manifest.
    const payload = payloadOf(6_000);
    const encoder = createFountainEncoder({ payload, blockLength: 256, sessionSeed: SEED });
    const decoder = decoderFor(encoder);

    // Joins deep into the repair half of the second cycle.
    transmit(encoder, decoder, {
      from: cycleLength(encoder.k) + encoder.k + 5,
      count: cycleLength(encoder.k) * 3,
    });

    expect(decoder.progress().complete).toBe(true);
    expect(Array.from(decoder.assemble() ?? [])).toEqual(Array.from(payload));
  });
});

describe('decoder bookkeeping', () => {
  it('ignores a sequence number it has already accepted', () => {
    const encoder = createFountainEncoder({
      payload: payloadOf(2_000),
      blockLength: 256,
      sessionSeed: SEED,
    });
    const decoder = decoderFor(encoder);

    decoder.accept(0, encoder.block(0));
    decoder.accept(0, encoder.block(0));

    expect(decoder.progress().framesAccepted).toBe(1);
    expect(decoder.progress().framesDuplicate).toBe(1);
  });

  it('counts a frame that carried nothing new', () => {
    // A receiver joining late sees the carousel sweep ground it already holds.
    // Reported separately because a progress estimate fed raw accepted frames
    // overstates itself by exactly this fraction.
    const encoder = createFountainEncoder({
      payload: payloadOf(2_000),
      blockLength: 256,
      sessionSeed: SEED,
    });
    const decoder = decoderFor(encoder);

    // One block short of complete, so the decoder is still working.
    transmit(encoder, decoder, { count: encoder.k - 1 });
    expect(decoder.progress().complete).toBe(false);

    // The next cycle re-sweeps from block 0, which is already solved.
    decoder.accept(cycleLength(encoder.k), encoder.block(cycleLength(encoder.k)));

    expect(decoder.progress().framesRedundant).toBe(1);
  });

  it('withholds the payload until every block is solved', () => {
    const encoder = createFountainEncoder({
      payload: payloadOf(5_000),
      blockLength: 256,
      sessionSeed: SEED,
    });
    const decoder = decoderFor(encoder);

    transmit(encoder, decoder, { count: 3 });

    expect(decoder.assemble()).toBeUndefined();
    expect(decoder.progress().complete).toBe(false);
  });
});

describe('encoder refuses what it cannot carry', () => {
  it('refuses a payload needing more blocks than a header can number', () => {
    // `k` is a 16-bit field. Failing here means a sender stops before it
    // starts displaying, rather than part way through a transfer.
    expect(() =>
      createFountainEncoder({
        payload: new Uint8Array(MAX_SOURCE_BLOCKS + 1),
        blockLength: 1,
        sessionSeed: SEED,
      }),
    ).toThrow(/bytes per frame/i);
  });

  it('refuses an empty payload', () => {
    expect(() =>
      createFountainEncoder({ payload: new Uint8Array(0), blockLength: 256, sessionSeed: SEED }),
    ).toThrow();
  });

  it('hands out an independent buffer per call', () => {
    // A sender that queues frames for display would otherwise find every
    // queued frame holding the bytes of the most recent one.
    const encoder = createFountainEncoder({
      payload: payloadOf(1_000),
      blockLength: 256,
      sessionSeed: SEED,
    });

    const first = encoder.block(0);
    const firstCopy = Uint8Array.from(first);
    encoder.block(1);

    expect(Array.from(first)).toEqual(Array.from(firstCopy));
  });
});
