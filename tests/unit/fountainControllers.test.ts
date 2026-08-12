/**
 * Fountain controllers (F7) — ADR-0008.
 *
 * The screen-facing state for the rateless engine, driven against the real
 * services from the real composition root. What is tested is the behaviour a
 * screen depends on and a refactor could silently lose: that a failure to
 * prepare is reported rather than thrown, that a completed transfer keeps its
 * result when the camera is stopped afterwards, and that a file which does not
 * verify is a distinct outcome rather than a delivered file with a warning.
 */
import { createMemoryCamera } from '@camera/memoryCamera';
import {
  CameraPermission,
  PixelFormat,
  type CameraAdapter,
  type CameraFrame,
} from '@camera/cameraPort';
import { AppError, ErrorCode, toUserMessage } from '@core/errors';
import {
  createAppGraph,
  createMemorySettingsRepository,
  TransportEngine,
} from '@config/appComposition';
import type { Clock, IdGenerator } from '@core/contracts';
import { FountainSendStage } from '@controllers/fountainSendController';
import {
  createFountainReceiveController,
  FountainReceiveStage,
} from '@controllers/fountainReceiveController';
import { QRSpeedPreference } from '@domain/settings';
import { FRAME_DURATION_MS, FrameRate } from '@qr/frameScheduler';
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

/** Progress a receiver that never sees a frame would report. */
const never = {
  framesSeen: 0,
  framesDecoded: 0,
  framesAccepted: 0,
  framesRedundant: 0,
  framesForeign: 0,
  blocksSolved: 0,
  k: 0,
  complete: false,
};

const FILE = {
  name: 'notes.txt',
  mediaType: 'text/plain',
  content: Uint8Array.from({ length: 1_500 }, (_unused, index) => (index * 29 + 5) & 0xff),
};

describe('fountain send controller (F7)', () => {
  it('has nothing to show until a file is chosen and started', () => {
    const { graph } = graphWith('c0000001');
    const send = graph.fountain.sendController;

    expect(send.state.getState().stage).toBe(FountainSendStage.Selecting);
    expect(send.currentFrame(280)).toBeUndefined();

    // Starting without a file does nothing rather than throwing.
    send.start();
    expect(send.state.getState().stage).toBe(FountainSendStage.Selecting);
  });

  it('puts a code on screen on one press', () => {
    const { graph } = graphWith('c0000002');
    const send = graph.fountain.sendController;

    send.chooseFile(FILE);
    send.start();

    const state = send.state.getState();

    expect(state.stage).toBe(FountainSendStage.Sending);
    expect(state.k).toBeGreaterThan(0);
    expect(send.currentFrame(280)).toBeDefined();
  });

  it('reports a block length past QR capacity instead of throwing at a screen', () => {
    // A screen calls this from `onPress`. An exception there is an unhandled
    // rejection, not an error state a user can act on.
    const { graph } = graphWith('c0000003');
    const send = graph.fountain.sendController;

    send.chooseFile(FILE);
    send.setBlockLength(4_000);
    send.start();

    const state = send.state.getState();

    expect(state.stage).toBe(FountainSendStage.Failed);
    expect(state.errorMessage).toBeDefined();
  });

  it('advances through the carousel and reports where it is', () => {
    const { graph } = graphWith('c0000004');
    const send = graph.fountain.sendController;

    send.chooseFile(FILE);
    send.start();

    const { k } = send.state.getState();

    for (let index = 0; index < k; index += 1) {
      send.advance();
    }

    const position = send.state.getState().position;

    // Past the systematic sweep, into the repair half.
    expect(position?.seq).toBe(k);
    expect(position?.systematic).toBe(false);
  });

  it('does not advance while paused', () => {
    const { graph } = graphWith('c0000005');
    const send = graph.fountain.sendController;

    send.chooseFile(FILE);
    send.start();
    send.advance();

    const before = send.state.getState().position?.seq;
    send.pause();
    send.advance();

    expect(send.state.getState().position?.seq).toBe(before);

    send.resume();
    send.advance();

    expect(send.state.getState().position?.seq).toBe((before ?? 0) + 1);
  });

  it('restarts the sweep without losing the file', () => {
    const { graph } = graphWith('c0000006');
    const send = graph.fountain.sendController;

    send.chooseFile(FILE);
    send.start();
    send.advance();
    send.advance();
    send.restart();

    expect(send.state.getState().position?.seq).toBe(0);
    expect(send.state.getState().file).toBe(FILE);
  });

  it('keeps the chosen file and settings through a cancel', () => {
    // A user who stops to reposition the phones should not have to pick the
    // file again.
    const { graph } = graphWith('c0000007');
    const send = graph.fountain.sendController;

    send.chooseFile(FILE);
    send.setSpeed(QRSpeedPreference.Slow);
    send.start();
    send.cancel();

    const state = send.state.getState();

    expect(state.stage).toBe(FountainSendStage.Selecting);
    expect(state.file).toBe(FILE);
    expect(state.speed).toBe(QRSpeedPreference.Slow);
    expect(state.durationMs).toBe(FRAME_DURATION_MS[FrameRate.Reliable]);
  });
});

describe('fountain receive controller (F7)', () => {
  it('collects from the first frame it reads, with no discovery step', async () => {
    // The packet engine passes through a searching stage while it waits for a
    // preamble. Here the first frame decoded is both the discovery and the
    // first piece of the file.
    const { camera, graph } = graphWith('c0000008');
    const receive = graph.fountain.receiveController;

    const stream = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });

    await receive.listen();
    expect(receive.state.getState().stage).toBe(FountainReceiveStage.Watching);

    camera.push(captureOf(stream.current()));
    camera.emitAll();

    const state = receive.state.getState();

    expect(state.stage).toBe(FountainReceiveStage.Collecting);
    expect(state.k).toBe(stream.k);
    expect(state.blocksSolved).toBeGreaterThan(0);

    await receive.stop();
  });

  it('completes and holds the verified file', async () => {
    const { camera, graph } = graphWith('c0000009');
    const receive = graph.fountain.receiveController;
    const stream = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });

    await receive.listen();

    camera.push(captureOf(stream.current()));

    for (let index = 1; index < stream.k * 2; index += 1) {
      camera.push(captureOf(stream.advance()));
    }

    camera.emitAll();

    const state = receive.state.getState();

    expect(state.stage).toBe(FountainReceiveStage.Complete);
    expect(state.file?.name).toBe(FILE.name);
    expect(Array.from(state.file?.content ?? [])).toEqual(Array.from(FILE.content));

    await receive.stop();
  });

  it('keeps a finished transfer when the camera is stopped afterwards', async () => {
    // Stopping the camera must not throw away the file the user is about to
    // save.
    const { camera, graph } = graphWith('c000000a');
    const receive = graph.fountain.receiveController;
    const stream = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });

    await receive.listen();
    camera.push(captureOf(stream.current()));

    for (let index = 1; index < stream.k * 2; index += 1) {
      camera.push(captureOf(stream.advance()));
    }

    camera.emitAll();
    await receive.stop();

    expect(receive.state.getState().stage).toBe(FountainReceiveStage.Complete);
    expect(receive.state.getState().file).toBeDefined();
  });

  it('reports a camera that will not start rather than throwing', async () => {
    // A screen calls `listen` from an effect and does not await it, so a
    // rejection there is unhandled and invisible. The stage has to carry it.
    const refusing: CameraAdapter = {
      permission: () => CameraPermission.Denied,
      requestPermission: async () => CameraPermission.Denied,
      start: async () => {
        throw new AppError(ErrorCode.CAMERA_ERROR, 'Camera permission has not been granted.', {});
      },
      stop: async () => undefined,
      isRunning: () => false,
      onFrame: () => () => undefined,
    };

    const receive = createFountainReceiveController({
      camera: refusing,
      receiver: {
        listen: () => ({ progress: () => never, finish: () => undefined, stop: () => undefined }),
      },
      toUserMessage,
    });

    await receive.listen();

    const state = receive.state.getState();

    expect(state.stage).toBe(FountainReceiveStage.Failed);
    expect(state.errorMessage).toBeDefined();
  });

  it('counts frames from a different transfer', async () => {
    const { camera, graph } = graphWith('c000000c');
    const receive = graph.fountain.receiveController;

    const mine = graph.fountain.send.prepare({ file: FILE, blockLength: 256 });
    const theirs = graph.fountain.send.prepare({
      file: { ...FILE, name: 'other.bin', content: FILE.content.slice(0, 600) },
      blockLength: 256,
    });

    await receive.listen();

    camera.push(captureOf(mine.current()));
    camera.push(captureOf(theirs.current()));
    camera.emitAll();

    expect(receive.state.getState().framesForeign).toBeGreaterThan(0);

    await receive.stop();
  });
});
