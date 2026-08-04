/**
 * QR renderer (QR-002) — QR_SPEC §11, §13.
 */
import { AppError } from '@core/errors';
import { createQrEncoder, moduleAt } from '@qr/qrEncoder';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_FOREGROUND,
  DISPLAY_RECOMMENDATION,
  QUIET_ZONE_MODULES,
  renderFrame,
  toSvgPath,
} from '@qr/qrRenderer';

const encoder = createQrEncoder();
const frame = encoder.encode(Uint8Array.from({ length: 40 }, (_unused, i) => (i * 5) & 0xff));

describe('rendering guidelines (§13)', () => {
  it('uses a black foreground on a white background', () => {
    const rendered = renderFrame(frame, { targetSize: 400 });

    expect(rendered.foreground).toBe(DEFAULT_FOREGROUND);
    expect(rendered.background).toBe(DEFAULT_BACKGROUND);
  });

  it('uses opaque colours — §13 forbids transparency', () => {
    const rendered = renderFrame(frame, { targetSize: 400 });

    // Six-digit hex has no alpha channel; an eight-digit value would.
    expect(rendered.foreground).toMatch(/^#[0-9A-F]{6}$/i);
    expect(rendered.background).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('preserves a quiet zone of at least four modules', () => {
    const rendered = renderFrame(frame, { targetSize: 400 });

    expect(rendered.quietZone).toBe(QUIET_ZONE_MODULES * rendered.moduleSize);
  });

  it('refuses a quiet zone narrower than the standard', () => {
    // The commonest cause of codes that scan in testing and fail in the hand.
    expect(() => renderFrame(frame, { targetSize: 400, quietZoneModules: 2 })).toThrow(AppError);
  });

  it('accepts a wider quiet zone', () => {
    const rendered = renderFrame(frame, { targetSize: 400, quietZoneModules: 8 });

    expect(rendered.quietZone).toBe(8 * rendered.moduleSize);
  });

  it('is square', () => {
    const rendered = renderFrame(frame, { targetSize: 400 });
    const totalModules = frame.size + QUIET_ZONE_MODULES * 2;

    expect(rendered.size).toBe(rendered.moduleSize * totalModules);
  });

  it('gives every module identical whole-number dimensions — §13 forbids distortion', () => {
    const rendered = renderFrame(frame, { targetSize: 405 });

    expect(Number.isInteger(rendered.moduleSize)).toBe(true);
    for (const rect of rendered.modules) {
      expect(rect.width).toBe(rendered.moduleSize);
      expect(rect.height).toBe(rendered.moduleSize);
    }
  });

  it('never exceeds the target size', () => {
    for (const targetSize of [200, 333, 512, 1000]) {
      expect(renderFrame(frame, { targetSize }).size).toBeLessThanOrEqual(targetSize);
    }
  });

  it('allows explicit colours for a themed surface', () => {
    const rendered = renderFrame(frame, {
      targetSize: 400,
      foreground: '#101010',
      background: '#FAFAFA',
    });

    expect(rendered.foreground).toBe('#101010');
    expect(rendered.background).toBe('#FAFAFA');
  });
});

describe('geometry', () => {
  it('emits one rectangle per dark module and none per light module', () => {
    const rendered = renderFrame(frame, { targetSize: 400 });

    let dark = 0;
    for (let y = 0; y < frame.size; y += 1) {
      for (let x = 0; x < frame.size; x += 1) {
        if (moduleAt(frame, x, y) === 1) {
          dark += 1;
        }
      }
    }

    expect(rendered.modules).toHaveLength(dark);
  });

  it('offsets modules by the quiet zone', () => {
    const rendered = renderFrame(frame, { targetSize: 400 });

    // The top-left finder corner is dark, so the first rectangle sits exactly
    // one quiet zone in from the origin.
    expect(rendered.modules[0]).toEqual({
      x: rendered.quietZone,
      y: rendered.quietZone,
      width: rendered.moduleSize,
      height: rendered.moduleSize,
    });
  });

  it('keeps every module inside the rendered area', () => {
    const rendered = renderFrame(frame, { targetSize: 400 });

    for (const rect of rendered.modules) {
      expect(rect.x).toBeGreaterThanOrEqual(rendered.quietZone);
      expect(rect.x + rect.width).toBeLessThanOrEqual(rendered.size - rendered.quietZone);
      expect(rect.y + rect.height).toBeLessThanOrEqual(rendered.size - rendered.quietZone);
    }
  });

  it('is pure — the same frame and options give the same output', () => {
    expect(renderFrame(frame, { targetSize: 400 })).toEqual(
      renderFrame(frame, { targetSize: 400 }),
    );
  });

  it('is frozen', () => {
    const rendered = renderFrame(frame, { targetSize: 400 });

    expect(Object.isFrozen(rendered)).toBe(true);
    expect(Object.isFrozen(rendered.modules)).toBe(true);
  });

  it('rejects a target too small to give each module a whole unit', () => {
    expect(() => renderFrame(frame, { targetSize: 10 })).toThrow(AppError);
  });

  it('carries the version and level for adaptive decisions (§10)', () => {
    const rendered = renderFrame(frame, { targetSize: 400 });

    expect(rendered.version).toBe(frame.version);
    expect(rendered.level).toBe(frame.level);
  });
});

describe('toSvgPath', () => {
  it('produces one sub-path per dark module', () => {
    const rendered = renderFrame(frame, { targetSize: 400 });
    const path = toSvgPath(rendered);

    expect(path.split('M')).toHaveLength(rendered.modules.length + 1);
  });

  it('closes every sub-path, so fill rules cannot leave gaps', () => {
    const path = toSvgPath(renderFrame(frame, { targetSize: 400 }));

    expect(path.split('z')).toHaveLength(path.split('M').length);
  });

  it('is empty for a frame with no dark modules', () => {
    const blank = { ...frame, modules: new Uint8Array(frame.size * frame.size) };

    expect(toSvgPath(renderFrame(blank, { targetSize: 400 }))).toBe('');
  });
});

describe('display recommendations (§11)', () => {
  it('reports the §11 guidance without acting on it', () => {
    // Brightness, sleep and orientation are device concerns owned by the UI.
    expect(DISPLAY_RECOMMENDATION).toEqual({
      maximiseBrightness: true,
      preventSleep: true,
      lockOrientation: true,
      avoidOverlays: true,
    });
  });

  it('is frozen', () => {
    expect(Object.isFrozen(DISPLAY_RECOMMENDATION)).toBe(true);
  });
});
