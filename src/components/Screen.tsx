/**
 * Screen shell (UI_SPEC §4, §11).
 *
 * Every screen sits in one of these, which gives all of them the same
 * safe-area handling, background and scroll behaviour. §11 requires the
 * interface to adapt across phones and tablets while preserving navigation
 * consistency — a shared shell is how that consistency holds without each
 * screen repeating it.
 */
import type { ReactNode } from 'react';
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
  /**
   * Rendered in place of the prompt marker, beside the title.
   *
   * Home passes the logo here rather than adding a separate banner, which
   * would print the product name twice on one screen.
   */
  readonly leading?: ReactNode;
}

export function Screen({
  title,
  subtitle,
  scrollable = true,
  leading,
  children,
  style,
  ...rest
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const header =
    title === undefined ? null : (
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {/*
            A prompt marker. Hidden from assistive technology: it tells the eye
            where a screen begins in a layout with no cards to do that job, and
            a screen reader announcing "black rectangle photon" would be strictly
            worse than announcing nothing.
          */}
          {leading ?? (
            <Text variant="title" importantForAccessibility="no" accessibilityElementsHidden>
              ▮
            </Text>
          )}
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
        </View>
        {subtitle === undefined ? null : (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        )}
        {/* A rule under the title, in place of the card that used to frame it. */}
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
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
  rule: {
    height: 1,
    marginTop: Spacing.xs,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  header: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  root: {
    flex: 1,
  },
});
