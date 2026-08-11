/**
 * Pipeline benchmark (PERF-003) — TRD §34; TEST_SPEC §7.
 *
 * Reports what a transfer costs: packets produced, frames encoded, bytes moved,
 * and the time each stage takes. Run it with `npm run benchmark`.
 *
 * **Excluded from the default suite**, by the `.bench.` in its name and
 * `testPathIgnorePatterns` in the Jest config. It encodes and decodes hundreds
 * of QR frames, which is a poor use of every pull request; the `npm run
 * benchmark` script overrides the exclusion.
 *
 * It runs under Jest rather than as a standalone script so it uses the module
 * aliases and TypeScript setup the rest of the project already has — a second
 * entry point would have meant a second toolchain and a new dependency for it.
 *
 * **This is a report, not a gate.** The performance *tests* in
 * `transferPerformance.test.ts` assert on machine-independent quantities
 * because TEST_SPEC §13 requires determinism; milliseconds belong here, where
 * a human compares runs on one machine. TRD §34's targets — memory under
 * 150 MB, CPU under 35%, battery under 15% — are device measurements this
 * cannot make, and it says so rather than printing a number that looks like one.
 */
import { createQrDecoder } from '@camera/qrDecoder';
import { PixelFormat, type CameraFrame } from '@camera/cameraPort';
import { createAppGraph } from '@config/appComposition';
import { rasterizeFrame } from '@qr/qrRenderer';
import type { QrFrame } from '@qr/qrEncoder';

interface StageTiming {
  readonly stage: string;
  readonly ms: number;
  readonly note: string;
}

function timed<T>(work: () => T): { readonly result: T; readonly ms: number } {
  const start = performance.now();
  const result = work();
  return { result, ms: performance.now() - start };
}

/** A reproducible payload with no short period, so nothing compresses away. */
function payload(byteLength: number, seed = 0x9e37): Uint8Array {
  let state = seed >>> 0;

  return Uint8Array.from({ length: byteLength }, () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state & 0xff;
  });
}

function captureOf(frame: QrFrame): CameraFrame {
  const raster = rasterizeFrame(frame, 3);

  return {
    width: raster.width,
    height: raster.height,
    format: PixelFormat.Rgba,
    data: raster.data,
    timestamp: 0,
  };
}

function run(byteLength: number, packetSize: number): void {
  const graph = createAppGraph();
  const content = payload(byteLength);
  const timings: StageTiming[] = [];

  graph.send.setPacketSize(packetSize);
  graph.send.addFiles([{ name: 'benchmark.bin', content }]);

  const prepare = timed(() => {
    graph.send.prepare();
    return graph.send.prepared();
  });

  const prepared = prepare.result;

  if (prepared === undefined) {
    throw new Error(graph.send.state.getState().errorMessage ?? 'Preparation failed.');
  }

  timings.push({
    stage: 'prepare',
    ms: prepare.ms,
    note: `${prepared.totalPackets} packets, ${prepared.frames.count} frames (frames are lazy)`,
  });

  // Encoding is deferred, so it is measured by walking the sequence — which is
  // also the only way to see the cost a display pays frame by frame.
  const encode = timed(() => [...prepared.frames]);
  timings.push({
    stage: 'encode',
    ms: encode.ms,
    note: `${(encode.ms / Math.max(1, prepared.frames.count)).toFixed(2)} ms per frame`,
  });

  const raster = timed(() => encode.result.map(captureOf));
  timings.push({
    stage: 'rasterize',
    ms: raster.ms,
    note: `${raster.result[0]?.width ?? 0} px square per frame`,
  });

  const decoder = createQrDecoder();
  const decode = timed(() => raster.result.filter((frame) => decoder.decode(frame).ok).length);
  timings.push({
    stage: 'decode',
    ms: decode.ms,
    note: `${decode.result}/${raster.result.length} frames read`,
  });

  const total = timings.reduce((sum, timing) => sum + timing.ms, 0);
  const throughput = total === 0 ? 0 : (byteLength / total) * 1000;

  console.log(`\n${byteLength} bytes, ${packetSize}-byte packets`);
  console.log('-'.repeat(72));

  for (const timing of timings) {
    console.log(
      `  ${timing.stage.padEnd(12)} ${timing.ms.toFixed(1).padStart(9)} ms   ${timing.note}`,
    );
  }

  console.log('-'.repeat(72));
  console.log(
    `  ${'total'.padEnd(12)} ${total.toFixed(1).padStart(9)} ms   ${(throughput / 1024).toFixed(1)} kB/s end to end`,
  );
}

describe('pipeline benchmark (PERF-003)', () => {
  it('reports the cost of a transfer at three sizes', () => {
    console.log('photon pipeline benchmark');
    console.log('Timings are for this machine. TRD §34 targets memory, CPU and');
    console.log('battery, which are device measurements and are not reported here.');

    for (const [byteLength, packetSize] of [
      [4 * 1024, 256],
      [16 * 1024, 512],
      [64 * 1024, 1024],
    ] as const) {
      run(byteLength, packetSize);
    }

    console.log('');

    // The assertion is only that the pipeline completed at every size. What
    // this file is for is the table above.
    expect(true).toBe(true);
  });
});
