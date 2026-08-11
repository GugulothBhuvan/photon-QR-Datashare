/**
 * Device camera adapter (A12-01, SI-013) — QR_SPEC §12, §14.
 *
 * Covers only what the native adapter introduces that nothing else can test:
 * the pixel-buffer conversion, and the adapter's own lifecycle and permission
 * behaviour. Packet validation, QR decoding, reconstruction, resume and
 * recovery are covered by their authoritative suites and are not repeated.
 *
 * The conversion gets the most attention because it is the one place where a
 * mistake corrupts every packet silently — a wrong row stride shifts each row
 * by a few bytes, which still looks like an image and never decodes.
 */
import { CameraPermission, PixelFormat, isWellFormed } from '@camera/cameraPort';
import { createDeviceCamera, sourceBytesPerPixelFor, toCameraFrame } from '@camera/deviceCamera';

/** A buffer whose bytes encode their own position, so misalignment is visible. */
function buffer(byteLength: number, fill: (index: number) => number): ArrayBuffer {
  const bytes = new Uint8ClampedArray(byteLength);

  for (let index = 0; index < byteLength; index += 1) {
    bytes[index] = fill(index);
  }

  return bytes.buffer;
}

describe('toCameraFrame — raw payload preservation (§14)', () => {
  it('passes an unpadded buffer through unchanged', () => {
    const width = 4;
    const height = 3;
    const source = buffer(width * height * 4, (index) => index & 0xff);

    const frame = toCameraFrame(source, width, height, 1234, width * 4);

    expect(frame.width).toBe(width);
    expect(frame.height).toBe(height);
    expect(frame.format).toBe(PixelFormat.Rgba);
    expect(frame.timestamp).toBe(1234);
    // Byte for byte. Anything else here is a corrupted packet later.
    expect(Array.from(frame.data)).toEqual(
      Array.from({ length: width * height * 4 }, (_unused, index) => index & 0xff),
    );
  });

  it('drops row padding when the camera pads its stride', () => {
    // Cameras align rows to a hardware boundary, so `bytesPerRow` is often
    // larger than `width * 4`. Keeping the padding would offset every row
    // after the first and nothing would ever decode.
    const width = 2;
    const height = 3;
    const packedRow = width * 4;
    const paddedRow = packedRow + 8;

    // Meaningful bytes are the row index; padding is 0xEE so it is identifiable.
    const source = buffer(paddedRow * height, (index) => {
      const column = index % paddedRow;
      return column < packedRow ? Math.floor(index / paddedRow) + 1 : 0xee;
    });

    const frame = toCameraFrame(source, width, height, 0, paddedRow);

    expect(frame.data).toHaveLength(packedRow * height);
    // No padding byte survived.
    expect(Array.from(frame.data)).not.toContain(0xee);
    // Row n contains only the value n+1.
    for (let row = 0; row < height; row += 1) {
      const slice = Array.from(frame.data.subarray(row * packedRow, (row + 1) * packedRow));
      expect(new Set(slice)).toEqual(new Set([row + 1]));
    }
  });

  it('produces a frame the port considers well formed', () => {
    // `isWellFormed` is what the receive path checks. A conversion that
    // disagreed with it would be rejected before decoding.
    const frame = toCameraFrame(
      buffer(8 * 8 * 4, () => 0),
      8,
      8,
      0,
      8 * 4,
    );

    expect(isWellFormed(frame)).toBe(true);
  });

  it('ignores trailing bytes beyond the declared image', () => {
    // Buffers are frequently larger than the image they carry.
    const width = 2;
    const height = 2;
    const frame = toCameraFrame(
      buffer(width * height * 4 + 64, () => 7),
      width,
      height,
      0,
      width * 4,
    );

    expect(frame.data).toHaveLength(width * height * 4);
    expect(isWellFormed(frame)).toBe(true);
  });

  it('widens a packed 24-bit frame instead of misreading every row', () => {
    // `pixelFormat: 'rgb'` is a request; the camera answers with BGRA, RGBA or
    // packed 24-bit RGB. Reading four bytes per pixel from the last of those
    // offsets every row after the first and decodes nothing at all.
    const width = 2;
    const height = 2;
    // Three bytes per pixel, each pixel numbered so a misread is visible.
    const source = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    const frame = toCameraFrame(source.buffer as ArrayBuffer, width, height, 0, width * 3, 3);

    expect(frame.format).toBe(PixelFormat.Rgba);
    expect(isWellFormed(frame)).toBe(true);
    // Colour bytes preserved in order, opaque alpha inserted per pixel.
    expect(Array.from(frame.data)).toEqual([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255,
    ]);
  });
});

describe('sourceBytesPerPixelFor — what the camera actually negotiated', () => {
  it.each(['rgb-bgra-8-bit', 'rgb-rgba-8-bit'])('reads %s as four bytes', (format) => {
    expect(sourceBytesPerPixelFor(format, 960 * 4, 960)).toBe(4);
  });

  it('reads a 24-bit stride as three bytes', () => {
    expect(sourceBytesPerPixelFor('rgb-rgb-8-bit', 960 * 3, 960)).toBe(3);
  });

  it('reads an RGBX stride as four, since the library documents both', () => {
    // `rgb-rgb-8-bit` covers RGB *and* RGBX, so the stride settles it.
    expect(sourceBytesPerPixelFor('rgb-rgb-8-bit', 960 * 4, 960)).toBe(4);
  });

  it('assumes four bytes for an unknown format rather than corrupting a common one', () => {
    expect(sourceBytesPerPixelFor('unknown', 960 * 4, 960)).toBe(4);
  });
});

describe('device camera adapter lifecycle', () => {
  function make(initial: CameraPermission = CameraPermission.Granted, granted = true) {
    const requestPermission = jest.fn(async () => granted);
    const camera = createDeviceCamera({
      requestPermission,
      currentPermission: () => initial,
    });

    return { camera, requestPermission };
  }

  const frame = () =>
    toCameraFrame(
      buffer(4 * 4 * 4, () => 1),
      4,
      4,
      0,
      16,
    );

  it('reports the platform permission it was created with', () => {
    expect(make(CameraPermission.Undetermined).camera.adapter.permission()).toBe(
      CameraPermission.Undetermined,
    );
  });

  it('records a granted permission request', async () => {
    const { camera, requestPermission } = make(CameraPermission.Undetermined, true);

    await expect(camera.adapter.requestPermission()).resolves.toBe(CameraPermission.Granted);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(camera.adapter.permission()).toBe(CameraPermission.Granted);
  });

  it('records a refused permission request as denied, not undetermined', async () => {
    // The receive screen's §14 recovery action keys off this. Leaving it
    // undetermined would offer to ask again when the user has already refused.
    const { camera } = make(CameraPermission.Undetermined, false);

    await expect(camera.adapter.requestPermission()).resolves.toBe(CameraPermission.Denied);
  });

  it('refuses to start without permission, as the in-memory camera does', async () => {
    const { camera } = make(CameraPermission.Denied, false);

    await expect(camera.adapter.start()).rejects.toThrow(/permission/i);
    expect(camera.adapter.isRunning()).toBe(false);
  });

  it('starts and stops, and start is idempotent', async () => {
    const { camera } = make();

    await camera.adapter.start();
    await camera.adapter.start();
    expect(camera.adapter.isRunning()).toBe(true);

    await camera.adapter.stop();
    await camera.adapter.stop();
    expect(camera.adapter.isRunning()).toBe(false);
  });

  it('delivers frames to subscribers only while running', () => {
    const { camera } = make();
    const seen: number[] = [];

    camera.adapter.onFrame((captured: { width: number }) => seen.push(captured.width));

    // Not started: a screen that is not scanning must not be fed frames.
    camera.deliver(frame());
    expect(seen).toHaveLength(0);

    void camera.adapter.start();
    camera.deliver(frame());
    expect(seen).toEqual([4]);
  });

  it('stops delivering once stopped', async () => {
    const { camera } = make();
    let count = 0;

    camera.adapter.onFrame(() => {
      count += 1;
    });

    await camera.adapter.start();
    camera.deliver(frame());
    await camera.adapter.stop();
    camera.deliver(frame());

    expect(count).toBe(1);
  });

  it('unsubscribes cleanly, and twice is harmless', async () => {
    const { camera } = make();
    let count = 0;

    const unsubscribe = camera.adapter.onFrame(() => {
      count += 1;
    });

    await camera.adapter.start();
    unsubscribe();
    unsubscribe();
    camera.deliver(frame());

    expect(count).toBe(0);
    expect(camera.hasListeners()).toBe(false);
  });

  it('delivers to every subscriber from a snapshot', async () => {
    // Subscribing during delivery must not change who receives the current
    // frame — the rule the event bus and in-memory camera already follow.
    const { camera } = make();
    const seen: string[] = [];

    await camera.adapter.start();

    camera.adapter.onFrame(() => {
      seen.push('first');
      camera.adapter.onFrame(() => seen.push('late'));
    });
    camera.adapter.onFrame(() => seen.push('second'));

    camera.deliver(frame());

    expect(seen).toEqual(['first', 'second']);
  });

  it('accepts a permission change reported by the platform', () => {
    const { camera } = make(CameraPermission.Undetermined, false);

    camera.setPermission(CameraPermission.Granted);

    expect(camera.adapter.permission()).toBe(CameraPermission.Granted);
  });
});
