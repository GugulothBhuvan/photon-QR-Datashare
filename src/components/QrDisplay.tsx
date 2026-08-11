/**
 * QR display (UI_SPEC §5.4; QR_SPEC §11, §13).
 *
 * Renders geometry the QR renderer already produced. It computes none of its
 * own — QR-002 owns every §13 rule, and a component that invented its own
 * layout would satisfy none of them.
 *
 * Colours come from the frame rather than the theme: a dark-themed QR code does
 * not scan.
 *
 * **Drawn as a single SVG path, not one view per module.** The first version
 * rendered a `<View>` for every dark module. On a real device that was
 * thousands of views recreated five times a second — the interface became too
 * busy to accept a touch, so Pause and Cancel stopped responding. One `<Path>`
 * is one element whatever the QR version, which is why `toSvgPath` exists in
 * the renderer.
 *
 * **The drawing box is a fixed size.** Different packets produce different QR
 * versions, so the rendered geometry is a different pixel size for almost every
 * frame. Sizing the view to the geometry made the code jump and resize as it
 * advanced. A `viewBox` scales whatever arrives into a constant square, so the
 * code stays put and stays centred.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Spacing } from '@constants/tokens';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

/**
 * The drawable description this component paints.
 *
 * Declared here, not imported: the UI layer may not reach into the QR adapter,
 * and a presentational component should state what it needs rather than adopt
 * a producer's type. The renderer's `RenderedFrame` satisfies it.
 */
export interface QrFrameGeometry {
  /** Side length in rendering units, including the quiet zone. Square (§13). */
  readonly size: number;
  /** One path covering every dark module, in rendering units. */
  readonly path: string;
  readonly foreground: string;
  readonly background: string;
}

export interface QrDisplayProps {
  /** Geometry from the send controller, or `undefined` while none is ready. */
  readonly frame: QrFrameGeometry | undefined;
  readonly caption?: string | undefined;
  /**
   * Side length of the drawing box, in points.
   *
   * Constant across frames by design — see the note above.
   */
  readonly size?: number;
}

export function QrDisplay({ frame, caption, size = 280 }: QrDisplayProps) {
  const { colors } = useTheme();

  if (frame === undefined) {
    return (
      <View
        style={[styles.placeholder, { backgroundColor: colors.surfaceAlt, height: size }]}
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
        style={[styles.canvas, { height: size, width: size }]}
      >
        <Svg
          width={size}
          height={size}
          // Every frame is scaled into the same square regardless of its QR
          // version, which is what stops the code resizing as it advances.
          viewBox={`0 0 ${frame.size} ${frame.size}`}
        >
          {/* §13: white background, no transparency. Painted once, beneath. */}
          <Rect x={0} y={0} width={frame.size} height={frame.size} fill={frame.background} />
          <Path d={frame.path} fill={frame.foreground} />
        </Svg>
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
