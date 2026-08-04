/**
 * Progress indicators (UI_SPEC §6, §9, §10).
 *
 * §6 lists a progress ring and a progress bar. Both are here because they
 * render the same value differently, and keeping them together stops the two
 * from disagreeing about what "80%" looks like.
 *
 * §10 requires colour-blind-friendly indicators, which is why both carry an
 * accessible label with the numeric percentage rather than relying on the fill.
 * A user who cannot distinguish the fill still hears the number.
 */
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@constants/tokens';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export interface ProgressProps {
  /** Completion between 0 and 1. Values outside are clamped. */
  readonly value: number;
  readonly label?: string;
  /** Renders the percentage as text alongside the indicator. */
  readonly showValue?: boolean;
}

/** Clamps to 0–1 so a caller's arithmetic cannot produce an impossible bar. */
function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function ProgressBar({ value, label, showValue = true }: ProgressProps) {
  const { colors } = useTheme();
  const ratio = clamp(value);
  const percent = Math.round(ratio * 100);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Progress'}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
        <View
          style={[styles.fill, { backgroundColor: colors.primary, width: `${percent}%` }]}
          testID="progress-fill"
        />
      </View>
      {showValue ? (
        <Text variant="caption" tone="muted" style={styles.value}>
          {percent}%
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A ring rendered from primitives.
 *
 * Deliberately not an animated SVG arc: §13 requires animations never to delay
 * protocol execution, and a segmented ring costs nothing to update while a
 * transfer is running.
 */
export function ProgressRing({ value, label, showValue = true }: ProgressProps) {
  const { colors } = useTheme();
  const ratio = clamp(value);
  const percent = Math.round(ratio * 100);
  const segments = 12;
  const filled = Math.round(ratio * segments);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Transfer progress'}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={styles.ring}
    >
      <View style={styles.segments}>
        {Array.from({ length: segments }, (_unused, index) => (
          <View
            key={index}
            style={[
              styles.segment,
              { backgroundColor: index < filled ? colors.primary : colors.surfaceAlt },
            ]}
          />
        ))}
      </View>
      {showValue ? (
        <Text variant="title" style={styles.ringValue}>
          {percent}%
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    borderRadius: Radius.pill,
    height: '100%',
  },
  ring: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ringValue: {
    textAlign: 'center',
  },
  segment: {
    borderRadius: Radius.sm,
    height: 8,
    width: 14,
  },
  segments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    justifyContent: 'center',
    maxWidth: 240,
  },
  track: {
    borderRadius: Radius.pill,
    height: 8,
    overflow: 'hidden',
    width: '100%',
  },
  value: {
    marginTop: Spacing.xs,
  },
});
