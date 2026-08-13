/**
 * Mapping a located symbol onto the preview (F9).
 *
 * A tracker in the wrong place is worse than no tracker: it tells a user their
 * aim is wrong when it is not, and they move the phone away from a code the
 * receiver was reading perfectly well. So the plausibility guard is tested as
 * carefully as the arithmetic.
 */
import { isPlausible, symbolToPreview, type Quad } from '@utils/previewGeometry';

/** A square symbol, given as the four corners a decoder reports. */
function square(x: number, y: number, size: number): Quad {
  return {
    topLeft: { x, y },
    topRight: { x: x + size, y },
    bottomLeft: { x, y: y + size },
    bottomRight: { x: x + size, y: y + size },
  };
}

describe('symbolToPreview', () => {
  it('places a centred symbol at the centre of the view', () => {
    // 960x720 into a 400x400 square: scale 400/720, and the extra width is
    // cropped equally either side.
    const frame = { width: 960, height: 720 };
    const preview = { width: 400, height: 400 };
    const box = symbolToPreview(square(430, 310, 100), frame, preview);

    expect(box).toBeDefined();
    if (box !== undefined) {
      expect(box.left + box.width / 2).toBeCloseTo(preview.width / 2, 0);
      expect(box.top + box.height / 2).toBeCloseTo(preview.height / 2, 0);
    }
  });

  it('scales the symbol by the same factor as the frame', () => {
    const box = symbolToPreview(
      square(0, 0, 360),
      { width: 960, height: 720 },
      { width: 400, height: 400 },
    );

    // Half the frame height, so half the view height.
    expect(box?.height).toBeCloseTo(200, 0);
    expect(box?.width).toBeCloseTo(200, 0);
  });

  it('maps a symbol left of centre to the left of the view', () => {
    const box = symbolToPreview(
      square(100, 310, 100),
      { width: 960, height: 720 },
      { width: 400, height: 400 },
    );

    expect(box?.left).toBeLessThan(200);
  });

  it('handles a preview with the same aspect as the frame', () => {
    // No crop at all: scale is the only transformation.
    const box = symbolToPreview(
      square(100, 100, 100),
      { width: 800, height: 400 },
      { width: 400, height: 200 },
    );

    expect(box?.left).toBeCloseTo(50, 0);
    expect(box?.top).toBeCloseTo(50, 0);
    expect(box?.width).toBeCloseTo(50, 0);
  });

  it('refuses a degenerate size rather than dividing by zero', () => {
    expect(
      symbolToPreview(square(0, 0, 10), { width: 0, height: 720 }, { width: 1, height: 1 }),
    ).toBeUndefined();
    expect(
      symbolToPreview(square(0, 0, 10), { width: 960, height: 720 }, { width: 0, height: 1 }),
    ).toBeUndefined();
  });
});

describe('isPlausible', () => {
  const preview = { width: 400, height: 400 };

  it('accepts a symbol filling a reasonable part of the view', () => {
    expect(isPlausible({ left: 100, top: 100, width: 200, height: 200 }, preview)).toBe(true);
  });

  it('rejects a symbol too small to have decoded', () => {
    expect(isPlausible({ left: 200, top: 200, width: 8, height: 8 }, preview)).toBe(false);
  });

  it('rejects a symbol larger than the view, which means the mapping is wrong', () => {
    expect(isPlausible({ left: 0, top: 0, width: 900, height: 900 }, preview)).toBe(false);
  });

  it('rejects a symbol whose centre is nowhere near the view', () => {
    expect(isPlausible({ left: 900, top: 100, width: 200, height: 200 }, preview)).toBe(false);
  });

  it('accepts a symbol clipped by the edge, which is an ordinary aim', () => {
    expect(isPlausible({ left: -40, top: 100, width: 200, height: 200 }, preview)).toBe(true);
  });

  it('rejects a zero-sized box', () => {
    expect(isPlausible({ left: 0, top: 0, width: 0, height: 0 }, preview)).toBe(false);
  });
});
