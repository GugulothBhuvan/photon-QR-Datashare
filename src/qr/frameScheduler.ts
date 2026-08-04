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

/** Bounds on an adapted duration, so adaptation cannot produce an unusable rate. */
export const MIN_FRAME_DURATION_MS = 16;
export const MAX_FRAME_DURATION_MS = 2000;

export interface SchedulerOptions<TFrame> {
  /** Frames in packet order (§8). */
  readonly frames: readonly TFrame[];
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
  // Copied so a caller mutating its array cannot reorder a live transmission —
  // §8 requires packet ordering to be preserved.
  const frames = Object.freeze([...options.frames]);
  const loop = options.loop ?? true;

  let durationMs = FRAME_DURATION_MS[options.rate ?? FrameRate.Balanced];
  let index = 0;
  let loops = 0;
  let finished = frames.length === 0;

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
      return frames[index];
    },

    state() {
      return Object.freeze({
        index,
        frameCount: frames.length,
        loops,
        durationMs,
        finished,
      });
    },

    currentDuration() {
      return durationMs;
    },

    advance() {
      if (frames.length === 0) {
        return undefined;
      }

      if (index + 1 < frames.length) {
        index += 1;
        return frames[index];
      }

      if (!loop) {
        finished = true;
        return undefined;
      }

      // §11.11: the sender MAY loop packets until the transfer completes.
      index = 0;
      loops += 1;
      return frames[index];
    },

    reset() {
      index = 0;
      loops = 0;
      finished = frames.length === 0;
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
