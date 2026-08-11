import { Platform } from 'react-native';

/**
 * Design tokens (UI_SPEC §17, §12).
 *
 * §17 requires the design system to define colours, typography, spacing,
 * radius, shadows, icon sizes and animation durations. This is that
 * definition — one place, so that §18.8's "visual design SHALL remain
 * consistent" is achievable rather than aspirational.
 *
 * Tokens are values, not styles. They live in `constants` because they are
 * shared compile-time constants with no behaviour, which means the design
 * system can be read by anything without pulling in React.
 */

/**
 * Spacing scale, in density-independent pixels.
 *
 * A 4-point scale: every gap in the application is one of these, so vertical
 * rhythm holds without anyone measuring.
 */
export const Spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export type Spacing = (typeof Spacing)[keyof typeof Spacing];

/** Corner radii. */
export const Radius = {
  none: 0,
  // Square by design. A terminal has corners; rounding them was the single
  // biggest thing making the interface read as a generic mobile app.
  sm: 0,
  md: 0,
  lg: 0,
  pill: 999,
} as const;

/**
 * Type scale.
 *
 * `lineHeight` is carried with each size because §10 requires dynamic text
 * support: when a user scales text up, a hard-coded line height clips it.
 */
/**
 * The monospace family, per platform.
 *
 * Every size uses it. A terminal's whole legibility comes from a fixed advance
 * width — packet counts, hashes and session ids line up in columns without any
 * layout work, and mixing a proportional face in would undo that.
 */
export const MONO_FAMILY = Platform.select({
  android: 'monospace',
  ios: 'Menlo',
  default: 'Courier New',
});

export const Typography = {
  display: { fontSize: 26, lineHeight: 34, fontWeight: '700', fontFamily: MONO_FAMILY },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '700', fontFamily: MONO_FAMILY },
  heading: { fontSize: 15, lineHeight: 22, fontWeight: '700', fontFamily: MONO_FAMILY },
  body: { fontSize: 14, lineHeight: 22, fontWeight: '400', fontFamily: MONO_FAMILY },
  label: { fontSize: 13, lineHeight: 20, fontWeight: '500', fontFamily: MONO_FAMILY },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '400', fontFamily: MONO_FAMILY },
  mono: { fontSize: 13, lineHeight: 20, fontWeight: '400', fontFamily: MONO_FAMILY },
} as const;

export type TypographyToken = keyof typeof Typography;

/**
 * Minimum touch target, in density-independent pixels.
 *
 * §2 requires large touch targets and §8 requires one-handed usability. 48 is
 * the smaller of the two platform guidelines (Android 48, iOS 44), so meeting
 * it satisfies both.
 */
export const MIN_TOUCH_TARGET = 48;

/** Icon sizes (§17). */
export const IconSize = {
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
} as const;

/**
 * Animation durations, in milliseconds (§13).
 *
 * §13 asks for short, functional animations, and §13's closing line is the
 * binding one: animations SHALL never delay protocol execution. Nothing here
 * is long enough to matter, and no protocol path waits on one.
 */
export const Duration = {
  instant: 0,
  fast: 120,
  normal: 200,
  slow: 320,
} as const;

/** Elevation shadows (§17), expressed so both platforms can consume them. */
export const Shadow = {
  // All flat. Elevation implies a material surface floating above another,
  // which is the opposite of what a terminal is: one plane, divided by rules.
  none: { elevation: 0, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
  sm: { elevation: 0, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
  md: { elevation: 0, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
} as const;

/**
 * A complete set of surface and content colours.
 *
 * Every colour a screen may use is named here. A component that reached for a
 * literal would be one the theme could not follow.
 */
export interface ColorScheme {
  readonly background: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textInverse: string;
  readonly primary: string;
  readonly primaryText: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly overlay: string;
  /**
   * QR colours, which are **not** part of the theme.
   *
   * QR_SPEC §13 requires black on white with no transparency. A dark-themed QR
   * code does not scan, so these are identical in every scheme and a screen
   * must never substitute a themed colour for them.
   */
  readonly qrForeground: string;
  readonly qrBackground: string;
}

export const LightColors: ColorScheme = Object.freeze({
  // The same terminal on paper, for anyone who cannot read light-on-dark.
  // Amber is darkened to keep contrast on a pale ground; the logo's #FBB040
  // sits at about 2:1 on cream, which is unreadable as text.
  background: '#FAF7F0',
  surface: '#F3EFE4',
  surfaceAlt: '#EBE5D6',
  border: '#D6CBB2',
  text: '#2E2208',
  textMuted: '#6E5518',
  textInverse: '#FAF7F0',
  primary: '#9A6B0F',
  primaryText: '#FFFFFF',
  success: '#5C4A12',
  warning: '#8A5A00',
  danger: '#A33116',
  overlay: 'rgba(46, 34, 8, 0.5)',
  // Never themed. See the note on ColorScheme.
  qrForeground: '#000000',
  qrBackground: '#FFFFFF',
});

export const DarkColors: ColorScheme = Object.freeze({
  // Amber phosphor. #FBB040 is the logo's only colour, and amber on near-black
  // is what a photon-carrying terminal should look like. Contrast of amber on
  // this ground is roughly 10:1 — comfortably past WCAG AA for body text.
  background: '#0B0B0C',
  surface: '#121210',
  surfaceAlt: '#17150F',
  // Rules, not boxes. Dividing one plane rather than stacking several.
  border: '#2A2118',
  text: '#FBB040',
  // Dimmed amber rather than grey: a second hue would break the monochrome.
  // Roughly 6:1 on the ground, so captions stay readable.
  textMuted: '#B8873A',
  textInverse: '#0B0B0C',
  primary: '#FBB040',
  primaryText: '#0B0B0C',
  // Semantic states stay inside the amber family and separate by brightness,
  // except danger — a refusal is the one thing worth breaking the palette for.
  success: '#FFD98A',
  warning: '#FF9F1C',
  danger: '#FF6B4A',
  overlay: 'rgba(11, 11, 12, 0.85)',
  // **Never themed.** §13 requires black on white, and a dark QR does not
  // scan — the receiver's camera needs the contrast the standard assumes.
  qrForeground: '#000000',
  qrBackground: '#FFFFFF',
});

/** Resolves a colour scheme from the theme setting and the device's preference. */
export function colorsFor(theme: 'LIGHT' | 'DARK' | 'SYSTEM', systemIsDark: boolean): ColorScheme {
  if (theme === 'LIGHT') {
    return LightColors;
  }
  if (theme === 'DARK') {
    return DarkColors;
  }
  return systemIsDark ? DarkColors : LightColors;
}
