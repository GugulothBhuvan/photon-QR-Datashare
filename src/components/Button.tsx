/**
 * Buttons (UI_SPEC §6, §2, §9).
 *
 * §6 lists primary, secondary and icon buttons. All three are one component
 * with a variant, because they differ only in colour and padding — three
 * components would be three places for the touch target to drift.
 *
 * Two specification requirements are enforced here rather than per screen:
 *
 * - **§2, §8: large touch targets.** `minHeight` is the platform minimum, so
 *   no caller can produce a button too small to hit one-handed.
 * - **§9: feedback SHALL be immediate.** Press state is rendered from the
 *   pressed flag directly, never from a state update that might be batched
 *   behind other work.
 */
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { MIN_TOUCH_TARGET, Radius, Spacing } from '@constants/tokens';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  readonly label: string;
  readonly variant?: ButtonVariant;
  /** Renders a compact, square button for an icon-only action (§6). */
  readonly icon?: string;
  readonly fullWidth?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  icon,
  fullWidth = false,
  disabled = false,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();

  // Terminal styling: everything is outlined rather than filled, except the
  // primary action, which is the one thing a filled block should mark. Filling
  // several buttons on one screen makes them compete; an amber block that
  // appears once says "this is the action" without any other emphasis.
  const palette = {
    primary: { background: colors.primary, text: colors.primaryText, border: colors.primary },
    secondary: { background: 'transparent', text: colors.text, border: colors.border },
    ghost: { background: 'transparent', text: colors.textMuted, border: 'transparent' },
    danger: { background: 'transparent', text: colors.danger, border: colors.danger },
  }[variant];

  // A caret marks an actionable line, the way a prompt does. Only on outlined
  // buttons: on the filled primary the block is already the affordance, and a
  // caret there would be belt and braces.
  const marker = variant === 'primary' || icon !== undefined ? undefined : '▸';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          // §9: immediate feedback, rendered straight from the press state.
          opacity: disabled === true ? 0.45 : pressed ? 0.7 : 1,
        },
        fullWidth ? styles.fullWidth : null,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {icon === undefined ? null : (
          <Text variant="body" style={{ color: palette.text }}>
            {icon}
          </Text>
        )}
        {marker === undefined ? null : (
          <Text variant="label" style={{ color: palette.text }}>
            {marker}
          </Text>
        )}
        <Text variant="label" style={{ color: palette.text }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    // §2, §8: never smaller than the platform's minimum touch target.
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
});
