/**
 * Adaptive transport monitor (PERF-004) — TRD §25; QR_SPEC §10.
 *
 * TRD §25 requires adaptive mode to monitor four things — scan success, blur,
 * decode latency and duplicate rate — and permits it to reduce FPS, enlarge the
 * code or increase redundancy in response.
 *
 * This module is the *monitoring* half. It accumulates what a receiver observes
 * frame by frame and, once there is enough evidence, hands it to `adapt` in
 * `adaptiveTiming.ts`, which owns the policy. Splitting them keeps the policy
 * pure and testable without a camera, and keeps counting out of the decision.
 *
 * **Where the recommendation goes.** OSP/1.0 has no back-channel: the optical
 * link runs one way, so a receiver cannot tell a sender to slow down. The
 * monitor therefore produces a *recommendation*, and who acts on it is the
 * caller's business — the receive screen shows it, and a user changes the
 * sender's speed. Inventing a return path would be inventing protocol
 * (AGENTS.md §7); recorded as SI-010.
 *
 * No clock and no timer. Latency is supplied per frame by whoever measured it,
 * so the whole module stays deterministic under test.
 */
import {
  adapt,
  AdaptationDirection,
  DEFAULT_PARAMETERS,
  type AdaptationDecision,
  type TransportParameters,
} from './adaptiveTiming';

/** What happened to one observed frame, in the monitor's vocabulary. */
export const FrameObservation = {
  /** A frame decoded and yielded a new packet. */
  Decoded: 'DECODED',
  /** A frame decoded but carried a packet already held — §25's duplicate rate. */
  Duplicate: 'DUPLICATE',
  /** A frame arrived and could not be read: blur, motion, exposure (§25). */
  Missed: 'MISSED',
} as const;

export type FrameObservation = (typeof FrameObservation)[keyof typeof FrameObservation];

/** What the monitor has counted since the last decision. */
export interface MonitorWindow {
  readonly decoded: number;
  readonly duplicates: number;
  readonly missed: number;
  /** Mean decode latency in milliseconds, or `undefined` if none was supplied. */
  readonly meanLatencyMs: number | undefined;
  /** Frames observed, of every kind. */
  readonly total: number;
}

/**
 * A duplicate rate above which the link is treated as having headroom.
 *
 * §25 lists duplicate rate as a signal but not what to do with it. A high
 * duplicate rate means the receiver is reading the same frame repeatedly —
 * it is keeping up comfortably and the sender could go faster. This threshold
 * is an implementation choice, recorded as A13-01.
 */
export const DUPLICATE_HEADROOM_RATIO = 0.5;

export interface AdaptiveMonitor {
  /**
   * Records one observed frame.
   *
   * @param latencyMs How long the decode attempt took, if measured (§25).
   */
  observe(observation: FrameObservation, latencyMs?: number): void;

  /** What has been counted since the last decision. */
  window(): MonitorWindow;

  /** The parameters currently believed best. */
  parameters(): TransportParameters;

  /**
   * Decides whether to adapt, and clears the window if it did.
   *
   * The window is cleared only on a real decision, so evidence accumulates
   * across calls rather than being thrown away by a caller that asked early.
   */
  decide(): AdaptationDecision;

  /** Forgets every observation and returns to the starting parameters. */
  reset(): void;
}

export interface AdaptiveMonitorOptions {
  /** Parameters to start from. Defaults to balanced timing, medium correction. */
  readonly initial?: TransportParameters;
}

export function createAdaptiveMonitor(options: AdaptiveMonitorOptions = {}): AdaptiveMonitor {
  const initial = options.initial ?? DEFAULT_PARAMETERS;

  let current = initial;
  let decoded = 0;
  let duplicates = 0;
  let missed = 0;
  let latencyTotal = 0;
  let latencySamples = 0;

  function snapshot(): MonitorWindow {
    return Object.freeze({
      decoded,
      duplicates,
      missed,
      meanLatencyMs: latencySamples === 0 ? undefined : latencyTotal / latencySamples,
      total: decoded + duplicates + missed,
    });
  }

  function clear(): void {
    decoded = 0;
    duplicates = 0;
    missed = 0;
    latencyTotal = 0;
    latencySamples = 0;
  }

  return {
    observe(observation, latencyMs) {
      if (observation === FrameObservation.Decoded) {
        decoded += 1;
      } else if (observation === FrameObservation.Duplicate) {
        duplicates += 1;
      } else {
        missed += 1;
      }

      if (latencyMs !== undefined && Number.isFinite(latencyMs) && latencyMs >= 0) {
        latencyTotal += latencyMs;
        latencySamples += 1;
      }
    },

    window: snapshot,

    parameters() {
      return current;
    },

    decide() {
      // A duplicate is a *successful* read for the purpose of judging the link:
      // the frame was captured and decoded. It just arrived twice, which is
      // what §11.11 looping produces and is evidence the link is healthy.
      const decision = adapt(current, { decoded: decoded + duplicates, missed });

      if (decision.direction === AdaptationDirection.Hold) {
        return decision;
      }

      current = decision.parameters;
      clear();

      return decision;
    },

    reset() {
      current = initial;
      clear();
    },
  };
}
