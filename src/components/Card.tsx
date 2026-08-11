/**
 * Card (UI_SPEC §6).
 *
 * A surface that groups related content. Stateless, as §6 requires of every
 * reusable component.
 */
import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius, Spacing } from '@constants/tokens';

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
        // `elevated` is honoured as a slightly lighter surface rather than a
        // shadow: the terminal is one flat plane, and depth is expressed by
        // value, not by casting light.
        elevated ? { backgroundColor: colors.surfaceAlt } : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
});
