/**
 * Device camera adapter (A12-01, SI-013) — QR_SPEC §12, §14; ADR-0005.
 *
 * The contract-facing half of the device camera: the `CameraAdapter`
 * implementation and the pixel-buffer conversion. **Nothing here imports
 * VisionCamera.** The binding to that library lives in `visionCamera.tsx`,
 * which cannot be loaded outside a native runtime.
 *
 * Splitting them that way is what makes the part that matters testable. The
 * conversion below is the one place where a mistake corrupts every packet
 * silently, and it can be exercised in Node with no camera present.
 *
 * **Why bytes survive (§14).** The receive path has no text anywhere in it:
 *
 * ```text
 * VisionCamera Frame (RGB)
 *   → frame.getPixelBuffer(): ArrayBuffer      ← raw pixel bytes
 *   → Uint8ClampedArray                        ← no copy through a string
 *   → CameraFrame                              ← the frozen contract
 *   → jsQR → payload bytes → deserializePacket → CRC
 * ```
 *
 * `expo-camera` could not do this: its barcode result exposes only
 * `data: string` and `raw?: string`, and it has no raw-frame API. Arbitrary
 * packet bytes through a JavaScript string lose every invalid UTF-8 sequence
 * to U+FFFD and change length, so the CRC fails. Evidence in SI-013.
 */
import { AppError, ErrorCode } from '@core/errors';

import {
  CameraPermission,
  PixelFormat,
  type CameraAdapter,
  type CameraFrame,
  type FrameListener,
} from './cameraPort';

export interface DeviceCamera {
  readonly adapter: CameraAdapter;
  /** Publishes one captured frame to every subscriber. */
  deliver(frame: CameraFrame): void;
  /** Records the permission the platform reported. */
  setPermission(permission: CameraPermission): void;
  /** Whether anything is subscribed — the component skips work if not. */
  hasListeners(): boolean;
}

export interface DeviceCameraOptions {
  /**
   * Asks the platform for camera permission.
   *
   * Injected so the adapter's own logic is testable without a device; the
   * component below supplies VisionCamera's implementation.
   */
  readonly requestPermission: () => Promise<boolean>;
  /** Reads the current permission without prompting. */
  readonly currentPermission: () => CameraPermission;
}

/**
 * Creates the device camera adapter.
 *
 * `start` and `stop` gate delivery rather than driving the hardware: the
 * session is owned by the mounted `<Camera>`, and a receive screen that is not
 * scanning should not consume frames it will discard. Starting without
 * permission throws the same `CAMERA_ERROR` the in-memory camera does, so the
 * controller's failure path is identical on a device and in a test.
 */
export function createDeviceCamera(options: DeviceCameraOptions): DeviceCamera {
  const listeners = new Set<FrameListener>();

  let permission = options.currentPermission();
  let running = false;

  const adapter: CameraAdapter = {
    permission() {
      return permission;
    },

    async requestPermission() {
      const granted = await options.requestPermission();
      permission = granted ? CameraPermission.Granted : CameraPermission.Denied;
      return permission;
    },

    async start() {
      if (permission !== CameraPermission.Granted) {
        throw new AppError(ErrorCode.CAMERA_ERROR, 'Camera permission has not been granted.', {
          details: { permission },
        });
      }
      // Idempotent, like every other adapter: a receive screen may resume.
      running = true;
    },

    async stop() {
      running = false;
    },

    isRunning() {
      return running;
    },

    onFrame(listener) {
      listeners.add(listener);

      let active = true;
      return (): void => {
        if (!active) {
          return;
        }
        active = false;
        listeners.delete(listener);
      };
    },
  };

  return {
    adapter,

    deliver(frame) {
      if (!running) {
        return;
      }

      // A snapshot, so subscribing during delivery does not change who receives
      // this frame — the same rule the event bus and memory camera follow.
      for (const listener of [...listeners]) {
        listener(frame);
      }
    },

    setPermission(next) {
      permission = next;
    },

    hasListeners() {
      return listeners.size > 0;
    },
  };
}

/**
 * Converts a VisionCamera pixel buffer into the contract's `CameraFrame`.
 *
 * Exported for its own tests: this is the one function where a mistake would
 * silently corrupt every packet, and it is pure, so it can be tested with no
 * camera present.
 *
 * @param buffer Raw pixel bytes from `Frame.getPixelBuffer()`.
 * @param width Frame width in pixels.
 * @param height Frame height in pixels.
 * @param timestamp Capture time, supplied by the caller (§ contract note).
 * @param bytesPerRow Row stride. Cameras pad rows, so this is frequently
 *   larger than `width * 4`; the padding must be dropped or every row after
 *   the first is offset and nothing decodes.
 * @param sourceBytesPerPixel Bytes per pixel in `buffer`, from
 *   {@link sourceBytesPerPixelFor}. Four unless the camera negotiated a packed
 *   24-bit layout.
 */
export function toCameraFrame(
  buffer: ArrayBuffer,
  width: number,
  height: number,
  timestamp: number,
  bytesPerRow: number,
  sourceBytesPerPixel = 4,
): CameraFrame {
  const source = new Uint8ClampedArray(buffer);
  const packedRow = width * 4;

  // The common case: four bytes per pixel with no padding, so the buffer is
  // already what the contract describes and no copy is needed beyond the view.
  if (
    sourceBytesPerPixel === 4 &&
    bytesPerRow === packedRow &&
    source.length >= packedRow * height
  ) {
    return {
      width,
      height,
      format: PixelFormat.Rgba,
      data: source.subarray(0, packedRow * height),
      timestamp,
    };
  }

  const packed = new Uint8ClampedArray(packedRow * height);

  if (sourceBytesPerPixel === 4) {
    // Padded rows: copy each row's meaningful bytes and drop the stride padding.
    for (let row = 0; row < height; row += 1) {
      const start = row * bytesPerRow;
      packed.set(source.subarray(start, start + packedRow), row * packedRow);
    }

    return { width, height, format: PixelFormat.Rgba, data: packed, timestamp };
  }

  // Three bytes per pixel: widen to the contract's four. Without this every
  // row after the first is offset by `width` bytes and nothing decodes at all
  // — the failure is total rather than degraded, which is why it is worth
  // handling a layout most cameras will not choose.
  for (let row = 0; row < height; row += 1) {
    let read = row * bytesPerRow;
    let write = row * packedRow;

    for (let column = 0; column < width; column += 1) {
      packed[write] = source[read] ?? 0;
      packed[write + 1] = source[read + 1] ?? 0;
      packed[write + 2] = source[read + 2] ?? 0;
      packed[write + 3] = 255;
      read += 3;
      write += 4;
    }
  }

  return { width, height, format: PixelFormat.Rgba, data: packed, timestamp };
}

/**
 * Bytes per pixel for a negotiated VisionCamera pixel format.
 *
 * `pixelFormat: 'rgb'` is a *request*, and the camera answers with one of
 * `rgb-bgra-8-bit`, `rgb-rgba-8-bit` or `rgb-rgb-8-bit` — the last of which
 * may be packed 24-bit. Assuming four bytes for all three would corrupt every
 * row of a 24-bit frame.
 *
 * **Channel order is deliberately ignored.** BGRA and RGBA differ only in
 * which of red and blue comes first, and a QR symbol is black on white, so
 * both channels carry the same value in the pixels that matter. Swapping them
 * would cost a pass over every frame to change nothing a decoder reads.
 *
 * @param pixelFormat The frame's own `pixelFormat`.
 * @param bytesPerRow Row stride, used to settle `rgb-rgb-8-bit`, which the
 *   library documents as RGB *or* RGBX.
 * @param width Frame width in pixels.
 */
export function sourceBytesPerPixelFor(
  pixelFormat: string,
  bytesPerRow: number,
  width: number,
): number {
  if (pixelFormat !== 'rgb-rgb-8-bit') {
    return 4;
  }

  return width > 0 && Math.floor(bytesPerRow / width) >= 4 ? 4 : 3;
}
