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
import {
  clampRegion,
  crop,
  isPlausiblyDecodable,
  toRgba,
  type FrameRegion,
} from './frameProcessor';

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
  /**
   * Whether to decode from a crop around the last symbol's position.
   *
   * On by default, and it is the difference between a receiver that keeps up
   * with a sender and one that does not. A decoder spends most of its time
   * *locating* a symbol, and that cost scales with the pixels it searches. Once
   * a code has been found, searching the whole frame for it again is work with
   * a known answer — a crop is a twentieth of the pixels for the same result.
   *
   * Correctness does not depend on it: a crop that misses falls straight
   * through to a full scan on the same frame, so a code that moves, or a
   * second code appearing elsewhere, is found on the next frame at the latest.
   */
  readonly trackSymbols?: boolean;
  /**
   * How long a tracked position is trusted, in frame-timestamp milliseconds.
   *
   * A stale position is worse than none: it aims every crop at where a code
   * used to be, and the full scans that would find it again never run. Short
   * enough that a moved phone re-acquires quickly.
   */
  readonly trackTtlMs?: number;
  /**
   * Padding around a tracked symbol, as a fraction of its size.
   *
   * The crop has to lead a handheld receiver rather than chase it, and a code
   * clipped by its own crop decodes no better than one that is absent.
   */
  readonly trackPadding?: number;
}

/** What decoding has cost so far. */
export interface DecoderStats {
  /** Frames put through `decode`, whatever the outcome. */
  readonly decodes: number;
  /**
   * Mean milliseconds per decode.
   *
   * The number that turns "the receiver is slow" into something that can be
   * optimised. Measured here rather than by a caller because this is the layer
   * that knows what a decode *is*: the crop attempt, the fallback full scan
   * and the exposure screen are all inside it.
   */
  readonly meanMs: number;
  /** Frames a crop decoded without a full scan — the tracking hit rate. */
  readonly trackedHits: number;
}

export interface QrDecoder {
  /**
   * Attempts to decode one frame (§14, §18).
   *
   * Reports rather than throws. A frame containing no code is the normal case
   * — a camera produces dozens per second — not an exceptional one.
   */
  decode(frame: CameraFrame): DecodeResult;
  /** Cumulative decoding cost, for §12's "as quickly as practical". */
  stats(): DecoderStats;
}

/** Creates a QR decoder. */
export function createQrDecoder(options: QrDecoderOptions = {}): QrDecoder {
  const skipPoorExposure = options.skipPoorExposure ?? true;
  const trackSymbols = options.trackSymbols ?? true;
  const trackTtlMs = options.trackTtlMs ?? 1_500;
  const trackPadding = options.trackPadding ?? 0.4;

  /** Where the last symbol was, and when — the crop path's anchor. */
  let tracked: { region: FrameRegion; at: number } | undefined;

  let decodes = 0;
  let totalMs = 0;
  let trackedHits = 0;

  /** The axis-aligned box a located symbol occupies, padded to lead movement. */
  function paddedRegion(location: SymbolLocation): FrameRegion {
    const xs = [
      location.topLeft.x,
      location.topRight.x,
      location.bottomLeft.x,
      location.bottomRight.x,
    ];
    const ys = [
      location.topLeft.y,
      location.topRight.y,
      location.bottomLeft.y,
      location.bottomRight.y,
    ];

    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const width = Math.max(...xs) - left;
    const height = Math.max(...ys) - top;

    return {
      x: left - width * trackPadding,
      y: top - height * trackPadding,
      width: width * (1 + trackPadding * 2),
      height: height * (1 + trackPadding * 2),
    };
  }

  /** Moves a location from crop coordinates back into frame coordinates. */
  function shift(location: SymbolLocation, dx: number, dy: number): SymbolLocation {
    const move = (point: { readonly x: number; readonly y: number }) => ({
      x: point.x + dx,
      y: point.y + dy,
    });

    return Object.freeze({
      topLeft: move(location.topLeft),
      topRight: move(location.topRight),
      bottomLeft: move(location.bottomLeft),
      bottomRight: move(location.bottomRight),
    });
  }

  /** One jsQR pass over a frame or a crop of one. */
  function scan(target: CameraFrame): { binaryData: unknown; location: SymbolLocation } | null {
    const rgba = toRgba(target);

    try {
      // The library locates the symbol, corrects perspective and resolves
      // error correction — §14's four requirements — or returns null.
      const result = jsQR(rgba.data, rgba.width, rgba.height);

      if (result === null) {
        return null;
      }

      return {
        binaryData: result.binaryData,
        location: Object.freeze({
          topLeft: result.location.topLeftCorner,
          topRight: result.location.topRightCorner,
          bottomLeft: result.location.bottomLeftCorner,
          bottomRight: result.location.bottomRightCorner,
        }),
      };
    } catch (error: unknown) {
      // A library failure becomes a standardized error rather than an SDK
      // exception crossing the boundary (docs/API_SPEC.md §12).
      throw AppError.wrap(error, ErrorCode.CAMERA_ERROR, {
        details: { width: target.width, height: target.height },
      });
    }
  }

  return {
    stats() {
      return {
        decodes,
        meanMs: decodes === 0 ? 0 : totalMs / decodes,
        trackedHits,
      };
    },

    decode(frame) {
      const startedAt = Date.now();
      decodes += 1;

      try {
        return attempt(frame);
      } finally {
        totalMs += Date.now() - startedAt;
      }
    },
  };

  /** The decode itself, wrapped above so timing covers every exit. */
  function attempt(frame: CameraFrame): DecodeResult {
    {
      if (!isWellFormed(frame)) {
        return { ok: false, reason: DecodeFailure.MalformedFrame };
      }

      if (skipPoorExposure && !isPlausiblyDecodable(frame)) {
        return { ok: false, reason: DecodeFailure.PoorExposure };
      }

      let found: { binaryData: unknown; location: SymbolLocation } | null = null;

      // **The crop first.** Locating a symbol is most of a decode's cost, and
      // that cost scales with pixels searched. A code already found sits in a
      // small part of the frame, so searching the whole frame for it again is
      // work whose answer is known.
      const anchor =
        trackSymbols && tracked !== undefined && frame.timestamp - tracked.at <= trackTtlMs
          ? tracked.region
          : undefined;

      if (anchor !== undefined) {
        const box = clampRegion(frame, anchor);
        const hit = scan(crop(frame, box));

        if (hit !== null) {
          trackedHits += 1;
          // Back into frame coordinates: everything above this layer describes
          // positions in the frame it was handed, not in a crop it never saw.
          found = { binaryData: hit.binaryData, location: shift(hit.location, box.x, box.y) };
        }
      }

      // A crop that misses falls through to the whole frame on the same frame,
      // so nothing is delayed by tracking — a code that moved, or a second one
      // elsewhere, is found now rather than next time.
      found ??= scan(frame);

      if (found === null) {
        // The position is no longer producing decodes. Dropping it now means
        // the next frame pays for a full scan instead of aiming at a code that
        // has gone.
        tracked = undefined;
        return { ok: false, reason: DecodeFailure.NoSymbol };
      }

      // §18: payload extraction is part of transport validation. A located
      // symbol carrying no bytes has not been decoded, whatever else succeeded.
      if (!Array.isArray(found.binaryData) || found.binaryData.length === 0) {
        return { ok: false, reason: DecodeFailure.UnreadableSymbol };
      }

      if (trackSymbols) {
        tracked = { region: paddedRegion(found.location), at: frame.timestamp };
      }

      return {
        ok: true,
        // §14: forwarded unchanged. The only transformation is from the
        // library's number array into the byte array the packet layer expects.
        payload: Uint8Array.from(found.binaryData),
        location: found.location,
        timestamp: frame.timestamp,
      };
    }
  }
}
