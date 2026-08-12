/**
 * The fountain engine across the real optical path (F7) — ADR-0008.
 *
 * The codec and the frame format are unit tested; `fountainTransfer.test.ts`
 * joins them in memory. This one puts the frames through the **same
 * rasteriser and the same jsQR decoder the packet engine uses**, driven by the
 * real services from the real composition root.
 *
 * That is the point: the two engines differ in transport and in nothing else,
 * so a difference measured later is attributable.
 */
import { createMemoryCamera } from '@camera/memoryCamera';
import { PixelFormat, type CameraFrame } from '@camera/cameraPort';
import {
  createAppGraph,
  createMemorySettingsRepository,
  TransportEngine,
} from '@config/appComposition';
import type { Clock, IdGenerator } from '@core/contracts';
import { FountainOutcome } from '@services/fountainReceiveService';
import type { FountainStream } from '@services/fountainSendService';
import { rasterizeFrame } from '@qr/qrRenderer';
import type { QrFrame } from '@qr/qrEncoder';

const clock: Clock = { now: () => 1_700_000_000_000 };

function ids(prefix: string): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `${prefix}-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
  };
}

function graphWith(prefix: string) {
  const camera = createMemoryCamera();

  return {
    camera,
    graph: createAppGraph({
      clock,
      idGenerator: ids(prefix),
      camera,
      settingsRepository: createMemorySettingsRepository(),
      engine: TransportEngine.Fountain,
    }),
  };
}

/** A QR frame as the camera would capture it. */
function captureOf(frame: QrFrame, scale = 3): CameraFrame {
  const raster = rasterizeFrame(frame, scale);

  return {
    width: raster.width,
    height: raster.height,
    format: PixelFormat.Rgba,
    data: raster.data,
    timestamp: 1_000,
  };
}

const FILE = {
  name: 'notes.txt',
  mediaType: 'text/plain',
  content: Uint8Array.from({ length: 2_400 }, (_unused, index) => (index * 53 + 3) & 0xff),
};

describe('a file crosses the optical path with no preamble (ADR-0008)', () => {
  it('reconstructs, verifies, and keeps its name', async () => {
    const { camera, graph } = graphWith('f0000001');

    const stream = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });
    const session = graph.fountain.receive.listen();

    await camera.start();

    // One full carousel: the systematic sweep and its repair frames.
    camera.push(captureOf(stream.current()));

    for (let index = 1; index < stream.k * 2; index += 1) {
      camera.push(captureOf(stream.advance()));
    }

    camera.emitAll();

    const result = session.finish();

    expect(result?.outcome).toBe(FountainOutcome.Received);

    if (result?.outcome === FountainOutcome.Received) {
      expect(result.file.name).toBe(FILE.name);
      expect(result.file.mediaType).toBe(FILE.mediaType);
      expect(Array.from(result.file.content)).toEqual(Array.from(FILE.content));
    }

    session.stop();
  });

  it('completes without ever seeing the start of the stream', async () => {
    // The property the packet engine cannot have. There, a receiver that has
    // not caught §9.1's handshake and §9.2's manifest can place no packet at
    // all, whatever else it decodes.
    const { camera, graph } = graphWith('f0000002');

    const stream = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });
    await camera.start();

    // The sender runs on unwatched, deep into the repair half.
    for (let index = 0; index < stream.k + 7; index += 1) {
      stream.advance();
    }

    // Only now does anyone start looking.
    const session = graph.fountain.receive.listen();

    for (let index = 0; index < stream.k * 3; index += 1) {
      camera.push(captureOf(stream.advance()));
    }

    camera.emitAll();

    expect(session.progress().complete).toBe(true);
    expect(session.finish()?.outcome).toBe(FountainOutcome.Received);
    session.stop();
  });

  it('reconstructs through frames the camera never delivered', async () => {
    const { camera, graph } = graphWith('f0000003');

    const stream = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });
    const session = graph.fountain.receive.listen();

    await camera.start();

    // Every third frame is simply never captured — a hand moving, a refresh
    // straddled, a focus hunt. Under the packet engine each of these costs a
    // whole cycle; here they cost a little time.
    for (let index = 0; index < stream.k * 4; index += 1) {
      const frame = stream.advance();

      if (index % 3 !== 0) {
        camera.push(captureOf(frame));
      }
    }

    camera.emitAll();

    const result = session.finish();

    expect(result?.outcome).toBe(FountainOutcome.Received);

    if (result?.outcome === FountainOutcome.Received) {
      expect(Array.from(result.file.content)).toEqual(Array.from(FILE.content));
    }

    session.stop();
  });

  it('reports progress from the first frame it reads', async () => {
    // A receiver that says nothing while searching is one this project has
    // already lost four device sessions to.
    const { camera, graph } = graphWith('f0000004');

    const stream = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });
    const reports: number[] = [];
    const session = graph.fountain.receive.listen((progress) => reports.push(progress.framesSeen));

    await camera.start();
    camera.push(captureOf(stream.current()));
    camera.emitAll();

    expect(reports).toEqual([1]);
    expect(session.progress().k).toBe(stream.k);
    session.stop();
  });

  it('counts frames from another transfer rather than corrupting itself', async () => {
    // Two senders in one camera's view. A foreign block XORed into the decoder
    // would be undetectable until the final checksum.
    const { camera, graph } = graphWith('f0000005');

    const mine = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });
    const theirs = graph.fountain.send.prepare({
      file: { ...FILE, name: 'other.bin', content: FILE.content.slice(0, 900) },
      blockLength: 256,
    });

    const session = graph.fountain.receive.listen();
    await camera.start();

    camera.push(captureOf(mine.current()));

    for (let index = 1; index < mine.k * 2; index += 1) {
      camera.push(captureOf(mine.advance()));
      camera.push(captureOf(theirs.advance()));
    }

    camera.emitAll();

    expect(session.progress().framesForeign).toBeGreaterThan(0);

    const result = session.finish();

    // Whichever stream it locked onto, what it produces verifies.
    if (result?.outcome === FountainOutcome.Received) {
      expect(result.file.name).toBe(FILE.name);
    }

    session.stop();
  });
});

describe('the carousel reports where it is', () => {
  it('sweeps systematically before it repairs', () => {
    // A user watching a status line should be able to tell the two halves
    // apart: the sweep is the part that completes a clean transfer in exactly
    // k frames, and the repair half is what pays for whatever was missed.
    const { graph } = graphWith('f0000007');
    const stream: FountainStream = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });

    expect(stream.position()).toMatchObject({ seq: 0, position: 0, pass: 0, systematic: true });

    for (let index = 1; index < stream.k; index += 1) {
      stream.advance();
    }

    expect(stream.position().systematic).toBe(true);

    stream.advance();
    expect(stream.position().systematic).toBe(false);
  });

  it('counts a pass once the whole carousel has been shown', () => {
    const { graph } = graphWith('f0000008');
    const stream = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });

    for (let index = 0; index < stream.k * 2; index += 1) {
      stream.advance();
    }

    expect(stream.position().pass).toBe(1);
    expect(stream.position().position).toBe(0);
  });

  it('restarts the sweep on reset', () => {
    // Not a protocol requirement — a receiver can join anywhere — but a user
    // watching a stall wants a control that visibly does something.
    const { graph } = graphWith('f0000009');
    const stream = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });

    for (let index = 0; index < stream.k + 5; index += 1) {
      stream.advance();
    }

    stream.reset();

    expect(stream.position()).toMatchObject({ seq: 0, systematic: true });
  });
});

describe('the sender refuses what it cannot carry', () => {
  it('refuses a block length past the QR capacity, before displaying anything', async () => {
    // Discovered mid-transfer, this would have wasted the user's time.
    const { graph } = graphWith('f0000006');

    expect(() => graph.fountain.send.prepare({ file: FILE, blockLength: 4_000 })).toThrow(
      /QR code can hold/i,
    );
  });
});
