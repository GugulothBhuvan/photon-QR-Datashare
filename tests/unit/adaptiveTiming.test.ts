/**
 * Adaptive timing and the encoding benchmark (QR-004) — QR_SPEC §9, §10.
 */
import type { Clock } from '@core/contracts';
import {
  adapt,
  AdaptationDirection,
  ADAPTATION_WINDOW,
  DEFAULT_PARAMETERS,
  parametersFor,
} from '@qr/adaptiveTiming';
import { benchmarkEncoding, formatBenchmark } from '@qr/benchmark';
import { FrameRate } from '@qr/frameScheduler';
import { createQrEncoder, ErrorCorrectionLevel } from '@qr/qrEncoder';

const full = (decoded: number): { decoded: number; missed: number } => ({
  decoded,
  missed: ADAPTATION_WINDOW - decoded,
});

describe('adapt (§10)', () => {
  it('holds until enough frames have been observed', () => {
    // Reacting to a handful of frames would oscillate on noise.
    const decision = adapt(DEFAULT_PARAMETERS, { decoded: 1, missed: 4 });

    expect(decision.direction).toBe(AdaptationDirection.Hold);
    expect(decision.parameters).toEqual(DEFAULT_PARAMETERS);
  });

  it('reports no ratio when nothing was observed', () => {
    expect(adapt(DEFAULT_PARAMETERS, { decoded: 0, missed: 0 }).successRatio).toBeUndefined();
  });

  it('degrades one step in both rate and error correction when struggling', () => {
    const decision = adapt(DEFAULT_PARAMETERS, full(10));

    expect(decision.direction).toBe(AdaptationDirection.Degrade);
    expect(decision.parameters.rate).toBe(FrameRate.Reliable);
    expect(decision.parameters.level).toBe(ErrorCorrectionLevel.Quartile);
  });

  it('improves rate only, keeping the error correction that was earning its place', () => {
    const decision = adapt(DEFAULT_PARAMETERS, full(ADAPTATION_WINDOW));

    expect(decision.direction).toBe(AdaptationDirection.Improve);
    expect(decision.parameters.rate).toBe(FrameRate.Fast);
    expect(decision.parameters.level).toBe(DEFAULT_PARAMETERS.level);
  });

  it('holds in the band between the thresholds', () => {
    // 90%: not struggling, not clean enough to push.
    const decision = adapt(DEFAULT_PARAMETERS, full(18));

    expect(decision.direction).toBe(AdaptationDirection.Hold);
    expect(decision.parameters).toEqual(DEFAULT_PARAMETERS);
  });

  it('holds at the slow end rather than reporting a change it cannot make', () => {
    const slowest = parametersFor(FrameRate.Reliable, ErrorCorrectionLevel.High);
    const decision = adapt(slowest, full(0));

    expect(decision.direction).toBe(AdaptationDirection.Hold);
    expect(decision.parameters).toEqual(slowest);
  });

  it('holds at the fast end', () => {
    const fastest = parametersFor(FrameRate.Fast, ErrorCorrectionLevel.Medium);
    const decision = adapt(fastest, full(ADAPTATION_WINDOW));

    expect(decision.direction).toBe(AdaptationDirection.Hold);
    expect(decision.parameters).toEqual(fastest);
  });

  it('derives the duration from the rate (§9)', () => {
    expect(parametersFor(FrameRate.Fast, ErrorCorrectionLevel.Low).durationMs).toBe(100);
    expect(parametersFor(FrameRate.Reliable, ErrorCorrectionLevel.Low).durationMs).toBe(350);
  });

  it('is deterministic and frozen', () => {
    const first = adapt(DEFAULT_PARAMETERS, full(10));
    const second = adapt(DEFAULT_PARAMETERS, full(10));

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parameters)).toBe(true);
  });

  it('converges rather than oscillating on a steady bad link', () => {
    let parameters = DEFAULT_PARAMETERS;
    const seen: string[] = [];

    for (let round = 0; round < 6; round += 1) {
      parameters = adapt(parameters, full(4)).parameters;
      seen.push(`${parameters.rate}/${parameters.level}`);
    }

    // It reaches the slowest, most resilient setting and stays there.
    expect(seen[seen.length - 1]).toBe(`${FrameRate.Reliable}/${ErrorCorrectionLevel.High}`);
    expect(seen[4]).toBe(seen[5]);
  });
});

describe('benchmarkEncoding (QR-004)', () => {
  const encoder = createQrEncoder();

  /** A clock that advances a fixed amount per reading, so timing is exact. */
  function fakeClock(stepMs: number): Clock {
    let current = 0;
    return {
      now: () => {
        const value = current;
        current += stepMs;
        return value;
      },
    };
  }

  it('measures each payload size', () => {
    const samples = benchmarkEncoding(encoder, fakeClock(5), {
      payloadSizes: [50, 256],
      iterations: 4,
    });

    expect(samples.map((sample) => sample.payloadBytes)).toEqual([50, 256]);
  });

  it('computes the mean and rate from the elapsed time', () => {
    // Each clock reading advances 10 ms, so one start/end pair spans 10 ms.
    const samples = benchmarkEncoding(encoder, fakeClock(10), {
      payloadSizes: [50],
      iterations: 5,
    });

    expect(samples[0]?.totalMs).toBe(10);
    expect(samples[0]?.meanMs).toBe(2);
    expect(samples[0]?.framesPerSecond).toBe(500);
  });

  it('records the version and module count the encoder chose', () => {
    const samples = benchmarkEncoding(encoder, fakeClock(1), { payloadSizes: [50] });

    expect(samples[0]?.version).toBeGreaterThan(0);
    expect(samples[0]?.moduleCount).toBeGreaterThan(20);
  });

  it('skips configurations the level cannot carry rather than recording a failure', () => {
    const samples = benchmarkEncoding(encoder, fakeClock(1), {
      payloadSizes: [100, 2000],
      levels: [ErrorCorrectionLevel.High],
      iterations: 2,
    });

    // High correction carries 1273 bytes, so 2000 is skipped.
    expect(samples.map((sample) => sample.payloadBytes)).toEqual([100]);
  });

  it('measures multiple levels', () => {
    const samples = benchmarkEncoding(encoder, fakeClock(1), {
      payloadSizes: [50],
      levels: [ErrorCorrectionLevel.Low, ErrorCorrectionLevel.High],
      iterations: 2,
    });

    expect(samples.map((sample) => sample.level)).toEqual(['L', 'H']);
  });

  it('formats samples as a table', () => {
    const samples = benchmarkEncoding(encoder, fakeClock(1), {
      payloadSizes: [50],
      iterations: 2,
    });
    const table = formatBenchmark(samples);

    expect(table.split('\n')).toHaveLength(2);
    expect(table).toContain('frames/s');
  });

  it('is frozen', () => {
    const samples = benchmarkEncoding(encoder, fakeClock(1), { payloadSizes: [50] });

    expect(Object.isFrozen(samples)).toBe(true);
    expect(Object.isFrozen(samples[0])).toBe(true);
  });
});
