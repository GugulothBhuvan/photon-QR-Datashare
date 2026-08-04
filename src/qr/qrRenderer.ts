/**
 * QR renderer (QR-002) — QR_SPEC §11, §13.
 *
 * Turns an encoded frame into a *drawable description* — a set of rectangles,
 * a viewport and the colours to use. It does not draw. Drawing needs a display,
 * and a module that needs a display cannot be tested without one.
 *
 * §13's rendering guidelines are enforced here rather than left to each screen:
 * black on white, a preserved quiet zone, a square aspect ratio, no
 * transparency. A component that renders what this produces satisfies §13 by
 * construction; one that invents its own geometry does not.
 *
 * §11's display requirements — brightness, sleep prevention, orientation — are
 * device concerns and belong to the UI layer. This module reports the
 * recommendation (§10 lists Frame Brightness Recommendation as an adaptive
 * parameter); it cannot act on it.
 */
import { AppError, ErrorCode } from '@core/errors';

import { moduleAt, type QrFrame } from './qrEncoder';

/**
 * Quiet zone width in modules.
 *
 * Four is the QR standard's requirement (ISO/IEC 18004) and what §13 means by
 * "quiet zone preserved". Narrowing it is the most common cause of codes that
 * scan in testing and fail in a user's hands.
 */
export const QUIET_ZONE_MODULES = 4;

/** §13: black foreground, white background, no transparency. */
export const DEFAULT_FOREGROUND = '#000000';
export const DEFAULT_BACKGROUND = '#FFFFFF';

/** A dark module's position and size, in rendering units. */
export interface ModuleRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Everything needed to draw one frame, and nothing device-specific.
 *
 * Only dark modules are listed: the background is painted once, which is both
 * fewer draw operations and a guarantee that light modules cannot be drawn in
 * the wrong colour.
 */
export interface RenderedFrame {
  /** Side length in rendering units, including the quiet zone. Square (§13). */
  readonly size: number;
  /** Side length of one module in rendering units. */
  readonly moduleSize: number;
  /** Quiet zone width in rendering units. */
  readonly quietZone: number;
  /** Dark modules to draw, row-major. */
  readonly modules: readonly ModuleRect[];
  readonly foreground: string;
  readonly background: string;
  /** QR version and level, for diagnostics and adaptive decisions (§10). */
  readonly version: number;
  readonly level: string;
}

export interface RenderOptions {
  /**
   * Target side length in rendering units, including the quiet zone.
   *
   * The module size is derived from this and floored to a whole number:
   * fractional module sizes produce seams and blurred edges, which §13's "no
   * distortion" rules out. The rendered size is therefore at most the target.
   */
  readonly targetSize: number;
  readonly foreground?: string;
  readonly background?: string;
  /** Quiet zone in modules. Defaults to the standard 4; never less. */
  readonly quietZoneModules?: number;
}

/** Display guidance for the sender (§11), reported rather than applied. */
export interface DisplayRecommendation {
  /** §11: use maximum practical screen brightness. */
  readonly maximiseBrightness: boolean;
  /** §11: prevent screen sleep during transmission. */
  readonly preventSleep: boolean;
  /** §11: maintain fixed orientation during transmission. */
  readonly lockOrientation: boolean;
  /** §11: UI overlays should not obscure the code. */
  readonly avoidOverlays: boolean;
}

/** The §11 recommendations, which do not vary. */
export const DISPLAY_RECOMMENDATION: DisplayRecommendation = Object.freeze({
  maximiseBrightness: true,
  preventSleep: true,
  lockOrientation: true,
  avoidOverlays: true,
});

/**
 * Produces a drawable description of a frame.
 *
 * Pure: the same frame and options always give the same rectangles.
 */
export function renderFrame(frame: QrFrame, options: RenderOptions): RenderedFrame {
  const quietZoneModules = options.quietZoneModules ?? QUIET_ZONE_MODULES;

  if (quietZoneModules < QUIET_ZONE_MODULES) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      `Quiet zone must be at least ${QUIET_ZONE_MODULES} modules (QR_SPEC §13).`,
      { details: { quietZoneModules } },
    );
  }

  const totalModules = frame.size + quietZoneModules * 2;

  if (!Number.isFinite(options.targetSize) || options.targetSize < totalModules) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'Target size is too small to give every module at least one unit.',
      { details: { targetSize: options.targetSize, totalModules } },
    );
  }

  // Floored so every module is the same whole number of units — §13 forbids
  // distortion, and uneven module widths are exactly that.
  const moduleSize = Math.floor(options.targetSize / totalModules);
  const quietZone = quietZoneModules * moduleSize;
  const modules: ModuleRect[] = [];

  for (let y = 0; y < frame.size; y += 1) {
    for (let x = 0; x < frame.size; x += 1) {
      if (moduleAt(frame, x, y) === 1) {
        modules.push(
          Object.freeze({
            x: quietZone + x * moduleSize,
            y: quietZone + y * moduleSize,
            width: moduleSize,
            height: moduleSize,
          }),
        );
      }
    }
  }

  return Object.freeze({
    // Square by construction (§13).
    size: moduleSize * totalModules,
    moduleSize,
    quietZone,
    modules: Object.freeze(modules),
    foreground: options.foreground ?? DEFAULT_FOREGROUND,
    background: options.background ?? DEFAULT_BACKGROUND,
    version: frame.version,
    level: frame.level,
  });
}

/**
 * Renders a frame as an SVG path string.
 *
 * Offered because one path covering every dark module is dramatically cheaper
 * to draw than one element per module — a version 40 code has over 30,000
 * modules — and because SVG is the one rendering primitive available on every
 * target without a new dependency.
 */
export function toSvgPath(rendered: RenderedFrame): string {
  return rendered.modules
    .map((rect) => `M${rect.x} ${rect.y}h${rect.width}v${rect.height}h-${rect.width}z`)
    .join('');
}
