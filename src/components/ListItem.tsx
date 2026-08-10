/**
 * List item (UI_SPEC §6).
 *
 * One row of a list, optionally pressable. Stateless (§6), and never smaller
 * than the platform touch target when interactive (§2, §8).
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, Spacing } from '@constants/tokens';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export interface ListItemProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly trailing?: string;
  readonly onPress?: () => void;
  readonly accessibilityHint?: string;
}

export function ListItem({ title, subtitle, trailing, onPress, accessibilityHint }: ListItemProps) {
  const { colors } = useTheme();

  const content = (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.text}>
        <Text variant="body">{title}</Text>
        {subtitle === undefined ? null : (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        )}
      </View>
      {trailing === undefined ? null : (
        <Text variant="label" tone="muted">
          {trailing}
        </Text>
      )}
    </View>
  );

  if (onPress === undefined) {
    return content;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: Spacing.sm,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
