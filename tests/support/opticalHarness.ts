/**
 * System-test harness — TEST_SPEC §6, §11.
 *
 * Runs a complete transfer through the application graph the app itself builds:
 *
 * ```text
 * files → send controller → TransferService → manifest, packets, QR frames
 *   ‖ simulated optical channel: loss, corruption, duplication, reordering ‖
 *   → camera adapter → ReceiveService → decode, validate, packet map
 *   → reassemble → verify integrity → files
 * ```
 *
 * Nothing is stubbed but the light. The graph is `createAppGraph`, so a system
 * test exercises the same wiring `app/_layout.tsx` produces; only the clock,
 * the id source and the camera are substituted, and the camera is a real
 * adapter with no device behind it rather than a mock.
 *
 * **Determinism (§13).** The channel takes a seed and uses it for every
 * decision. Nothing here reads a clock or `Math.random`, so a failing run
 * reproduces exactly from its seed.
 *
 * One deliberate simplification: sender and receiver share one graph, so the
 * receiver reads the manifest the sender registered rather than one that
 * travelled optically. The manifest's wire format is unspecified (A5-01), so
 * transmitting it would require inventing one — which AGENTS.md §7 forbids.
 * Every *data* packet does travel the full optical path.
 */
import { PixelFormat, type CameraFrame } from '@camera/cameraPort';
import { createMemoryCamera, type MemoryCamera } from '@camera/memoryCamera';
import { createAppGraph, createMemorySettingsRepository } from '@config/appComposition';
import type { Clock, IdGenerator } from '@core/contracts';
import type { SessionId } from '@domain/ids';
import { rasterizeFrame } from '@qr/qrRenderer';
import type { QrFrame } from '@qr/qrEncoder';
import type { CompletedFile } from '@services/receiveService';
import type { SelectedFile } from '@services/transferService';

/** A fixed instant. Every timestamp in a system test comes from here. */
export const FIXED_NOW = 1_700_000_000_000;

export const fixedClock: Clock = { now: () => FIXED_NOW };

/** A counting UUID source, so ids are reproducible across runs. */
export function sequentialIds(prefix = '00000000'): IdGenerator {
  let counter = 0;

  return {
    next: () => {
      counter += 1;
      return `${prefix}-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
  };
}

/** A seeded generator. xorshift32: small, reproducible, no short period. */
export function seededRandom(seed: number): () => number {
  let state = (seed || 1) >>> 0;

  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

/** How the simulated optical channel degrades what passes through it. */
export interface ChannelOptions {
  /** Seed for every channel decision (§13). */
  readonly seed?: number;
  /** Probability a frame is never captured — §11 missing packets. */
  readonly lossRate?: number;
  /** Probability a captured frame is damaged — §11 corrupted packets. */
  readonly corruptionRate?: number;
  /** Probability a frame is captured twice — §11 duplicate packets. */
  readonly duplicationRate?: number;
  /**
   * How many times the sender repeats the whole sequence.
   *
   * §11.11 permits continuous looping and §15.6 Strategy 1 makes it the default
   * recovery mechanism, so a lossy channel is expected to be recovered by
   * repetition rather than retransmission requests.
   */
  readonly passes?: number;
  /** Pixels per QR module. Three is enough for the decoder to lock on. */
  readonly scale?: number;
}

/** What a transfer produced. */
export interface TransferOutcome {
  readonly sessionId: SessionId;
  readonly files: readonly CompletedFile[];
  /** Frames the sender produced, once. */
  readonly frameCount: number;
  /** Frames the camera actually delivered, across every pass. */
  readonly framesDelivered: number;
  readonly totalPackets: number;
  readonly collectedPackets: number;
  readonly missingPackets: number;
}

export interface HarnessOptions {
  readonly packetSize?: number;
  readonly idPrefix?: string;
}

export interface Harness {
  readonly graph: ReturnType<typeof createAppGraph>;
  readonly camera: MemoryCamera;

  /**
   * Sends the given files and receives them back through the channel.
   *
   * @returns What arrived, with the counters a receive screen would show.
   */
  run(files: readonly SelectedFile[], channel?: ChannelOptions): Promise<TransferOutcome>;
}

/** Renders an encoded frame as the camera frame a receiver would capture. */
export function captureOf(frame: QrFrame, scale = 3, timestamp = FIXED_NOW): CameraFrame {
  const raster = rasterizeFrame(frame, scale);

  return {
    width: raster.width,
    height: raster.height,
    format: PixelFormat.Rgba,
    data: raster.data,
    timestamp,
  };
}

/**
 * Damages a captured frame by inverting a band of rows across it — the kind of
 * damage a hand or a reflection moving across the code produces.
 *
 * @param rowFraction How much of the image height to destroy, as a fraction.
 *
 * **The default is deliberately large.** QR error correction at level M
 * recovers roughly 15% of the symbol, so a narrow band is *repaired* rather
 * than rejected: an early version of this helper damaged three pixel rows, and
 * every damaged frame still decoded perfectly. A test built on it would have
 * claimed to prove that corrupt frames are rejected while actually proving
 * that error correction works. Both are worth testing, so `scuff` covers the
 * recoverable case and this one covers real loss.
 */
export function corrupt(frame: CameraFrame, rowFraction = 0.5): CameraFrame {
  const data = Uint8ClampedArray.from(frame.data);
  const bytesPerRow = frame.width * 4;
  const rows = Math.max(1, Math.floor(frame.height * rowFraction));
  const start = Math.floor((frame.height - rows) / 2) * bytesPerRow;
  const end = Math.min(start + bytesPerRow * rows, data.length);

  for (let offset = start; offset < end; offset += 1) {
    data[offset] = 255 - (data[offset] ?? 0);
  }

  return { ...frame, data };
}

/**
 * Damages a frame lightly — within what error correction can repair.
 *
 * QR_SPEC §7 selects an error correction level precisely so that ordinary
 * optical noise does not cost a packet. This is the counterpart to `corrupt`:
 * damage a receiver is expected to absorb silently.
 */
export function scuff(frame: CameraFrame): CameraFrame {
  return corrupt(frame, 0.03);
}

/**
 * Builds a harness.
 *
 * The packet size is small by default so a modest fixture still produces many
 * packets — which is what makes ordering, loss and duplication observable
 * without encoding megabytes of QR codes.
 */
export function createHarness(options: HarnessOptions = {}): Harness {
  const camera = createMemoryCamera();
  const graph = createAppGraph({
    clock: fixedClock,
    idGenerator: sequentialIds(options.idPrefix),
    camera,
    settingsRepository: createMemorySettingsRepository(),
  });

  if (options.packetSize !== undefined) {
    graph.send.setPacketSize(options.packetSize);
  }

  return {
    graph,
    camera,

    async run(files, channel = {}) {
      const {
        seed = 0x5eed,
        lossRate = 0,
        corruptionRate = 0,
        duplicationRate = 0,
        passes = 1,
        scale = 3,
      } = channel;

      const random = seededRandom(seed);

      graph.send.addFiles(files);
      graph.send.prepare();

      const prepared = graph.send.prepared();

      if (prepared === undefined) {
        throw new Error(
          `Preparation failed: ${graph.send.state.getState().errorMessage ?? 'no reason given'}`,
        );
      }

      graph.send.start();

      // The receiver subscribes before any frame is emitted, as it would on a
      // real device — a receiver that started late would miss the opening
      // packets and hide a bug behind repetition.
      await graph.receive.start(prepared.sessionId);

      let framesDelivered = 0;

      for (let pass = 0; pass < passes; pass += 1) {
        for (const frame of prepared.frames) {
          if (random() < lossRate) {
            continue;
          }

          const captured = captureOf(frame, scale);
          const damaged = random() < corruptionRate;
          const copies = random() < duplicationRate ? 2 : 1;

          for (let copy = 0; copy < copies; copy += 1) {
            camera.push(damaged ? corrupt(captured) : captured);
            framesDelivered += 1;
          }
        }
      }

      camera.emitAll();

      const state = graph.receive.state.getState();
      const received = graph.receive.finish();

      await graph.receive.stop();

      return {
        sessionId: prepared.sessionId,
        files: received,
        frameCount: prepared.frames.count,
        framesDelivered,
        totalPackets: state.totalPackets,
        collectedPackets: state.collectedPackets,
        missingPackets: state.missingPackets,
      };
    },
  };
}

/** Whether two byte sequences are identical — invariant §15.4. */
export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}
