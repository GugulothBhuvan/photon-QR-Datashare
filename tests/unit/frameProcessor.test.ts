/**
 * Camera port and frame processing (CAM-001, CAM-002) — QR_SPEC §12, §16.
 */
import { AppError } from '@core/errors';
import {
  bytesPerPixel,
  CameraPermission,
  isWellFormed,
  PixelFormat,
  type CameraFrame,
} from '@camera/cameraPort';
import {
  downsample,
  isPlausiblyDecodable,
  meanLuminance,
  toGrayscale,
  toRgba,
} from '@camera/frameProcessor';
import { createMemoryCamera } from '@camera/memoryCamera';

function grayFrame(width: number, height: number, fill: number): CameraFrame {
  return {
    width,
    height,
    format: PixelFormat.Grayscale,
    data: new Uint8ClampedArray(width * height).fill(fill),
    timestamp: 1000,
  };
}

function rgbaFrame(width: number, height: number, rgba: readonly number[]): CameraFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data.set(rgba, i * 4);
  }
  return { width, height, format: PixelFormat.Rgba, data, timestamp: 1000 };
}

describe('frame shape', () => {
  it('reports bytes per pixel', () => {
    expect(bytesPerPixel(PixelFormat.Grayscale)).toBe(1);
    expect(bytesPerPixel(PixelFormat.Rgba)).toBe(4);
  });

  it('accepts a frame whose buffer matches its dimensions', () => {
    expect(isWellFormed(grayFrame(4, 3, 128))).toBe(true);
    expect(isWellFormed(rgbaFrame(4, 3, [1, 2, 3, 255]))).toBe(true);
  });

  it.each([
    ['a short buffer', { ...grayFrame(4, 4, 0), data: new Uint8ClampedArray(8) }],
    ['zero width', { ...grayFrame(4, 4, 0), width: 0 }],
    ['a fractional dimension', { ...grayFrame(4, 4, 0), height: 1.5 }],
  ])('rejects %s', (_label, frame) => {
    expect(isWellFormed(frame as CameraFrame)).toBe(false);
  });
});

describe('toGrayscale (§16)', () => {
  it('returns a grayscale frame unchanged rather than copying it', () => {
    const frame = grayFrame(4, 4, 100);

    // §16 warns against unnecessary bitmap allocations.
    expect(toGrayscale(frame)).toBe(frame);
  });

  it('converts RGBA using BT.601 luminance weights', () => {
    // Pure red: 0.299 * 255 = 76.
    expect(toGrayscale(rgbaFrame(2, 2, [255, 0, 0, 255])).data[0]).toBe(76);
    // Pure green: 0.587 * 255 = 150.
    expect(toGrayscale(rgbaFrame(2, 2, [0, 255, 0, 255])).data[0]).toBe(150);
    // Pure blue: 0.114 * 255 = 29.
    expect(toGrayscale(rgbaFrame(2, 2, [0, 0, 255, 255])).data[0]).toBe(29);
  });

  it('maps white to white and black to black, which is what a QR code is made of', () => {
    expect(toGrayscale(rgbaFrame(2, 2, [255, 255, 255, 255])).data[0]).toBe(255);
    expect(toGrayscale(rgbaFrame(2, 2, [0, 0, 0, 255])).data[0]).toBe(0);
  });

  it('produces one byte per pixel', () => {
    const grey = toGrayscale(rgbaFrame(3, 2, [10, 20, 30, 255]));

    expect(grey.data).toHaveLength(6);
    expect(grey.format).toBe(PixelFormat.Grayscale);
  });

  it('carries the timestamp through', () => {
    expect(toGrayscale(rgbaFrame(2, 2, [1, 1, 1, 255])).timestamp).toBe(1000);
  });

  it('rejects a malformed frame', () => {
    expect(() => toGrayscale({ ...grayFrame(4, 4, 0), width: 8 })).toThrow(AppError);
  });
});

describe('toRgba', () => {
  it('returns an RGBA frame unchanged', () => {
    const frame = rgbaFrame(2, 2, [1, 2, 3, 255]);

    expect(toRgba(frame)).toBe(frame);
  });

  it('expands luminance across the colour channels with opaque alpha', () => {
    const rgba = toRgba(grayFrame(2, 1, 90));

    expect(Array.from(rgba.data)).toEqual([90, 90, 90, 255, 90, 90, 90, 255]);
  });

  it('round-trips a grayscale frame', () => {
    const original = grayFrame(3, 3, 123);

    expect(Array.from(toGrayscale(toRgba(original)).data)).toEqual(Array.from(original.data));
  });
});

describe('downsample (§16)', () => {
  it('returns the frame unchanged at factor 1', () => {
    const frame = grayFrame(4, 4, 50);

    expect(downsample(frame, 1)).toBe(frame);
  });

  it('halves the dimensions at factor 2', () => {
    const reduced = downsample(grayFrame(8, 6, 10), 2);

    expect(reduced.width).toBe(4);
    expect(reduced.height).toBe(3);
    expect(reduced.data).toHaveLength(12);
  });

  it('takes the top-left pixel of each block, keeping edges sharp', () => {
    // A 2x2 checkerboard: averaging would turn it uniformly grey, which is
    // exactly what must not happen to a QR module edge.
    const data = new Uint8ClampedArray([0, 255, 255, 0]);
    const frame: CameraFrame = {
      width: 2,
      height: 2,
      format: PixelFormat.Grayscale,
      data,
      timestamp: 0,
    };

    expect(Array.from(downsample(frame, 2).data)).toEqual([0]);
  });

  it('preserves all four channels of an RGBA frame', () => {
    const reduced = downsample(rgbaFrame(4, 4, [10, 20, 30, 255]), 2);

    expect(Array.from(reduced.data.slice(0, 4))).toEqual([10, 20, 30, 255]);
  });

  it.each([0, -1, 1.5])('rejects a factor of %p', (factor) => {
    expect(() => downsample(grayFrame(4, 4, 0), factor)).toThrow(AppError);
  });

  it('rejects a factor larger than the frame', () => {
    expect(() => downsample(grayFrame(4, 4, 0), 8)).toThrow(AppError);
  });
});

describe('exposure (§12)', () => {
  it('measures mean luminance', () => {
    expect(meanLuminance(grayFrame(4, 4, 128))).toBe(128);
  });

  it('measures an RGBA frame by converting first', () => {
    expect(meanLuminance(rgbaFrame(2, 2, [255, 255, 255, 255]))).toBe(255);
  });

  it('accepts a normally exposed frame', () => {
    expect(isPlausiblyDecodable(grayFrame(4, 4, 128))).toBe(true);
  });

  it.each([
    ['a covered lens', 2],
    ['a frame pointed at a light', 250],
  ])('rejects %s', (_label, fill) => {
    // Cheap pre-filter: skipping a decode that cannot succeed.
    expect(isPlausiblyDecodable(grayFrame(4, 4, fill))).toBe(false);
  });
});

describe('memory camera (CAM-001)', () => {
  const frame = grayFrame(2, 2, 128);

  it('starts and stops', async () => {
    const camera = createMemoryCamera();

    expect(camera.isRunning()).toBe(false);
    await camera.start();
    expect(camera.isRunning()).toBe(true);
    await camera.stop();
    expect(camera.isRunning()).toBe(false);
  });

  it('is idempotent on start, since a screen may be resumed twice', async () => {
    const camera = createMemoryCamera();

    await camera.start();
    await expect(camera.start()).resolves.toBeUndefined();
    expect(camera.isRunning()).toBe(true);
  });

  it('refuses to start without permission', async () => {
    const camera = createMemoryCamera({ permission: CameraPermission.Denied });

    await expect(camera.start()).rejects.toThrow(AppError);
  });

  it('grants an undetermined permission when asked', async () => {
    const camera = createMemoryCamera({ permission: CameraPermission.Undetermined });

    expect(await camera.requestPermission()).toBe(CameraPermission.Granted);
    await expect(camera.start()).resolves.toBeUndefined();
  });

  it('does not grant a denied permission by asking again', async () => {
    const camera = createMemoryCamera({ permission: CameraPermission.Denied });

    expect(await camera.requestPermission()).toBe(CameraPermission.Denied);
  });

  it('delivers frames to subscribers', async () => {
    const camera = createMemoryCamera({ frames: [frame] });
    const seen: CameraFrame[] = [];

    camera.onFrame((f) => seen.push(f));
    await camera.start();
    camera.emitNext();

    expect(seen).toEqual([frame]);
  });

  it('delivers nothing while stopped', () => {
    const camera = createMemoryCamera({ frames: [frame] });
    const seen: CameraFrame[] = [];

    camera.onFrame((f) => seen.push(f));

    expect(camera.emitNext()).toBeUndefined();
    expect(seen).toEqual([]);
  });

  it('stops delivering after unsubscribe', async () => {
    const camera = createMemoryCamera({ frames: [frame, frame] });
    const seen: CameraFrame[] = [];

    const unsubscribe = camera.onFrame((f) => seen.push(f));
    await camera.start();
    camera.emitNext();
    unsubscribe();
    unsubscribe();
    camera.emitNext();

    expect(seen).toHaveLength(1);
  });

  it('drains the queue', async () => {
    const camera = createMemoryCamera({ frames: [frame, frame, frame] });
    await camera.start();

    expect(camera.emitAll()).toBe(3);
    expect(camera.pending()).toBe(0);
  });

  it('accepts frames pushed after construction', async () => {
    const camera = createMemoryCamera();
    await camera.start();
    camera.push(frame);

    expect(camera.pending()).toBe(1);
    expect(camera.emitNext()).toBe(frame);
  });
});
