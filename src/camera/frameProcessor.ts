/**
 * Frame processor (CAM-002) — QR_SPEC §12, §16.
 *
 * Prepares captured frames for detection. Every function here is pure: a frame
 * in, a frame out, no device and no state. That is what lets the receive path
 * be tested against synthetic frames rather than a camera.
 *
 * §16 asks implementations to avoid unnecessary bitmap allocations. Two
 * consequences visible in the API:
 *
 * - `toGrayscale` returns the frame unchanged when it already is grayscale,
 *   rather than copying it to prove a point.
 * - `downsample` exists at all. Decoding a 4K frame costs far more than
 *   decoding a half-scale one, and a QR module spans many pixels at capture
 *   resolution, so the information that matters survives.
 */
import { AppError, ErrorCode } from '@core/errors';

import { bytesPerPixel, isWellFormed, PixelFormat, type CameraFrame } from './cameraPort';

/**
 * Luminance coefficients from ITU-R BT.601.
 *
 * The standard weighting for perceived brightness, and what image pipelines
 * use when reducing colour to grey. Integer arithmetic on a 16-bit shift keeps
 * it exact and fast.
 */
const R_WEIGHT = 19595; // 0.299 * 65536
const G_WEIGHT = 38470; // 0.587 * 65536
const B_WEIGHT = 7471; // 0.114 * 65536

/**
 * Half of one output level, added before the shift so the result rounds rather
 * than truncates.
 *
 * Without it a pure green pixel comes out at 149 instead of 150 — a whole
 * level lost on every conversion, biased consistently downward. Harmless for
 * thresholding a QR code, but wrong, and wrong in a way that compounds if this
 * output is ever used for anything else.
 */
const ROUNDING = 1 << 15;

function assertWellFormed(frame: CameraFrame): void {
  if (!isWellFormed(frame)) {
    throw new AppError(ErrorCode.CAMERA_ERROR, 'Frame dimensions do not match its buffer.', {
      details: {
        width: frame.width,
        height: frame.height,
        format: frame.format,
        length: frame.data.length,
      },
    });
  }
}

/**
 * Converts a frame to grayscale.
 *
 * Returns the same frame when it is already grayscale — allocating a copy to
 * satisfy a signature would be exactly the waste §16 warns about.
 */
export function toGrayscale(frame: CameraFrame): CameraFrame {
  assertWellFormed(frame);

  if (frame.format === PixelFormat.Grayscale) {
    return frame;
  }

  const pixels = frame.width * frame.height;
  const out = new Uint8ClampedArray(pixels);

  for (let i = 0; i < pixels; i += 1) {
    const offset = i * 4;
    const r = frame.data[offset] as number;
    const g = frame.data[offset + 1] as number;
    const b = frame.data[offset + 2] as number;

    out[i] = (r * R_WEIGHT + g * G_WEIGHT + b * B_WEIGHT + ROUNDING) >> 16;
  }

  return Object.freeze({
    width: frame.width,
    height: frame.height,
    format: PixelFormat.Grayscale,
    data: out,
    timestamp: frame.timestamp,
  });
}

/**
 * Converts a frame to RGBA.
 *
 * Needed because the decoder takes RGBA, while cameras usually deliver
 * luminance. Alpha is fully opaque throughout.
 */
export function toRgba(frame: CameraFrame): CameraFrame {
  assertWellFormed(frame);

  if (frame.format === PixelFormat.Rgba) {
    return frame;
  }

  const pixels = frame.width * frame.height;
  const out = new Uint8ClampedArray(pixels * 4);

  for (let i = 0; i < pixels; i += 1) {
    const value = frame.data[i] as number;
    const offset = i * 4;

    out[offset] = value;
    out[offset + 1] = value;
    out[offset + 2] = value;
    out[offset + 3] = 255;
  }

  return Object.freeze({
    width: frame.width,
    height: frame.height,
    format: PixelFormat.Rgba,
    data: out,
    timestamp: frame.timestamp,
  });
}

/**
 * Reduces a frame by an integer factor, taking the top-left pixel of each block.
 *
 * Nearest-neighbour rather than averaging, deliberately: averaging blurs the
 * hard black-and-white edges a QR code is made of, and a blurred edge is
 * harder to threshold than a sharp one that moved slightly.
 *
 * @param factor Integer ≥ 1. A factor of 1 returns the frame unchanged.
 */
export function downsample(frame: CameraFrame, factor: number): CameraFrame {
  assertWellFormed(frame);

  if (!Number.isInteger(factor) || factor < 1) {
    throw new AppError(ErrorCode.CAMERA_ERROR, 'Downsample factor must be a positive integer.', {
      details: { factor },
    });
  }

  if (factor === 1) {
    return frame;
  }

  const stride = bytesPerPixel(frame.format);
  const width = Math.floor(frame.width / factor);
  const height = Math.floor(frame.height / factor);

  if (width === 0 || height === 0) {
    throw new AppError(ErrorCode.CAMERA_ERROR, 'Downsample factor is larger than the frame.', {
      details: { factor, width: frame.width, height: frame.height },
    });
  }

  const out = new Uint8ClampedArray(width * height * stride);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (y * factor * frame.width + x * factor) * stride;
      const to = (y * width + x) * stride;

      for (let channel = 0; channel < stride; channel += 1) {
        out[to + channel] = frame.data[from + channel] as number;
      }
    }
  }

  return Object.freeze({
    width,
    height,
    format: frame.format,
    data: out,
    timestamp: frame.timestamp,
  });
}

/**
 * Mean luminance of a grayscale frame, 0–255.
 *
 * §12 asks receivers to optimise exposure. A frame that is almost entirely
 * dark or almost entirely white will not decode, and knowing that cheaply is
 * more useful than attempting a decode that cannot succeed.
 */
export function meanLuminance(frame: CameraFrame): number {
  const grey = toGrayscale(frame);
  let total = 0;

  for (let i = 0; i < grey.data.length; i += 1) {
    total += grey.data[i] as number;
  }

  return grey.data.length === 0 ? 0 : total / grey.data.length;
}

/** Luminance bounds outside which a frame is unlikely to yield a decode. */
export const MIN_USABLE_LUMINANCE = 16;
export const MAX_USABLE_LUMINANCE = 240;

/**
 * Whether a frame is plausibly exposed well enough to attempt a decode.
 *
 * A cheap pre-filter, not a guarantee: a well-exposed frame may still contain
 * no QR code. Its value is skipping the expensive decode on frames captured
 * while the camera was covered or pointed at a light.
 */
export function isPlausiblyDecodable(frame: CameraFrame): boolean {
  const mean = meanLuminance(frame);
  return mean >= MIN_USABLE_LUMINANCE && mean <= MAX_USABLE_LUMINANCE;
}
