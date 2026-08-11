/**
 * Frame sources (PERF-001) — TRD §34; QR_SPEC §8.
 *
 * A lazy source is what keeps peak memory a property of the display window
 * rather than of the file, which is what TRD §34's 150 MB cap requires of a
 * large transfer. The guarantee that matters is that laziness changes *when*
 * a frame is built and nothing else: the same frames, in the same order.
 */
import { createFrameScheduler, frameSourceOf, lazyFrameSource } from '@qr/frameScheduler';

describe('frameSourceOf', () => {
  it('exposes count, indexed access and iteration', () => {
    const source = frameSourceOf(['a', 'b', 'c']);

    expect(source.count).toBe(3);
    expect(source.at(1)).toBe('b');
    expect([...source]).toEqual(['a', 'b', 'c']);
  });

  it('returns undefined outside the range rather than throwing', () => {
    const source = frameSourceOf(['a']);

    expect(source.at(-1)).toBeUndefined();
    expect(source.at(1)).toBeUndefined();
  });

  it('copies, so a caller cannot reorder a live transmission (§8)', () => {
    const frames = ['a', 'b'];
    const source = frameSourceOf(frames);

    frames.reverse();

    expect([...source]).toEqual(['a', 'b']);
  });
});

describe('lazyFrameSource', () => {
  it('builds nothing until a frame is asked for', () => {
    const produce = jest.fn((index: number) => `frame-${index}`);
    const source = lazyFrameSource(100, produce);

    // The whole point: preparing a transfer must not encode every frame.
    expect(produce).not.toHaveBeenCalled();
    expect(source.count).toBe(100);
  });

  it('builds a frame on first request', () => {
    const produce = jest.fn((index: number) => `frame-${index}`);
    const source = lazyFrameSource(10, produce);

    expect(source.at(3)).toBe('frame-3');
    expect(produce).toHaveBeenCalledTimes(1);
    expect(produce).toHaveBeenCalledWith(3);
  });

  it('does not rebuild a frame still in the window', () => {
    const produce = jest.fn((index: number) => `frame-${index}`);
    const source = lazyFrameSource(10, produce, 4);

    source.at(0);
    source.at(0);
    source.at(0);

    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('retains only the window, so memory does not grow with the file', () => {
    const produce = jest.fn((index: number) => `frame-${index}`);
    const source = lazyFrameSource(100, produce, 3);

    for (let index = 0; index < 100; index += 1) {
      source.at(index);
    }

    expect(produce).toHaveBeenCalledTimes(100);

    // The earliest frames are long gone; asking again rebuilds them. That
    // rebuild is the cost being paid for a bounded footprint, and it is the
    // behaviour that would silently disappear if the cache became unbounded.
    produce.mockClear();
    source.at(0);
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used frame, not the oldest built', () => {
    const produce = jest.fn((index: number) => `frame-${index}`);
    const source = lazyFrameSource(10, produce, 2);

    source.at(0);
    source.at(1);
    source.at(0); // 0 is now the most recent.
    source.at(2); // Evicts 1, not 0.

    produce.mockClear();
    source.at(0);

    expect(produce).not.toHaveBeenCalled();
  });

  it('produces every frame in order when iterated', () => {
    const source = lazyFrameSource(5, (index) => index * 2);

    expect([...source]).toEqual([0, 2, 4, 6, 8]);
  });

  it('returns undefined outside the range without building anything', () => {
    const produce = jest.fn((index: number) => index);
    const source = lazyFrameSource(3, produce);

    expect(source.at(-1)).toBeUndefined();
    expect(source.at(3)).toBeUndefined();
    expect(produce).not.toHaveBeenCalled();
  });

  it('rejects a nonsensical count', () => {
    expect(() => lazyFrameSource(-1, (index) => index)).toThrow();
    expect(() => lazyFrameSource(1.5, (index) => index)).toThrow();
  });

  it('handles an empty sequence', () => {
    const source = lazyFrameSource(0, (index) => index);

    expect(source.count).toBe(0);
    expect([...source]).toEqual([]);
  });
});

describe('the scheduler over a lazy source', () => {
  it('behaves identically to one over an array', () => {
    // The substitution must be invisible to the scheduler, or laziness would
    // be a behaviour change wearing a performance change's clothes.
    const frames = ['a', 'b', 'c'];
    const eager = createFrameScheduler({ frames });
    const lazy = createFrameScheduler({
      frames: lazyFrameSource(frames.length, (index) => frames[index] as string),
    });

    for (let step = 0; step < 7; step += 1) {
      expect(lazy.current()).toBe(eager.current());
      expect(lazy.state()).toEqual(eager.state());

      eager.advance();
      lazy.advance();
    }
  });

  it('encodes only the frames it displays', () => {
    const produce = jest.fn((index: number) => `frame-${index}`);
    const scheduler = createFrameScheduler({ frames: lazyFrameSource(500, produce) });

    scheduler.current();
    scheduler.advance();
    scheduler.advance();

    // Three frames shown out of five hundred. An eager schedule would have
    // built all five hundred before the first was on screen.
    expect(produce).toHaveBeenCalledTimes(3);
    expect(scheduler.state().frameCount).toBe(500);
  });
});
