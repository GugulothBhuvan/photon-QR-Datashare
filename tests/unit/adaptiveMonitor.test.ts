/**
 * Adaptive transport monitor (PERF-004) — TRD §25; QR_SPEC §10.
 *
 * §25 names four signals the monitor must watch and three responses it may
 * make. These tests hold it to both: that every signal is counted, and that a
 * response only happens on evidence.
 */
import {
  createAdaptiveMonitor,
  FrameObservation,
  DUPLICATE_HEADROOM_RATIO,
} from '@qr/adaptiveMonitor';
import {
  AdaptationDirection,
  ADAPTATION_WINDOW,
  DEFAULT_PARAMETERS,
  parametersFor,
} from '@qr/adaptiveTiming';
import { ErrorCorrectionLevel } from '@qr/qrEncoder';
import { FrameRate, FRAME_DURATION_MS } from '@qr/frameScheduler';

function observe(
  monitor: ReturnType<typeof createAdaptiveMonitor>,
  observation: FrameObservation,
  times: number,
  latencyMs?: number,
): void {
  for (let index = 0; index < times; index += 1) {
    monitor.observe(observation, latencyMs);
  }
}

describe('monitoring (§25)', () => {
  it('starts from balanced timing and medium correction', () => {
    const monitor = createAdaptiveMonitor();

    expect(monitor.parameters()).toEqual(DEFAULT_PARAMETERS);
    expect(monitor.window().total).toBe(0);
  });

  it('counts scan successes, misses and duplicates separately', () => {
    // §25 lists scan success and duplicate rate as distinct signals, so
    // collapsing them would lose one of the four things it requires.
    const monitor = createAdaptiveMonitor();

    observe(monitor, FrameObservation.Decoded, 5);
    observe(monitor, FrameObservation.Duplicate, 3);
    observe(monitor, FrameObservation.Missed, 2);

    expect(monitor.window()).toMatchObject({
      decoded: 5,
      duplicates: 3,
      missed: 2,
      total: 10,
    });
  });

  it('averages decode latency across the frames that reported one', () => {
    const monitor = createAdaptiveMonitor();

    monitor.observe(FrameObservation.Decoded, 10);
    monitor.observe(FrameObservation.Decoded, 30);
    // No latency supplied: it must not count as zero and drag the mean down.
    monitor.observe(FrameObservation.Decoded);

    expect(monitor.window().meanLatencyMs).toBe(20);
  });

  it('reports no latency when none was measured', () => {
    const monitor = createAdaptiveMonitor();
    observe(monitor, FrameObservation.Decoded, 3);

    expect(monitor.window().meanLatencyMs).toBeUndefined();
  });

  it('ignores a nonsensical latency rather than corrupting the mean', () => {
    const monitor = createAdaptiveMonitor();

    monitor.observe(FrameObservation.Decoded, 10);
    monitor.observe(FrameObservation.Decoded, Number.NaN);
    monitor.observe(FrameObservation.Decoded, -5);

    expect(monitor.window().meanLatencyMs).toBe(10);
  });
});

describe('deciding (§25, §10)', () => {
  it('holds until there is enough evidence', () => {
    const monitor = createAdaptiveMonitor();

    observe(monitor, FrameObservation.Missed, ADAPTATION_WINDOW - 1);

    // Reacting to a handful of frames would oscillate — a hand passing over
    // the code would permanently slow the transfer.
    expect(monitor.decide().direction).toBe(AdaptationDirection.Hold);
    expect(monitor.parameters()).toEqual(DEFAULT_PARAMETERS);
  });

  it('keeps accumulating when a decision was not made', () => {
    // The window must survive an early `decide`, or a caller polling often
    // would never gather enough evidence to act on.
    const monitor = createAdaptiveMonitor();

    observe(monitor, FrameObservation.Missed, 10);
    monitor.decide();
    observe(monitor, FrameObservation.Missed, 10);

    expect(monitor.window().total).toBe(20);
    expect(monitor.decide().direction).toBe(AdaptationDirection.Degrade);
  });

  it('slows down and adds resilience when frames are being missed (§25)', () => {
    const monitor = createAdaptiveMonitor();

    observe(monitor, FrameObservation.Decoded, 5);
    observe(monitor, FrameObservation.Missed, 15);

    const decision = monitor.decide();

    expect(decision.direction).toBe(AdaptationDirection.Degrade);
    // §25 permits reducing FPS and increasing redundancy; a struggling link is
    // usually short of both time and margin.
    expect(decision.parameters.durationMs).toBeGreaterThan(DEFAULT_PARAMETERS.durationMs);
    expect(decision.parameters.level).toBe(ErrorCorrectionLevel.Quartile);
  });

  it('speeds up when almost everything is being read', () => {
    const monitor = createAdaptiveMonitor();

    observe(monitor, FrameObservation.Decoded, ADAPTATION_WINDOW);

    const decision = monitor.decide();

    expect(decision.direction).toBe(AdaptationDirection.Improve);
    expect(decision.parameters.rate).toBe(FrameRate.Fast);
    // Improving raises throughput but does not give back error correction that
    // was earning its place.
    expect(decision.parameters.level).toBe(DEFAULT_PARAMETERS.level);
  });

  it('treats duplicates as evidence the link is healthy, not as failures', () => {
    // A duplicate means the frame was captured and decoded — it simply arrived
    // twice, which is what §11.11 looping produces. Counting it as a failure
    // would make the default recovery strategy look like a broken link and
    // slow every transfer down.
    const monitor = createAdaptiveMonitor();

    observe(monitor, FrameObservation.Duplicate, ADAPTATION_WINDOW);

    expect(monitor.decide().direction).toBe(AdaptationDirection.Improve);
  });

  it('clears the window once it has acted', () => {
    const monitor = createAdaptiveMonitor();

    observe(monitor, FrameObservation.Missed, ADAPTATION_WINDOW);
    monitor.decide();

    // Keeping the old evidence would make the next decision act on frames
    // already answered, and adapt twice for one problem.
    expect(monitor.window().total).toBe(0);
  });

  it('adapts step by step rather than jumping to the extreme', () => {
    const monitor = createAdaptiveMonitor();

    observe(monitor, FrameObservation.Missed, ADAPTATION_WINDOW);
    const first = monitor.decide();

    observe(monitor, FrameObservation.Missed, ADAPTATION_WINDOW);
    const second = monitor.decide();

    expect(first.parameters.rate).toBe(FrameRate.Reliable);
    expect(first.parameters.level).toBe(ErrorCorrectionLevel.Quartile);

    // Already at the slowest rate; only correction has anywhere left to go.
    expect(second.parameters.rate).toBe(FrameRate.Reliable);
    expect(second.parameters.level).toBe(ErrorCorrectionLevel.High);
  });

  it('holds once there is nothing left to give', () => {
    const monitor = createAdaptiveMonitor({
      initial: parametersFor(FrameRate.Reliable, ErrorCorrectionLevel.High),
    });

    observe(monitor, FrameObservation.Missed, ADAPTATION_WINDOW);

    const decision = monitor.decide();

    // Reporting Degrade while changing nothing would tell a screen to show a
    // message about an adjustment that did not happen.
    expect(decision.direction).toBe(AdaptationDirection.Hold);
    expect(decision.parameters.durationMs).toBe(FRAME_DURATION_MS[FrameRate.Reliable]);
  });

  it('returns to its starting point on reset', () => {
    const monitor = createAdaptiveMonitor();

    observe(monitor, FrameObservation.Missed, ADAPTATION_WINDOW);
    monitor.decide();
    monitor.reset();

    expect(monitor.parameters()).toEqual(DEFAULT_PARAMETERS);
    expect(monitor.window().total).toBe(0);
  });

  it('never modifies packet contents — it has none to modify (§10)', () => {
    // §10 forbids adaptation from changing packets. The monitor is structurally
    // incapable: it counts observations and returns parameters, and no packet
    // or payload is reachable from it.
    const monitor = createAdaptiveMonitor();
    observe(monitor, FrameObservation.Missed, ADAPTATION_WINDOW);

    const decision = monitor.decide();

    expect(Object.keys(decision.parameters).sort()).toEqual(['durationMs', 'level', 'rate']);
  });

  it('exposes a duplicate-headroom threshold callers can reason about', () => {
    expect(DUPLICATE_HEADROOM_RATIO).toBeGreaterThan(0);
    expect(DUPLICATE_HEADROOM_RATIO).toBeLessThan(1);
  });
});
