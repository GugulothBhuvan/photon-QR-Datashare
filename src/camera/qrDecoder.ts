/**
 * QR detection and decoding (CAM-003, CAM-004) — QR_SPEC §14, §18.
 *
 * §14 requires the decoder to detect QR symbols, correct perspective
 * distortion where supported, decode payload bytes, and validate QR integrity.
 * All four are satisfied by the decoding library (ADR-0003); this module owns
 * the boundary around it.
 *
 * Two rules from the specification shape that boundary:
 *
 * - **§14: "Decoded payloads SHALL be forwarded unchanged to the Packet
 *   Layer."** The bytes the decoder produces are passed on exactly. Nothing
 *   here inspects, trims or reinterprets them — this module does not know what
 *   a packet is, and `planning/DEPENDENCIES.md` §5 forbids it from depending on
 *   packet serialization.
 * - **§18: "Every decoded frame SHALL be validated before being forwarded."**
 *   Validation at this layer means transport integrity: a symbol was found, its
 *   error correction resolved, and payload bytes were extracted. Packet
 *   validation is PACKET_SPEC's and happens above.
 */
import jsQR from 'jsqr';

import { AppError, ErrorCode } from '@core/errors';

import { isWellFormed, type CameraFrame } from './cameraPort';
import { isPlausiblyDecodable, toRgba } from './frameProcessor';

/** Why a frame produced no payload. */
export const DecodeFailure = {
  /** The frame's buffer does not match its dimensions. */
  MalformedFrame: 'MALFORMED_FRAME',
  /** Too dark or too bright to be worth attempting (§12: optimise exposure). */
  PoorExposure: 'POOR_EXPOSURE',
  /** No QR symbol was located in the frame (§14). */
  NoSymbol: 'NO_SYMBOL',
  /** A symbol was located but its data could not be recovered (§18). */
  UnreadableSymbol: 'UNREADABLE_SYMBOL',
} as const;

export type DecodeFailure = (typeof DecodeFailure)[keyof typeof DecodeFailure];

/** Where a symbol was found, for framing guidance in the UI. */
export interface SymbolLocation {
  readonly topLeft: { readonly x: number; readonly y: number };
  readonly topRight: { readonly x: number; readonly y: number };
  readonly bottomLeft: { readonly x: number; readonly y: number };
  readonly bottomRight: { readonly x: number; readonly y: number };
}

/** A frame that yielded a payload. */
export interface DecodeSuccess {
  readonly ok: true;
  /**
   * The payload bytes, forwarded unchanged (§14).
   *
   * This is what the packet layer parses. Nothing in this module interprets it.
   */
  readonly payload: Uint8Array;
  readonly location: SymbolLocation;
  /** Frame capture time, carried through for ordering and diagnostics. */
  readonly timestamp: number;
}

/** A frame that did not. */
export interface DecodeMiss {
  readonly ok: false;
  readonly reason: DecodeFailure;
}

export type DecodeResult = DecodeSuccess | DecodeMiss;

export interface QrDecoderOptions {
  /**
   * Whether to skip frames whose exposure makes a decode implausible.
   *
   * On by default: an optical link produces far more unusable frames than
   * usable ones, and the check is orders of magnitude cheaper than a decode.
   */
  readonly skipPoorExposure?: boolean;
}

export interface QrDecoder {
  /**
   * Attempts to decode one frame (§14, §18).
   *
   * Reports rather than throws. A frame containing no code is the normal case
   * — a camera produces dozens per second — not an exceptional one.
   */
  decode(frame: CameraFrame): DecodeResult;
}

/** Creates a QR decoder. */
export function createQrDecoder(options: QrDecoderOptions = {}): QrDecoder {
  const skipPoorExposure = options.skipPoorExposure ?? true;

  return {
    decode(frame) {
      if (!isWellFormed(frame)) {
        return { ok: false, reason: DecodeFailure.MalformedFrame };
      }

      if (skipPoorExposure && !isPlausiblyDecodable(frame)) {
        return { ok: false, reason: DecodeFailure.PoorExposure };
      }

      const rgba = toRgba(frame);
      let found;

      try {
        // The library locates the symbol, corrects perspective and resolves
        // error correction — §14's four requirements — or returns null.
        found = jsQR(rgba.data, rgba.width, rgba.height);
      } catch (error: unknown) {
        // A library failure becomes a standardized error rather than an SDK
        // exception crossing the boundary (docs/API_SPEC.md §12).
        throw AppError.wrap(error, ErrorCode.CAMERA_ERROR, {
          details: { width: frame.width, height: frame.height },
        });
      }

      if (found === null) {
        return { ok: false, reason: DecodeFailure.NoSymbol };
      }

      // §18: payload extraction is part of transport validation. A located
      // symbol carrying no bytes has not been decoded, whatever else succeeded.
      if (!Array.isArray(found.binaryData) || found.binaryData.length === 0) {
        return { ok: false, reason: DecodeFailure.UnreadableSymbol };
      }

      return {
        ok: true,
        // §14: forwarded unchanged. The only transformation is from the
        // library's number array into the byte array the packet layer expects.
        payload: Uint8Array.from(found.binaryData),
        location: Object.freeze({
          topLeft: found.location.topLeftCorner,
          topRight: found.location.topRightCorner,
          bottomLeft: found.location.bottomLeftCorner,
          bottomRight: found.location.bottomRightCorner,
        }),
        timestamp: frame.timestamp,
      };
    },
  };
}
