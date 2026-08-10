/**
 * Screen shell (UI_SPEC §4, §11).
 *
 * Every screen sits in one of these, which gives all of them the same
 * safe-area handling, background and scroll behaviour. §11 requires the
 * interface to adapt across phones and tablets while preserving navigation
 * consistency — a shared shell is how that consistency holds without each
 * screen repeating it.
 */
import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@constants/tokens';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export interface ScreenProps extends ViewProps {
  readonly title?: string;
  readonly subtitle?: string;
  /** Set false for screens that manage their own layout, such as a camera view. */
  readonly scrollable?: boolean;
}

export function Screen({
  title,
  subtitle,
  scrollable = true,
  children,
  style,
  ...rest
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const header =
    title === undefined ? null : (
      <View style={styles.header}>
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text variant="body" tone="muted">
            {subtitle}
          </Text>
        )}
      </View>
    );

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }, style]}
      {...rest}
    >
      {scrollable ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.flex]}>
          {header}
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.md,
    padding: Spacing.md,
  },
  flex: {
    flex: 1,
  },
  header: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  root: {
    flex: 1,
  },
});
