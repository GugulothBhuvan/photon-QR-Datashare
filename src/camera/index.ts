/**
 * camera/ — Adapter layer — optical transport, receive side
 *
 * Camera capture, QR detection and decoding. Ownership stops at the bytes; it
 * never parses packets.
 *
 * Purpose, ownership, dependency rules and public exports: see ./README.md.
 * Behaviour is defined by docs/QR_SPEC.md §12, §14, §18.
 */

export {
  bytesPerPixel,
  CameraPermission,
  isWellFormed,
  PixelFormat,
  type CameraAdapter,
  type CameraFrame,
  type FrameListener,
  type Unsubscribe,
} from './cameraPort';

export {
  downsample,
  isPlausiblyDecodable,
  MAX_USABLE_LUMINANCE,
  meanLuminance,
  MIN_USABLE_LUMINANCE,
  toGrayscale,
  toRgba,
} from './frameProcessor';

export {
  createQrDecoder,
  DecodeFailure,
  type DecodeMiss,
  type DecodeResult,
  type DecodeSuccess,
  type QrDecoder,
  type QrDecoderOptions,
  type SymbolLocation,
} from './qrDecoder';

export { createMemoryCamera, type MemoryCamera, type MemoryCameraOptions } from './memoryCamera';
