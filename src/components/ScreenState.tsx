/**
 * Screen states (UI_SPEC §7, §14, §15, §16).
 *
 * §7 requires every screen to define six states: initial, loading, empty,
 * success, error and disabled. Left to each screen that becomes six
 * inconsistent treatments; here it is one.
 *
 * §14 requires errors to carry a clear title, a human-readable explanation and
 * a recovery action — so `ErrorState` takes all three, and the action is not
 * optional. An error a user cannot act on is a dead end.
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Spacing } from '@constants/tokens';

import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

/** The six states §7 requires every screen to define. */
export const ScreenStatus = {
  Initial: 'INITIAL',
  Loading: 'LOADING',
  Empty: 'EMPTY',
  Success: 'SUCCESS',
  Error: 'ERROR',
  Disabled: 'DISABLED',
} as const;

export type ScreenStatus = (typeof ScreenStatus)[keyof typeof ScreenStatus];

export interface LoadingStateProps {
  /** What is loading (§16: camera, files, QR generation, reconstruction, saving). */
  readonly message: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  const { colors } = useTheme();

  return (
    <View
      accessible
      style={styles.centered}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
    >
      <ActivityIndicator color={colors.primary} />
      <Text variant="body" tone="muted" style={styles.text}>
        {message}
      </Text>
    </View>
  );
}

export interface EmptyStateProps {
  /** §15: every screen defines an empty state. */
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.centered}>
      <Text variant="heading">{title}</Text>
      <Text variant="body" tone="muted" style={styles.text}>
        {description}
      </Text>
      {actionLabel !== undefined && onAction !== undefined ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  /** §14: a clear title. */
  readonly title: string;
  /** §14: a human-readable explanation, never a protocol internal. */
  readonly description: string;
  /** §14: a recovery action. Required — an error without one is a dead end. */
  readonly actionLabel: string;
  readonly onAction: () => void;
}

export function ErrorState({ title, description, actionLabel, onAction }: ErrorStateProps) {
  return (
    <View style={styles.centered}>
      {/*
        The alert wraps the message only, never the button. `accessible` makes a
        subtree one accessibility element, so putting it around the whole state
        would bury the recovery action §14 requires — announced as part of the
        message, and no longer focusable on its own.
      */}
      <View accessible accessibilityRole="alert" style={styles.message}>
        <Text variant="heading" tone="danger">
          {title}
        </Text>
        <Text variant="body" tone="muted" style={styles.text}>
          {description}
        </Text>
      </View>
      <Button label={actionLabel} onPress={onAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    gap: Spacing.sm,
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  message: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  text: {
    textAlign: 'center',
  },
});
