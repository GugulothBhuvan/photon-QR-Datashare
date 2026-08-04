/**
 * Text (UI_SPEC §10, §17).
 *
 * Wraps the platform text component so every string in the application picks
 * its size from the type scale rather than a literal. That is what makes §10's
 * dynamic text support possible: line heights travel with sizes, so scaling up
 * does not clip.
 */
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { Typography, type TypographyToken } from '@constants/tokens';

import { useTheme } from './ThemeProvider';

export interface TextProps extends RNTextProps {
  /** Type scale entry. Defaults to `body`. */
  readonly variant?: TypographyToken;
  /** Colour role. Defaults to the primary text colour. */
  readonly tone?: 'default' | 'muted' | 'inverse' | 'primary' | 'success' | 'warning' | 'danger';
}

export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  const { colors } = useTheme();

  const color = {
    default: colors.text,
    muted: colors.textMuted,
    inverse: colors.textInverse,
    primary: colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  }[tone];

  return <RNText style={[Typography[variant], { color }, style]} {...rest} />;
}
