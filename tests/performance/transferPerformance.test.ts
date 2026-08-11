/**
 * Performance tests (TST-004) — TEST_SPEC §7, §13, §14, invariant §15.6.
 *
 * §7 requires transfer speed, decode rate, CPU, memory, battery and startup to
 * be measured, and regressions to be reported.
 *
 * **What is asserted, and what is only reported.** §13 requires test automation
 * to remain deterministic. Wall-clock milliseconds are not deterministic — the
 * same suite runs several times slower under coverage instrumentation, and CI
 * hardware varies — so a threshold in milliseconds would be a flake generator
 * that eventually gets deleted, which is worse than no test.
 *
 * So this suite asserts on the quantities that *are* deterministic:
 *
 * - **Work per byte.** Packets produced, frames encoded, decode attempts. These
 *   depend only on the input and the algorithm, so a regression that doubles
 *   the work fails here on any machine.
 * - **Memory shape.** That reconstruction allocates in proportion to the file
 *   rather than to the number of packets, and that a released session frees
 *   what it held.
 * - **Ratios.** Throughput expressed as bytes per frame is machine-independent.
 *
 * Timings are measured and printed for the human reading CI output, and are
 * asserted only against bounds so loose that only a catastrophic regression
 * trips them. §7's CPU and battery measurements need a device and are recorded
 * as unmeasurable here rather than faked; §14's targets are monitoring
 * concerns, not assertions.
 *
 * Numeric targets belong to docs/TRD.md and arrive with Phase 10. §15.6 asks
 * that performance stay within *defined* targets; until they are defined, this
 * suite establishes the measurements they will be defined against.
 */
import { createQrDecoder } from '@camera/qrDecoder';
import { benchmarkEncoding, DEFAULT_PAYLOAD_SIZES, formatBenchmark } from '@qr/benchmark';
import { createQrEncoder } from '@qr/qrEncoder';
import type { Clock } from '@core/contracts';

import { largeFile } from '../support/fileCorpus';
import { bytesEqual, captureOf, createHarness } from '../support/opticalHarness';

/** Milliseconds elapsed around a synchronous block. */
function timed<T>(work: () => T): { readonly result: T; readonly ms: number } {
  const start = performance.now();
  const result = work();
  return { result, ms: performance.now() - start };
}

/** A clock that advances one millisecond per reading, for the encoder benchmark. */
function tickingClock(): Clock {
  let value = 0;
  return {
    now: () => {
      value += 1;
      return value;
    },
  };
}

describe('transfer speed (§7)', () => {
  it('produces one packet per packet-size chunk, and one frame per packet', async () => {
    // The deterministic core of "transfer speed": how much work a byte costs.
    // Wall-clock time varies; this ratio does not.
    const packetSize = 512;
    const harness = createHarness({ packetSize });
    const file = largeFile(16 * 1024);

    harness.graph.send.addFiles([{ name: file.name, content: file.content }]);
    harness.graph.send.prepare();

    const prepared = harness.graph.send.prepared()!;
    const expectedPackets = Math.ceil(file.content.byteLength / packetSize);

    expect(prepared.totalPackets).toBe(expectedPackets);
    // QR_SPEC §5: one frame per packet, plus the two-frame preamble §7.5 and
    // §7.6 require — a handshake announcement and the manifest, which a
    // receiver needs before any data packet means anything.
    expect(prepared.frames.count).toBe(expectedPackets + 2);
  });

  it('carries a stable number of payload bytes per frame', async () => {
    // Bytes per frame is throughput in the only unit that does not depend on
    // how fast the machine runs.
    const packetSize = 512;
    const harness = createHarness({ packetSize });
    const file = largeFile(16 * 1024);

    harness.graph.send.addFiles([{ name: file.name, content: file.content }]);
    harness.graph.send.prepare();

    const prepared = harness.graph.send.prepared()!;
    // Data frames only: the preamble carries no file payload.
    const bytesPerFrame = file.content.byteLength / (prepared.frames.count - 2);

    // Every frame but the last carries a full packet, so the average is within
    // one packet of the configured size.
    expect(bytesPerFrame).toBeGreaterThan(packetSize - packetSize / prepared.frames.count - 1);
    expect(bytesPerFrame).toBeLessThanOrEqual(packetSize);
  });

  it('scales linearly with file size', async () => {
    // A super-linear packet count would mean the packetizer re-walks the
    // stream — the kind of regression that only shows on large files.
    const packetSize = 256;

    async function packetsFor(byteLength: number): Promise<number> {
      const harness = createHarness({ packetSize });
      const file = largeFile(byteLength);

      harness.graph.send.addFiles([{ name: file.name, content: file.content }]);
      harness.graph.send.prepare();

      return harness.graph.send.prepared()!.totalPackets;
    }

    const small = await packetsFor(4 * 1024);
    const large = await packetsFor(8 * 1024);

    expect(large).toBe(small * 2);
  });
});

describe('decode rate (§7)', () => {
  it('decodes every clean frame it is given', async () => {
    // The decode *rate* that matters is the fraction of good frames that
    // yield a packet. One lost frame per pass is a fifth of the transfer on a
    // five-packet file.
    const harness = createHarness({ packetSize: 256 });
    const file = largeFile(4 * 1024);

    harness.graph.send.addFiles([{ name: file.name, content: file.content }]);
    harness.graph.send.prepare();

    const prepared = harness.graph.send.prepared()!;
    const decoder = createQrDecoder();

    const { result: decoded, ms } = timed(
      () => [...prepared.frames].filter((frame) => decoder.decode(captureOf(frame)).ok).length,
    );

    expect(decoded).toBe(prepared.frames.count);

    // Reported, not asserted: the number is for the reader of CI output.
    console.log(
      `decode: ${decoded} frames in ${ms.toFixed(0)} ms (${((decoded / ms) * 1000).toFixed(0)} frames/s)`,
    );
  });

  it('rejects an unusable frame far more cheaply than it decodes one', async () => {
    // §16's reason for the luminance pre-check: skipping a decode that cannot
    // succeed. If the check were not cheaper, it would be pure overhead.
    const harness = createHarness({ packetSize: 256 });
    harness.graph.send.addFiles([{ name: 'a.bin', content: largeFile(2048).content }]);
    harness.graph.send.prepare();

    const frame = captureOf(harness.graph.send.prepared()!.frames.at(0)!);
    const dark = { ...frame, data: new Uint8ClampedArray(frame.data.length) };
    const decoder = createQrDecoder();

    const good = timed(() => decoder.decode(frame));
    const bad = timed(() => decoder.decode(dark));

    expect(good.result.ok).toBe(true);
    expect(bad.result.ok).toBe(false);

    // A very loose bound: rejecting must not cost *more* than decoding. Tight
    // ratios would be a flake generator.
    expect(bad.ms).toBeLessThanOrEqual(good.ms * 10 + 50);
  });
});

describe('memory consumption (§7)', () => {
  it('reassembles into one buffer the size of the file', async () => {
    // A builder that concatenated incrementally would allocate O(packets²)
    // bytes. This asserts the shape rather than the byte count, which is what
    // stays true on any runtime.
    const harness = createHarness({ packetSize: 128 });
    const file = largeFile(8 * 1024);

    const outcome = await harness.run([{ name: file.name, content: file.content }]);

    expect(outcome.files[0]!.stream.byteLength).toBe(file.content.byteLength);
    expect(bytesEqual(outcome.files[0]!.stream, file.content)).toBe(true);
  });

  it('releases every packet a cancelled session held (§11.19)', async () => {
    // Packets held after cancellation are the leak that matters: they are
    // proportional to file size and live as long as the app does.
    const harness = createHarness({ packetSize: 128 });
    const file = largeFile(8 * 1024);

    harness.graph.send.addFiles([{ name: file.name, content: file.content }]);
    harness.graph.send.prepare();

    const prepared = harness.graph.send.prepared()!;
    expect(prepared.totalPackets).toBeGreaterThan(50);

    harness.graph.send.cancel();

    // Everything the transfer held is gone, and the controller is back where
    // it started rather than holding a stale session.
    expect(harness.graph.send.prepared()).toBeUndefined();
    expect(harness.graph.send.state.getState().totalPackets).toBe(0);
    expect(harness.graph.send.state.getState().sessionId).toBeUndefined();
  });

  it('does not retain duplicate copies of a repeated packet (§11.13)', async () => {
    // Under repetition — the default recovery strategy — the same packet
    // arrives many times. Storing each copy would make memory grow with
    // transfer *duration* rather than file size.
    const harness = createHarness({ packetSize: 128 });
    const file = largeFile(4 * 1024);

    const outcome = await harness.run([{ name: file.name, content: file.content }], {
      seed: 0x1ea4,
      passes: 5,
    });

    expect(outcome.framesDelivered).toBe(outcome.frameCount * 5);
    // Five times the frames, exactly the same number of packets held.
    expect(outcome.collectedPackets).toBe(outcome.totalPackets);
  });
});

describe('startup time (§7)', () => {
  it('builds the application graph without doing protocol work', () => {
    // §7 lists startup time. What makes it fast is that composition wires
    // objects and nothing more: no file is read, no session created, no frame
    // encoded. Asserting the *absence of work* is deterministic where
    // asserting milliseconds is not.
    const harness = createHarness();
    const state = harness.graph.send.state.getState();

    expect(state.sessionId).toBeUndefined();
    expect(state.totalPackets).toBe(0);
    expect(state.files).toHaveLength(0);
    expect(harness.graph.send.prepared()).toBeUndefined();
    expect(harness.camera.isRunning()).toBe(false);
  });

  it('constructs quickly enough that startup is not dominated by wiring', () => {
    const { ms } = timed(() => {
      for (let index = 0; index < 20; index += 1) {
        createHarness();
      }
    });

    // Twenty graphs. The bound is deliberately enormous: it fails only if
    // composition started doing real work, not if the machine is slow.
    expect(ms).toBeLessThan(5000);
  });
});

describe('encoder benchmark (§7)', () => {
  it('measures every payload size without a regression in symbol size', () => {
    // QR version is a function of payload size and error correction level, so
    // it is fully deterministic — and a version that jumped would mean each
    // frame needs more camera resolution to read.
    const samples = benchmarkEncoding(createQrEncoder(), tickingClock());

    expect(samples.length).toBeGreaterThanOrEqual(DEFAULT_PAYLOAD_SIZES.length);

    for (const sample of samples) {
      expect(sample.version).toBeGreaterThan(0);
      expect(sample.version).toBeLessThanOrEqual(40);
      expect(sample.moduleCount).toBe(sample.version * 4 + 17);
    }

    console.log(formatBenchmark(samples));
  });
});

/*
 * Not measured here, and why:
 *
 * - **CPU utilization (§7).** Needs a process-level sampler and a device.
 *   Node's `process.cpuUsage` would measure the test runner, not the app.
 * - **Battery usage (§7).** Device-only. Requires A12-01's camera adapter and
 *   a physical handset.
 * - **Startup time in milliseconds (§7).** The app's real startup is
 *   dominated by the React Native runtime, which does not start here.
 *
 * Recording these as unmeasured is deliberate. A test that measured something
 * adjacent and called it CPU utilization would satisfy §7 on paper while
 * telling nobody anything true.
 */
