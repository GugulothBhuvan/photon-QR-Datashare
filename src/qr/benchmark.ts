/**
 * QR generation benchmark (QR-004).
 *
 * Measures how long encoding takes, so that a frame rate can be chosen with
 * evidence rather than hope. QR_SPEC §9's fastest preset is 100 ms per frame,
 * and AGENTS.md §11 forbids blocking the UI thread — if encoding a packet takes
 * longer than its frame is displayed, the transport cannot keep up and the
 * problem is worth knowing about before it reaches a user.
 *
 * The clock is injected, so this is a measurement *harness*, not a source of
 * wall-clock dependence: a test can drive it with a fake clock and assert on
 * the arithmetic, while a real run passes `performance.now`.
 *
 * Deliberately not a performance *test*. Timing assertions on shared CI
 * hardware are flaky, and Phase 10 owns performance targets. This produces
 * numbers; it does not judge them.
 */
import type { Clock } from '@core/contracts';

import { ErrorCorrectionLevel, type QrEncoder } from './qrEncoder';

/** One measured configuration. */
export interface BenchmarkSample {
  readonly payloadBytes: number;
  readonly level: ErrorCorrectionLevel;
  readonly iterations: number;
  /** Total elapsed milliseconds across all iterations. */
  readonly totalMs: number;
  /** Mean milliseconds per encode. */
  readonly meanMs: number;
  /** Encodes per second, derived from the mean. */
  readonly framesPerSecond: number;
  /** QR version the encoder selected (§6). */
  readonly version: number;
  /** Modules per side, which is what a display has to resolve. */
  readonly moduleCount: number;
}

export interface BenchmarkOptions {
  /** Payload sizes to measure, in bytes. */
  readonly payloadSizes?: readonly number[];
  /** Error correction levels to measure (§7). */
  readonly levels?: readonly ErrorCorrectionLevel[];
  /** Encodes per configuration. More iterations, less noise. */
  readonly iterations?: number;
}

/**
 * Default payload sizes.
 *
 * Chosen around the packet layer's shape: a 50-byte header alone, then typical
 * and large payloads, then a size near the medium-level capacity limit.
 */
export const DEFAULT_PAYLOAD_SIZES: readonly number[] = Object.freeze([50, 256, 512, 1024, 2048]);

/** Deterministic filler, so payload content never varies between runs. */
function payloadOf(size: number): Uint8Array {
  return Uint8Array.from({ length: size }, (_unused, index) => (index * 31) & 0xff);
}

/**
 * Measures encoding across payload sizes and error correction levels.
 *
 * @param encoder The encoder under measurement.
 * @param clock Source of elapsed time. Injected for determinism under test.
 */
export function benchmarkEncoding(
  encoder: QrEncoder,
  clock: Clock,
  options: BenchmarkOptions = {},
): readonly BenchmarkSample[] {
  const payloadSizes = options.payloadSizes ?? DEFAULT_PAYLOAD_SIZES;
  const levels = options.levels ?? [ErrorCorrectionLevel.Medium];
  const iterations = Math.max(1, options.iterations ?? 20);
  const samples: BenchmarkSample[] = [];

  for (const level of levels) {
    const capacity = encoder.capacityFor(level);

    for (const payloadBytes of payloadSizes) {
      // Skip configurations the level cannot carry rather than recording a
      // failure as if it were a measurement.
      if (payloadBytes > capacity) {
        continue;
      }

      const payload = payloadOf(payloadBytes);

      // One encode outside the measurement, so the first sample does not pay
      // for lazily-initialised tables inside the library.
      const warm = encoder.encode(payload, { level });

      const started = clock.now();
      for (let i = 0; i < iterations; i += 1) {
        encoder.encode(payload, { level });
      }
      const totalMs = clock.now() - started;
      const meanMs = totalMs / iterations;

      samples.push(
        Object.freeze({
          payloadBytes,
          level,
          iterations,
          totalMs,
          meanMs,
          framesPerSecond: meanMs > 0 ? 1000 / meanMs : Number.POSITIVE_INFINITY,
          version: warm.version,
          moduleCount: warm.size,
        }),
      );
    }
  }

  return Object.freeze(samples);
}

/** Formats samples as a table, for a benchmark script's output. */
export function formatBenchmark(samples: readonly BenchmarkSample[]): string {
  const header = 'bytes\tlevel\tversion\tmodules\tmean ms\tframes/s';
  const rows = samples.map(
    (sample) =>
      `${sample.payloadBytes}\t${sample.level}\t${sample.version}\t${sample.moduleCount}\t` +
      `${sample.meanMs.toFixed(3)}\t${sample.framesPerSecond.toFixed(1)}`,
  );

  return [header, ...rows].join('\n');
}
