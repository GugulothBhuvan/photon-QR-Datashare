/**
 * Adaptive timing (QR_SPEC §9, §10).
 *
 * §10 permits the sender to adapt transport parameters during a transfer, and
 * lists frame duration, QR version and error correction level among them. This
 * module decides *what* to adapt to, from observed transfer quality; the
 * scheduler applies the result.
 *
 * Two rules shape the design:
 *
 * - **§10: adaptive changes SHALL NOT modify packet contents.** Nothing here
 *   sees a packet. It reads counts of frames that decoded and frames that did
 *   not, and returns parameters.
 * - **Adaptation must not oscillate.** A policy that reacts to every frame
 *   would flip between rates on noise. This one decides on windows of observed
 *   frames and moves one step at a time.
 *
 * Pure and deterministic: same observations, same decision. No clock.
 */
import { ErrorCorrectionLevel } from './qrEncoder';
import { FrameRate, FRAME_DURATION_MS } from './frameScheduler';

/** Rates ordered from fastest to most reliable, the axis adaptation moves along. */
const RATE_LADDER: readonly FrameRate[] = Object.freeze([
  FrameRate.Fast,
  FrameRate.Balanced,
  FrameRate.Reliable,
]);

/** Error correction ordered from most capacity to most resilience (§7). */
const LEVEL_LADDER: readonly ErrorCorrectionLevel[] = Object.freeze([
  ErrorCorrectionLevel.Low,
  ErrorCorrectionLevel.Medium,
  ErrorCorrectionLevel.Quartile,
  ErrorCorrectionLevel.High,
]);

/**
 * How many frames must be observed before adapting.
 *
 * Small enough to react within a second or two at any rate, large enough that
 * a couple of missed frames does not trigger a change.
 */
export const ADAPTATION_WINDOW = 20;

/** Success ratio below which the link is treated as struggling. */
export const DEGRADE_THRESHOLD = 0.8;

/** Success ratio above which the link is treated as healthy enough to speed up. */
export const IMPROVE_THRESHOLD = 0.98;

/** What the receiver's decoding is achieving, as counted by the sender's peer. */
export interface TransportObservation {
  /** Frames that decoded successfully in this window. */
  readonly decoded: number;
  /** Frames that were displayed but did not decode. */
  readonly missed: number;
}

/** Transport parameters §10 permits adapting. */
export interface TransportParameters {
  readonly rate: FrameRate;
  readonly level: ErrorCorrectionLevel;
  /** Frame duration implied by the rate, in milliseconds (§9). */
  readonly durationMs: number;
}

/** Which way the policy moved, for diagnostics and tests. */
export const AdaptationDirection = {
  /** Slower and more resilient: the link is struggling. */
  Degrade: 'DEGRADE',
  /** Faster: the link has headroom. */
  Improve: 'IMPROVE',
  /** Not enough evidence, or already at a limit. */
  Hold: 'HOLD',
} as const;

export type AdaptationDirection = (typeof AdaptationDirection)[keyof typeof AdaptationDirection];

export interface AdaptationDecision {
  readonly parameters: TransportParameters;
  readonly direction: AdaptationDirection;
  /** Observed success ratio, or `undefined` when nothing was observed. */
  readonly successRatio: number | undefined;
}

/** Builds a parameter set, deriving the duration from the rate (§9). */
export function parametersFor(rate: FrameRate, level: ErrorCorrectionLevel): TransportParameters {
  return Object.freeze({ rate, level, durationMs: FRAME_DURATION_MS[rate] });
}

/** The starting point: balanced timing, medium error correction. */
export const DEFAULT_PARAMETERS: TransportParameters = parametersFor(
  FrameRate.Balanced,
  ErrorCorrectionLevel.Medium,
);

function step<T>(ladder: readonly T[], current: T, direction: 1 | -1): T {
  const index = ladder.indexOf(current);

  if (index < 0) {
    return current;
  }

  const next = index + direction;
  return next >= 0 && next < ladder.length ? (ladder[next] as T) : current;
}

/**
 * Decides the next transport parameters from what the link is achieving.
 *
 * Degrading moves one step slower **and** one step more resilient, because a
 * struggling optical link is usually short of both time and margin. Improving
 * moves only the rate: raising throughput is worth trying, but lowering error
 * correction gives up margin that was earning its place.
 *
 * @param current Parameters in use now.
 * @param observation Frames decoded and missed since the last decision.
 */
export function adapt(
  current: TransportParameters,
  observation: TransportObservation,
): AdaptationDecision {
  const total = observation.decoded + observation.missed;

  // Not enough evidence yet — reacting to a handful of frames would oscillate.
  if (total < ADAPTATION_WINDOW) {
    return Object.freeze({
      parameters: current,
      direction: AdaptationDirection.Hold,
      successRatio: total === 0 ? undefined : observation.decoded / total,
    });
  }

  const successRatio = observation.decoded / total;

  if (successRatio < DEGRADE_THRESHOLD) {
    const parameters = parametersFor(
      step(RATE_LADDER, current.rate, 1),
      step(LEVEL_LADDER, current.level, 1),
    );

    return Object.freeze({
      parameters,
      // Already at the slowest and most resilient: nothing left to give.
      direction:
        parameters.rate === current.rate && parameters.level === current.level
          ? AdaptationDirection.Hold
          : AdaptationDirection.Degrade,
      successRatio,
    });
  }

  if (successRatio >= IMPROVE_THRESHOLD) {
    const parameters = parametersFor(step(RATE_LADDER, current.rate, -1), current.level);

    return Object.freeze({
      parameters,
      direction:
        parameters.rate === current.rate ? AdaptationDirection.Hold : AdaptationDirection.Improve,
      successRatio,
    });
  }

  return Object.freeze({
    parameters: current,
    direction: AdaptationDirection.Hold,
    successRatio,
  });
}
