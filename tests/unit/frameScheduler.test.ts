/**
 * Frame scheduler (QR-003) — QR_SPEC §8, §9, §10.
 */
import { AppError } from '@core/errors';
import {
  createFrameScheduler,
  FRAME_DURATION_MS,
  FrameRate,
  MAX_FRAME_DURATION_MS,
  MIN_FRAME_DURATION_MS,
} from '@qr/frameScheduler';

const frames = ['f0', 'f1', 'f2', 'f3'];

describe('sequential display (§8)', () => {
  it('starts at the first frame', () => {
    expect(createFrameScheduler({ frames }).current()).toBe('f0');
  });

  it('advances in packet order', () => {
    const scheduler = createFrameScheduler({ frames });
    const seen = [scheduler.current()];

    for (let i = 0; i < 3; i += 1) {
      seen.push(scheduler.advance());
    }

    expect(seen).toEqual(['f0', 'f1', 'f2', 'f3']);
  });

  it('preserves packet ordering across a loop', () => {
    const scheduler = createFrameScheduler({ frames });
    const seen: (string | undefined)[] = [scheduler.current()];

    for (let i = 0; i < 7; i += 1) {
      seen.push(scheduler.advance());
    }

    expect(seen).toEqual(['f0', 'f1', 'f2', 'f3', 'f0', 'f1', 'f2', 'f3']);
  });

  it('copies the frame list, so a caller cannot reorder a live transmission', () => {
    const mutable = [...frames];
    const scheduler = createFrameScheduler({ frames: mutable });

    mutable.reverse();

    expect(scheduler.current()).toBe('f0');
  });

  it('reports position and loop count', () => {
    const scheduler = createFrameScheduler({ frames });

    scheduler.advance();
    scheduler.advance();

    expect(scheduler.state()).toMatchObject({ index: 2, frameCount: 4, loops: 0 });
  });

  it('counts a loop when it wraps', () => {
    const scheduler = createFrameScheduler({ frames });

    for (let i = 0; i < 4; i += 1) {
      scheduler.advance();
    }

    expect(scheduler.state()).toMatchObject({ index: 0, loops: 1 });
  });

  it('resets to the beginning', () => {
    const scheduler = createFrameScheduler({ frames });

    scheduler.advance();
    scheduler.advance();
    scheduler.reset();

    expect(scheduler.current()).toBe('f0');
    expect(scheduler.state()).toMatchObject({ index: 0, loops: 0 });
  });
});

describe('looping (PROTOCOL_SPEC §11.11, §15.6)', () => {
  it('loops by default, since natural repetition is the default recovery strategy', () => {
    const scheduler = createFrameScheduler({ frames });

    for (let i = 0; i < 4; i += 1) {
      scheduler.advance();
    }

    expect(scheduler.current()).toBe('f0');
    expect(scheduler.state().finished).toBe(false);
  });

  it('finishes after the last frame when looping is off', () => {
    const scheduler = createFrameScheduler({ frames, loop: false });

    for (let i = 0; i < 3; i += 1) {
      scheduler.advance();
    }

    expect(scheduler.current()).toBe('f3');
    expect(scheduler.advance()).toBeUndefined();
    expect(scheduler.state().finished).toBe(true);
  });

  it('handles an empty schedule without throwing', () => {
    const scheduler = createFrameScheduler<string>({ frames: [] });

    expect(scheduler.current()).toBeUndefined();
    expect(scheduler.advance()).toBeUndefined();
    expect(scheduler.state().finished).toBe(true);
  });

  it('handles a single frame', () => {
    const scheduler = createFrameScheduler({ frames: ['only'] });

    expect(scheduler.advance()).toBe('only');
    expect(scheduler.state().loops).toBe(1);
  });
});

describe('frame timing (§9)', () => {
  it('uses the specification’s recommended defaults', () => {
    expect(FRAME_DURATION_MS).toEqual({ FAST: 100, BALANCED: 200, RELIABLE: 350 });
  });

  it('defaults to Balanced', () => {
    expect(createFrameScheduler({ frames }).currentDuration()).toBe(200);
  });

  it.each([
    [FrameRate.Fast, 100],
    [FrameRate.Balanced, 200],
    [FrameRate.Reliable, 350],
  ])('starts at %s with %p ms', (rate, expected) => {
    expect(createFrameScheduler({ frames, rate }).currentDuration()).toBe(expected);
  });

  it('holds no timer — nothing advances on its own', () => {
    const scheduler = createFrameScheduler({ frames });

    // Sequencing is deterministic and driven from outside, which is what makes
    // it testable without waiting in real time.
    expect(scheduler.current()).toBe('f0');
    expect(scheduler.current()).toBe('f0');
  });
});

describe('adaptive transport (§10)', () => {
  it('changes rate mid-transfer', () => {
    const scheduler = createFrameScheduler({ frames, rate: FrameRate.Balanced });

    scheduler.advance();
    scheduler.setRate(FrameRate.Fast);

    expect(scheduler.currentDuration()).toBe(100);
  });

  it('does not disturb the position when the rate changes', () => {
    const scheduler = createFrameScheduler({ frames });

    scheduler.advance();
    scheduler.advance();
    scheduler.setRate(FrameRate.Reliable);

    expect(scheduler.current()).toBe('f2');
  });

  it('accepts a duration finer than the presets', () => {
    const scheduler = createFrameScheduler({ frames });

    scheduler.setDuration(275);

    expect(scheduler.currentDuration()).toBe(275);
  });

  it.each([0, -1, MIN_FRAME_DURATION_MS - 1, MAX_FRAME_DURATION_MS + 1, Number.NaN])(
    'rejects an unusable duration of %p',
    (duration) => {
      expect(() => createFrameScheduler({ frames }).setDuration(duration)).toThrow(AppError);
    },
  );

  it('accepts the boundary durations', () => {
    const scheduler = createFrameScheduler({ frames });

    expect(() => scheduler.setDuration(MIN_FRAME_DURATION_MS)).not.toThrow();
    expect(() => scheduler.setDuration(MAX_FRAME_DURATION_MS)).not.toThrow();
  });

  it('never modifies packet contents — it only ever reads its frames (§10)', () => {
    const objects = [{ id: 0 }, { id: 1 }];
    const scheduler = createFrameScheduler({ frames: objects });

    scheduler.setRate(FrameRate.Fast);
    scheduler.advance();
    scheduler.setDuration(500);

    expect(objects).toEqual([{ id: 0 }, { id: 1 }]);
  });
});
