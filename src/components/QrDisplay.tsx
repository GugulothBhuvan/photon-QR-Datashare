/**
 * QR display (UI_SPEC §5.4; QR_SPEC §11, §13).
 *
 * Renders geometry the QR renderer already produced. It computes none of its
 * own — QR-002 owns every §13 rule, and a component that invented its own
 * layout would satisfy none of them.
 *
 * Colours come from the frame rather than the theme: a dark-themed QR code does
 * not scan.
 */
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@constants/tokens';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

/** One dark module's position and size, in rendering units. */
export interface QrModuleRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The drawable description this component paints.
 *
 * Declared here, not imported: the UI layer may not reach into the QR adapter,
 * and a presentational component should state what it needs rather than adopt
 * a producer's type. It names only the fields drawn, so the renderer's
 * `RenderedFrame` satisfies it and any caller passing one is checked at the
 * call site.
 */
export interface QrFrameGeometry {
  /** Side length in rendering units, including the quiet zone. Square (§13). */
  readonly size: number;
  /** Dark modules to draw; the background is painted once beneath them. */
  readonly modules: readonly QrModuleRect[];
  readonly foreground: string;
  readonly background: string;
}

export interface QrDisplayProps {
  /** Geometry from the send controller, or `undefined` while none is ready. */
  readonly frame: QrFrameGeometry | undefined;
  readonly caption?: string | undefined;
}

export function QrDisplay({ frame, caption }: QrDisplayProps) {
  const { colors } = useTheme();

  if (frame === undefined) {
    return (
      <View
        style={[styles.placeholder, { backgroundColor: colors.surfaceAlt }]}
        accessibilityRole="progressbar"
        accessibilityLabel="Preparing frame"
      >
        <Text variant="caption" tone="muted">
          Preparing frame…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View
        accessibilityRole="image"
        accessibilityLabel="QR frame"
        testID="qr-canvas"
        style={[
          styles.canvas,
          { backgroundColor: frame.background, height: frame.size, width: frame.size },
        ]}
      >
        {frame.modules.map((rect, index) => (
          <View
            key={index}
            style={{
              backgroundColor: frame.foreground,
              height: rect.height,
              left: rect.x,
              position: 'absolute',
              top: rect.y,
              width: rect.width,
            }}
          />
        ))}
      </View>
      {caption === undefined ? null : (
        <Text variant="caption" tone="muted">
          {caption}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    overflow: 'hidden',
    position: 'relative',
  },
  placeholder: {
    alignItems: 'center',
    aspectRatio: 1,
    justifyContent: 'center',
    width: '100%',
  },
  wrapper: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
