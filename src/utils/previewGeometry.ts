/**
 * Where a located symbol sits on screen.
 *
 * The decoder reports a symbol's corners in **frame** pixels — a 960×720
 * capture, say. The preview draws that frame into a view of a different size
 * and usually a different aspect, so a corner at (480, 360) is not at (480,
 * 360) on screen. This converts one to the other.
 *
 * **The assumption, stated because it is the thing that can be wrong.** The
 * preview is taken to fill its view — scaled up until it covers, centred, with
 * the overflow cropped equally on both sides, and in the same orientation as
 * the frame. That is what `resizeMode="cover"` does. If a device delivers
 * frames rotated relative to its preview, the mapping is wrong in a way only a
 * device can reveal, which is why `isPlausible` exists: a caller that gets an
 * implausible box should draw a static target rather than a confident lie.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Quad {
  readonly topLeft: Point;
  readonly topRight: Point;
  readonly bottomLeft: Point;
  readonly bottomRight: Point;
}

/** A box in view coordinates, ready to position an overlay with. */
export interface PreviewBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Maps a symbol's bounding box from frame pixels into view points.
 *
 * Returns `undefined` when either size is degenerate, so a caller never has to
 * guard against a division by zero it did not cause.
 */
export function symbolToPreview(
  quad: Quad,
  frame: FrameSize,
  preview: FrameSize,
): PreviewBox | undefined {
  if (frame.width <= 0 || frame.height <= 0 || preview.width <= 0 || preview.height <= 0) {
    return undefined;
  }

  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomLeft.x, quad.bottomRight.x];
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomLeft.y, quad.bottomRight.y];

  // Cover: whichever axis needs the larger scale decides, so the frame fills
  // the view and the other axis overflows.
  const scale = Math.max(preview.width / frame.width, preview.height / frame.height);

  // The overflow is cropped equally at both ends, which is what centring means.
  const offsetX = (frame.width * scale - preview.width) / 2;
  const offsetY = (frame.height * scale - preview.height) / 2;

  const left = Math.min(...xs) * scale - offsetX;
  const top = Math.min(...ys) * scale - offsetY;

  return {
    left,
    top,
    width: (Math.max(...xs) - Math.min(...xs)) * scale,
    height: (Math.max(...ys) - Math.min(...ys)) * scale,
  };
}

/**
 * Whether a mapped box is worth drawing.
 *
 * A tracker in the wrong place is worse than no tracker: it tells a user their
 * aim is wrong when it is not, and they move the phone away from a code the
 * receiver was reading perfectly well. So a box that is mostly off-screen, or
 * absurdly small or large, is treated as a mapping this build got wrong rather
 * than as a symbol in a strange place.
 */
export function isPlausible(box: PreviewBox, preview: FrameSize): boolean {
  if (box.width <= 0 || box.height <= 0) {
    return false;
  }

  const shortest = Math.min(preview.width, preview.height);

  // A QR filling less than a twentieth of the view will not decode anyway, and
  // one larger than the view means the mapping, not the aim, is wrong.
  if (box.width < shortest * 0.05 || box.width > preview.width * 1.5) {
    return false;
  }

  // Its centre has to be somewhere a user is actually pointing.
  const centreX = box.left + box.width / 2;
  const centreY = box.top + box.height / 2;

  return (
    centreX > -preview.width * 0.25 &&
    centreX < preview.width * 1.25 &&
    centreY > -preview.height * 0.25 &&
    centreY < preview.height * 1.25
  );
}
