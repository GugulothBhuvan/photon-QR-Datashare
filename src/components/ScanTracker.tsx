/**
 * The scan target, and where a code was last seen.
 *
 * Four corner brackets rather than a rectangle, because a QR symbol is square
 * and a square target is what a user should be filling. They do two jobs:
 *
 * - **Idle**, they sit centred and dim, showing where to aim.
 * - **Locked**, they move onto the symbol the decoder just read and brighten.
 *
 * The lock is the only aiming feedback a receiver can honestly give. A counter
 * says how many frames decoded; brackets that snap onto the code say *this
 * one, here, now*, which is what tells someone whether moving the phone helped.
 *
 * The tracked position depends on an assumption about how the preview maps its
 * frame (see `previewGeometry.ts`). When the mapping produces something
 * implausible the brackets fall back to the centred target rather than pointing
 * confidently at the wrong place — a tracker in the wrong place is worse than
 * none, because it makes a user move away from a code being read perfectly.
 */
import { StyleSheet, View } from 'react-native';

import { isPlausible, symbolToPreview, type Quad } from '@utils/previewGeometry';

import { useTheme } from './ThemeProvider';

/** Arm length of each bracket, in points. */
const CORNER_LENGTH = 26;

/** Thickness of the two borders that meet at each corner. */
const CORNER_WEIGHT = 3;

/** The four brackets, each drawn as the two borders meeting at its corner. */
const CORNERS = [
  {
    key: 'tl',
    style: { borderLeftWidth: CORNER_WEIGHT, borderTopWidth: CORNER_WEIGHT, left: 0, top: 0 },
  },
  {
    key: 'tr',
    style: { borderRightWidth: CORNER_WEIGHT, borderTopWidth: CORNER_WEIGHT, right: 0, top: 0 },
  },
  {
    key: 'bl',
    style: { borderBottomWidth: CORNER_WEIGHT, borderLeftWidth: CORNER_WEIGHT, bottom: 0, left: 0 },
  },
  {
    key: 'br',
    style: {
      borderBottomWidth: CORNER_WEIGHT,
      borderRightWidth: CORNER_WEIGHT,
      bottom: 0,
      right: 0,
    },
  },
] as const;

export interface ScanTrackerProps {
  /** Whether a code was read recently enough to still be worth pointing at. */
  readonly locked: boolean;
  /** The corners the decoder reported, in frame pixels. */
  readonly quad?: Quad;
  /** The frame those corners came from. */
  readonly frame?: { readonly width: number; readonly height: number };
  /** The preview's measured size, in points. */
  readonly preview?: { readonly width: number; readonly height: number };
}

export function ScanTracker({ locked, quad, frame, preview }: ScanTrackerProps) {
  const { colors } = useTheme();

  const mapped =
    locked && quad !== undefined && frame !== undefined && preview !== undefined
      ? symbolToPreview(quad, frame, preview)
      : undefined;

  const tracked = mapped !== undefined && preview !== undefined && isPlausible(mapped, preview);

  return (
    <View
      style={
        tracked && mapped !== undefined
          ? {
              position: 'absolute',
              left: mapped.left,
              top: mapped.top,
              width: mapped.width,
              height: mapped.height,
            }
          : styles.centred
      }
      pointerEvents="none"
      // Announced as one thing rather than four: a screen reader has no use for
      // individual corners, and the state is what carries the meaning.
      accessibilityRole="image"
      accessibilityLabel={locked ? 'Code detected' : 'Point the camera at a code'}
    >
      {CORNERS.map((corner) => (
        <View
          key={corner.key}
          style={[
            styles.corner,
            corner.style,
            { borderColor: locked ? colors.success : colors.border },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  centred: {
    aspectRatio: 1,
    position: 'absolute',
    width: '72%',
  },
  corner: {
    borderColor: 'transparent',
    height: CORNER_LENGTH,
    position: 'absolute',
    width: CORNER_LENGTH,
  },
});
