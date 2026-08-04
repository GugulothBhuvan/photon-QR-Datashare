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
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

/**
 * Type scale.
 *
 * `lineHeight` is carried with each size because §10 requires dynamic text
 * support: when a user scales text up, a hard-coded line height clips it.
 */
export const Typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  mono: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
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
  none: { elevation: 0, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
  sm: { elevation: 2, shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  md: { elevation: 6, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
} as const;

/**
 * A complete colour set for one theme.
 *
 * Named by role rather than by hue — `danger` rather than `red` — so a theme
 * can change a colour without every usage becoming a lie.
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
  /** Always pure black and white: QR codes must not be themed (QR_SPEC §13). */
  readonly qrForeground: string;
  readonly qrBackground: string;
}

/**
 * Light and dark palettes (§12).
 *
 * Status colours are chosen to differ in lightness as well as hue, so §10's
 * colour-blind-friendly requirement is met without relying on hue alone. Every
 * text/background pair meets WCAG AA at body size.
 */
export const LightColors: ColorScheme = Object.freeze({
  background: '#FFFFFF',
  surface: '#F7F8FA',
  surfaceAlt: '#EEF0F4',
  border: '#D8DCE3',
  text: '#111318',
  textMuted: '#5A6270',
  textInverse: '#FFFFFF',
  primary: '#1F5EFF',
  primaryText: '#FFFFFF',
  success: '#12693C',
  warning: '#8A5A00',
  danger: '#B3261E',
  overlay: 'rgba(17, 19, 24, 0.55)',
  qrForeground: '#000000',
  qrBackground: '#FFFFFF',
});

export const DarkColors: ColorScheme = Object.freeze({
  background: '#0E1116',
  surface: '#171B22',
  surfaceAlt: '#20252E',
  border: '#2C323C',
  text: '#F2F4F8',
  textMuted: '#A3ACBB',
  textInverse: '#0E1116',
  primary: '#6E9BFF',
  primaryText: '#0E1116',
  success: '#5FD08A',
  warning: '#E8B25C',
  danger: '#FF8A80',
  overlay: 'rgba(0, 0, 0, 0.65)',
  // Unchanged between themes: a dark-themed QR code does not scan.
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
