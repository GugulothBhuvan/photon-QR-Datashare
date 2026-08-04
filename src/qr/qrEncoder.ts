/**
 * QR encoder (QR-001) — QR_SPEC §4, §5, §6, §7.
 *
 * Turns one protocol packet into one QR frame (§5). The transport pipeline
 * §4 describes is `Binary Packet → QR Encoder → Frame Scheduler → Display`;
 * this is the first step and knows nothing of the two that follow.
 *
 * **Adapter layer.** This is the only module that names the QR library
 * (docs/decisions/0002-qr-library-selection.md). Everything above depends on
 * the `QrEncoder` interface, and the protocol engine cannot import this at all.
 *
 * §5 requires binary payloads to be preserved **exactly**. That is achieved by
 * construction rather than by care: the payload is handed to the library as a
 * byte-mode segment carrying the `Uint8Array` itself, so there is no text
 * boundary anywhere in the path and no character set to get wrong.
 *
 * The output is a matrix of modules, not an image. Rendering is §13's concern
 * and QR-002's, which keeps this testable with no display of any kind.
 */
import { create as createQrCode } from 'qrcode/lib/core/qrcode';

import { AppError, ErrorCode } from '@core/errors';

/**
 * Error correction levels (QR_SPEC §7).
 *
 * A sender MAY adjust the level to suit conditions; a receiver SHALL support
 * every advertised level, which it does implicitly — the level is carried in
 * the QR format information and read back when decoding.
 */
export const ErrorCorrectionLevel = {
  /** Recovers ~7% of a damaged code. Highest data capacity. */
  Low: 'L',
  /** ~15%. The default: the best balance for a hand-held optical link. */
  Medium: 'M',
  /** ~25%. */
  Quartile: 'Q',
  /** ~30%. Lowest data capacity. */
  High: 'H',
} as const;

export type ErrorCorrectionLevel = (typeof ErrorCorrectionLevel)[keyof typeof ErrorCorrectionLevel];

/**
 * Maximum byte-mode payload at QR version 40, per level.
 *
 * These are capacities defined by the QR standard (ISO/IEC 18004), not choices
 * made here. They are exposed so the transport can pick a packet size the
 * encoder will accept, rather than discovering the limit by failing.
 */
export const MAX_PAYLOAD_BYTES: Readonly<Record<ErrorCorrectionLevel, number>> = Object.freeze({
  [ErrorCorrectionLevel.Low]: 2953,
  [ErrorCorrectionLevel.Medium]: 2331,
  [ErrorCorrectionLevel.Quartile]: 1663,
  [ErrorCorrectionLevel.High]: 1273,
});

/** Lowest and highest QR versions (§6). */
export const MIN_QR_VERSION = 1;
export const MAX_QR_VERSION = 40;

/**
 * One encoded QR frame: a square matrix of dark and light modules.
 *
 * Deliberately not an image. §13 governs how this is drawn, and a matrix can be
 * rendered to SVG, canvas or native views without the encoder knowing which.
 */
export interface QrFrame {
  /** Modules per side. */
  readonly size: number;
  /** QR version, 1–40 (§6). */
  readonly version: number;
  /** Error correction level used (§7). */
  readonly level: ErrorCorrectionLevel;
  /** Mask pattern applied, 0–7. */
  readonly mask: number;
  /** Row-major modules, one byte each: 1 is dark, 0 is light. */
  readonly modules: Uint8Array;
}

export interface EncodeOptions {
  /** Error correction level (§7). Defaults to the encoder's. */
  readonly level?: ErrorCorrectionLevel;
  /**
   * QR version (§6). Defaults to automatic selection.
   *
   * §6 has the encoder SHOULD select the smallest version that fits, and MAY
   * select a larger one to improve scanning reliability — this is how a caller
   * asks for the latter.
   */
  readonly version?: number;
}

export interface QrEncoderOptions {
  readonly level?: ErrorCorrectionLevel;
  readonly version?: number;
}

export interface QrEncoder {
  /**
   * Encodes one packet's bytes into one QR frame (§5).
   *
   * @throws AppError when the payload exceeds QR capacity. §5 says an oversized
   *   packet is fragmented "according to the Protocol Specification" — the
   *   packet layer's job, not the encoder's — so this reports rather than
   *   silently splitting.
   */
  encode(payload: Uint8Array, options?: EncodeOptions): QrFrame;

  /** Largest payload the given level can carry, in bytes. */
  capacityFor(level: ErrorCorrectionLevel): number;
}

/** Reads a module out of a frame. */
export function moduleAt(frame: QrFrame, x: number, y: number): 0 | 1 {
  if (x < 0 || y < 0 || x >= frame.size || y >= frame.size) {
    throw new AppError(ErrorCode.INVALID_CONFIGURATION, 'Module coordinate is outside the frame.', {
      details: { x, y, size: frame.size },
    });
  }

  return frame.modules[y * frame.size + x] === 1 ? 1 : 0;
}

/**
 * Creates a QR encoder.
 *
 * Deterministic: the same payload, level and version always produce the same
 * matrix, including the same mask — the library scores masks by a fixed rule
 * rather than choosing at random.
 */
export function createQrEncoder(options: QrEncoderOptions = {}): QrEncoder {
  const defaultLevel = options.level ?? ErrorCorrectionLevel.Medium;
  const defaultVersion = options.version;

  return {
    capacityFor(level) {
      return MAX_PAYLOAD_BYTES[level];
    },

    encode(payload, encodeOptions = {}) {
      const level = encodeOptions.level ?? defaultLevel;
      const version = encodeOptions.version ?? defaultVersion;
      const capacity = MAX_PAYLOAD_BYTES[level];

      if (payload.byteLength > capacity) {
        throw new AppError(
          ErrorCode.INVALID_PACKET,
          `Payload of ${payload.byteLength} bytes exceeds QR capacity of ${capacity} at level ${level}.`,
          { details: { size: payload.byteLength, capacity, level } },
        );
      }

      if (
        version !== undefined &&
        (!Number.isInteger(version) || version < MIN_QR_VERSION || version > MAX_QR_VERSION)
      ) {
        throw new AppError(
          ErrorCode.INVALID_CONFIGURATION,
          'QR version must be between 1 and 40.',
          {
            details: { version },
          },
        );
      }

      let code;

      try {
        code = createQrCode(
          // §5: the payload crosses no text boundary. A byte-mode segment
          // carries the array itself, so every byte value survives unchanged.
          [{ data: payload, mode: 'byte' }],
          {
            errorCorrectionLevel: level,
            ...(version === undefined ? {} : { version }),
          },
        );
      } catch (error: unknown) {
        // A version too small for the payload, or any other library failure,
        // becomes a standardized error rather than an SDK exception crossing
        // the boundary (docs/API_SPEC.md §12).
        throw AppError.wrap(error, ErrorCode.INVALID_PACKET, {
          details: { size: payload.byteLength, level, version },
        });
      }

      return Object.freeze({
        size: code.modules.size,
        version: code.version,
        level,
        mask: code.maskPattern,
        // Copied so the library cannot hold a reference into a frame we have
        // frozen, and so a frame is genuinely immutable.
        modules: Uint8Array.from(code.modules.data),
      });
    },
  };
}
