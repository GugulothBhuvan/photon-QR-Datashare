/**
 * Frame scheduler (QR-003) — QR_SPEC §8, §9, §10.
 *
 * Decides *which* frame is shown and *for how long*. §8 requires frames to be
 * displayed sequentially with packet ordering preserved; §9 requires
 * configurable frame durations; §10 permits parameters to be adapted during a
 * transfer without ever modifying packet contents.
 *
 * **The scheduler owns no timer.** It is a pure state machine: `advance()`
 * moves to the next frame and `currentDuration()` says how long the current one
 * should be shown. Whatever drives it — a render loop, a timer, a test — lives
 * outside. That keeps frame sequencing deterministic and testable without
 * waiting in real time, and it is the same reason the session manager holds no
 * timer.
 *
 * PROTOCOL_SPEC §11.11 permits the sender to loop packets continuously, and
 * §15.6 Strategy 1 makes that looping the default recovery mechanism — so
 * looping is the scheduler's normal mode, not an error path.
 */
import { AppError, ErrorCode } from '@core/errors';

import { QRSpeedPreference } from '@domain/settings';

/**
 * Frame duration presets (QR_SPEC §9).
 *
 * These are the specification's recommended defaults, not choices made here.
 */
export const FrameRate = {
  Fast: 'FAST',
  Balanced: 'BALANCED',
  Reliable: 'RELIABLE',
} as const;

export type FrameRate = (typeof FrameRate)[keyof typeof FrameRate];

/** Milliseconds per frame for each preset (§9). */
export const FRAME_DURATION_MS: Readonly<Record<FrameRate, number>> = Object.freeze({
  [FrameRate.Fast]: 100,
  [FrameRate.Balanced]: 200,
  [FrameRate.Reliable]: 350,
});

/**
 * The frame rate a user speed preference asks for.
 *
 * `QRSpeedPreference` is declared as a preference rather than a timing, and its
 * declaration places this mapping in the transport layer — which is here. The
 * two vocabularies are deliberately different: a user asks for "slow", and slow
 * is the *reliable* preset, because a longer-lived code is the one a struggling
 * camera can read (§9).
 */
export const FRAME_RATE_FOR_PREFERENCE: Readonly<Record<QRSpeedPreference, FrameRate>> =
  Object.freeze({
    [QRSpeedPreference.Slow]: FrameRate.Reliable,
    [QRSpeedPreference.Balanced]: FrameRate.Balanced,
    [QRSpeedPreference.Fast]: FrameRate.Fast,
  });

/** Bounds on an adapted duration, so adaptation cannot produce an unusable rate. */
export const MIN_FRAME_DURATION_MS = 16;
export const MAX_FRAME_DURATION_MS = 2000;

export interface SchedulerOptions<TFrame> {
  /**
   * Frames in packet order (§8).
   *
   * An array is copied. A `FrameSource` is used as given, which is how a lazy
   * source avoids holding every frame at once.
   */
  readonly frames: readonly TFrame[] | FrameSource<TFrame>;
  /** Starting rate. Defaults to Balanced (§9). */
  readonly rate?: FrameRate;
  /**
   * Whether to loop after the last frame.
   *
   * Defaults to `true`: PROTOCOL_SPEC §11.11 permits continuous looping and
   * §15.6 makes it the default recovery strategy.
   */
  readonly loop?: boolean;
}

/**
 * A sequence of frames the scheduler reads from.
 *
 * Introduced for Phase 10. An array is still accepted and still copied, but a
 * *source* lets frames be produced on demand: encoding every frame of a large
 * transfer up front holds one QR bitmap per packet in memory at once, which is
 * the single largest allocation in a transfer and the one that scales with
 * file size. TRD §34 caps memory at 150 MB, and a source is what makes that a
 * property of the window rather than of the file.
 *
 * Iterable so callers that walk the whole sequence — tests, a channel
 * simulator — read the same way whether the frames are eager or lazy.
 */
export interface FrameSource<TFrame> extends Iterable<TFrame> {
  /** How many frames the sequence holds. */
  readonly count: number;
  /** The frame at a position, or `undefined` when out of range. */
  at(index: number): TFrame | undefined;
}

/** Wraps an array as a frame source, copying it so a caller cannot reorder it. */
export function frameSourceOf<TFrame>(frames: readonly TFrame[]): FrameSource<TFrame> {
  // §8 requires packet ordering to be preserved, so the copy is not defensive
  // tidiness — a caller mutating its array mid-transmission would reorder the
  // packets a receiver is collecting.
  const held = Object.freeze([...frames]);

  return {
    count: held.length,
    at: (index) => held[index],
    [Symbol.iterator]: () => held[Symbol.iterator](),
  };
}

/**
 * Builds a source that produces each frame on first request and remembers only
 * the most recent few.
 *
 * @param count How many frames the sequence holds.
 * @param produce Builds the frame at a position. Called at most once per
 *   position while that frame stays in the window.
 * @param windowSize How many produced frames to retain. Small: a display shows
 *   one frame at a time, and the previous one is worth keeping only because a
 *   pause and resume revisits it.
 */
export function lazyFrameSource<TFrame>(
  count: number,
  produce: (index: number) => TFrame,
  windowSize = 4,
): FrameSource<TFrame> {
  if (!Number.isInteger(count) || count < 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'Frame count must be a non-negative integer.',
      {
        details: { count },
      },
    );
  }

  const cache = new Map<number, TFrame>();

  function at(index: number): TFrame | undefined {
    if (index < 0 || index >= count) {
      return undefined;
    }

    const cached = cache.get(index);

    if (cached !== undefined) {
      // Re-inserted so the most recently used entry is last, which is what
      // makes the eviction below least-recently-used rather than arbitrary.
      cache.delete(index);
      cache.set(index, cached);
      return cached;
    }

    const frame = produce(index);
    cache.set(index, frame);

    while (cache.size > windowSize) {
      const oldest = cache.keys().next();

      if (oldest.done === true) {
        break;
      }

      cache.delete(oldest.value);
    }

    return frame;
  }

  return {
    count,
    at,
    *[Symbol.iterator]() {
      for (let index = 0; index < count; index += 1) {
        // Non-null: `index` is in range by construction.
        yield at(index) as TFrame;
      }
    },
  };
}

/** A scheduler's observable state, for progress reporting and tests. */
export interface SchedulerState {
  readonly index: number;
  readonly frameCount: number;
  /** How many complete passes have been made over the frame list. */
  readonly loops: number;
  readonly durationMs: number;
  /** Whether the last frame of a non-looping schedule has been shown. */
  readonly finished: boolean;
}

export interface FrameScheduler<TFrame> {
  /** The frame to display now, or `undefined` when there are none. */
  current(): TFrame | undefined;

  /** Position, loop count and timing. */
  state(): SchedulerState;

  /** How long the current frame should be displayed, in milliseconds (§9). */
  currentDuration(): number;

  /**
   * Moves to the next frame in packet order (§8).
   *
   * @returns The frame now current, or `undefined` if the schedule has
   *   finished and does not loop.
   */
  advance(): TFrame | undefined;

  /** Restarts at the first frame without changing timing or the frame list. */
  reset(): void;

  /**
   * Changes the frame rate mid-transfer (§10).
   *
   * Adaptive changes SHALL NOT modify packet contents — and cannot here, since
   * the scheduler only ever reads the frames it was given.
   */
  setRate(rate: FrameRate): void;

  /** Sets an explicit duration, for adaptation finer than the presets (§10). */
  setDuration(durationMs: number): void;
}

/**
 * Creates a frame scheduler.
 *
 * @param options Frames in packet order, and the starting rate.
 */
export function createFrameScheduler<TFrame>(
  options: SchedulerOptions<TFrame>,
): FrameScheduler<TFrame> {
  // An array is wrapped (and copied); a source is used as given, because a
  // lazy source exists precisely so its frames are not all held at once.
  const frames: FrameSource<TFrame> = Array.isArray(options.frames)
    ? frameSourceOf(options.frames)
    : (options.frames as FrameSource<TFrame>);
  const loop = options.loop ?? true;

  let durationMs = FRAME_DURATION_MS[options.rate ?? FrameRate.Balanced];
  let index = 0;
  let loops = 0;
  let finished = frames.count === 0;

  function assertDuration(value: number): void {
    if (!Number.isFinite(value) || value < MIN_FRAME_DURATION_MS || value > MAX_FRAME_DURATION_MS) {
      throw new AppError(
        ErrorCode.INVALID_CONFIGURATION,
        `Frame duration must be between ${MIN_FRAME_DURATION_MS} and ${MAX_FRAME_DURATION_MS} ms.`,
        { details: { durationMs: value } },
      );
    }
  }

  return {
    current() {
      return frames.at(index);
    },

    state() {
      return Object.freeze({
        index,
        frameCount: frames.count,
        loops,
        durationMs,
        finished,
      });
    },

    currentDuration() {
      return durationMs;
    },

    advance() {
      if (frames.count === 0) {
        return undefined;
      }

      if (index + 1 < frames.count) {
        index += 1;
        return frames.at(index);
      }

      if (!loop) {
        finished = true;
        return undefined;
      }

      // §11.11: the sender MAY loop packets until the transfer completes.
      index = 0;
      loops += 1;
      return frames.at(index);
    },

    reset() {
      index = 0;
      loops = 0;
      finished = frames.count === 0;
    },

    setRate(rate) {
      durationMs = FRAME_DURATION_MS[rate];
    },

    setDuration(value) {
      assertDuration(value);
      durationMs = value;
    },
  };
}
