/**
 * Camera port (CAM-001) — QR_SPEC §12.
 *
 * The interface through which the receive path obtains frames. It is
 * deliberately the *only* thing the rest of the system knows about a camera:
 * §12's requirements — continuous capture, autofocus, exposure — are device
 * behaviours a concrete adapter arranges, and nothing above this interface can
 * tell which adapter is doing so.
 *
 * That matters beyond tidiness. QR_SPEC §17 anticipates future transports
 * replacing QR codes entirely while preserving the protocol layer; a receive
 * path written against this port rather than against a camera SDK is what
 * makes that possible.
 *
 * **No concrete camera here.** A real adapter needs a native module and a
 * running app, neither of which exists yet. The port and an in-memory
 * implementation are enough to build and test the whole receive pipeline;
 * the device adapter arrives with the UI phase.
 */

/**
 * How a frame's bytes are laid out.
 *
 * Cameras deliver luminance-only frames on most platforms because it is
 * cheaper, and QR decoding needs nothing else — but RGBA is what a rendered
 * image produces, so both are supported.
 */
export const PixelFormat = {
  /** One byte per pixel: luminance. */
  Grayscale: 'GRAYSCALE',
  /** Four bytes per pixel: red, green, blue, alpha. */
  Rgba: 'RGBA',
} as const;

export type PixelFormat = (typeof PixelFormat)[keyof typeof PixelFormat];

/** One captured frame. */
export interface CameraFrame {
  readonly width: number;
  readonly height: number;
  readonly format: PixelFormat;
  /** Pixel data, row-major, `width * height * bytesPerPixel` long. */
  readonly data: Uint8ClampedArray;
  /**
   * Capture time in epoch milliseconds.
   *
   * Supplied by the adapter rather than read here, so frame handling stays
   * deterministic under test.
   */
  readonly timestamp: number;
}

/** Bytes per pixel for a format. */
export function bytesPerPixel(format: PixelFormat): number {
  return format === PixelFormat.Rgba ? 4 : 1;
}

/** Whether a frame's buffer length matches its declared dimensions. */
export function isWellFormed(frame: CameraFrame): boolean {
  return (
    Number.isInteger(frame.width) &&
    Number.isInteger(frame.height) &&
    frame.width > 0 &&
    frame.height > 0 &&
    frame.data.length === frame.width * frame.height * bytesPerPixel(frame.format)
  );
}

/** Camera permission state, which a receiver must hold before capturing. */
export const CameraPermission = {
  Granted: 'GRANTED',
  Denied: 'DENIED',
  Undetermined: 'UNDETERMINED',
} as const;

export type CameraPermission = (typeof CameraPermission)[keyof typeof CameraPermission];

/** Called for each captured frame. */
export type FrameListener = (frame: CameraFrame) => void;

/** Removes the subscription it came from. */
export type Unsubscribe = () => void;

export interface CameraAdapter {
  /** Current permission state. */
  permission(): CameraPermission;

  /** Requests permission, resolving with the resulting state. */
  requestPermission(): Promise<CameraPermission>;

  /**
   * Begins continuous capture (§12).
   *
   * Idempotent: starting an already-running camera is not an error, because a
   * receive screen may be resumed more than once.
   */
  start(): Promise<void>;

  /** Stops capture and releases the device. */
  stop(): Promise<void>;

  /** Whether capture is running. */
  isRunning(): boolean;

  /** Subscribes to frames. Returns the unsubscribe function. */
  onFrame(listener: FrameListener): Unsubscribe;
}
