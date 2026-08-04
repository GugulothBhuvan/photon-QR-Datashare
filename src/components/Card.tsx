/**
 * Card (UI_SPEC §6).
 *
 * A surface that groups related content. Stateless, as §6 requires of every
 * reusable component.
 */
import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius, Shadow, Spacing } from '@constants/tokens';

import { useTheme } from './ThemeProvider';

export interface CardProps extends ViewProps {
  readonly elevated?: boolean;
}

export function Card({ elevated = false, style, ...rest }: CardProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        elevated ? Shadow.sm : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
  },
});
