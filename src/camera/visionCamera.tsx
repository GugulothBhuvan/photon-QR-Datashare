/**
 * VisionCamera binding (A12-01, SI-013) — QR_SPEC §12; ADR-0005.
 *
 * The only module in Photon that imports `react-native-vision-camera`.
 * Everything above it talks to the frozen `CameraAdapter` contract, so
 * replacing the camera library means replacing this file and nothing else.
 *
 * **Not unit tested, and it cannot be.** Importing VisionCamera pulls in the
 * NitroModules TurboModule, which only exists inside a native runtime — the
 * import throws under Node. The logic worth testing was therefore put in
 * `deviceCamera.ts`, which this file drives; what remains here is the wiring
 * that only a device can exercise. Recorded as an exemption in
 * `tests/system/invariants.test.ts` rather than left as a silent gap.
 */
import { useCallback, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  type Frame,
} from 'react-native-vision-camera';
// Imported for its side effect: VisionCamera lazily requires this package to
// obtain the worklet runtime that `useFrameOutput` runs `onFrame` on. Without
// it the frame stream never starts.
import 'react-native-vision-camera-worklets';

import { CameraPermission } from './cameraPort';
import { toCameraFrame, type DeviceCamera } from './deviceCamera';

export interface CameraSourceProps {
  /** The adapter this component feeds. */
  readonly camera: DeviceCamera;
  /**
   * Longest edge of the frames requested from the hardware.
   *
   * Frames cross a thread boundary to reach JavaScript, so their size is the
   * dominant cost of the receive path. 1280 is enough for `jsQR` to resolve
   * the module grid of the QR versions Photon produces, and a quarter of the
   * bytes of a 4K frame.
   */
  readonly targetWidth?: number;
  /**
   * Whether the camera session runs.
   *
   * Defaults to `true`, because this component is only mounted when a screen
   * wants a camera. It previously read `camera.adapter.isRunning()` directly,
   * which is a value React never re-renders on — so the session stayed
   * inactive and the preview was blank on a real device. A prop is something
   * the screen owns and React can observe; an adapter's internal flag is not.
   */
  readonly isActive?: boolean;
}

/**
 * Renders the camera preview and streams its frames into the adapter.
 *
 * Mount this once, inside a receive screen. Unmounting it tears the session
 * down — VisionCamera releases the device with the component.
 */
export function CameraSource({ camera, targetWidth = 1280, isActive = true }: CameraSourceProps) {
  const device = useCameraDevice('back');
  const permission = useCameraPermission();

  useEffect(() => {
    // Three states, not two. `hasPermission ? Granted : Denied` would report a
    // user who has never been asked as having refused — and the receive
    // screen's §14 recovery action keys off exactly that difference: it offers
    // to ask again when the answer is Undetermined, and cannot help when the
    // user has actually refused.
    //
    // v5 gives the current status only through this hook, which is why the
    // adapter starts Undetermined and learns the truth here.
    camera.setPermission(
      permission.hasPermission
        ? CameraPermission.Granted
        : permission.canRequestPermission
          ? CameraPermission.Undetermined
          : CameraPermission.Denied,
    );
  }, [camera, permission.hasPermission, permission.canRequestPermission]);

  /**
   * Hands one frame to the JavaScript thread.
   *
   * Declared before the frame output and wrapped in `useCallback` so the
   * worklet captures a single stable reference rather than a fresh closure per
   * render — the worklet is created once, and a changing callback would leave
   * it holding a stale one.
   */
  const deliverFrame = useCallback(
    (
      buffer: ArrayBuffer,
      width: number,
      height: number,
      timestamp: number,
      bytesPerRow: number,
    ): void => {
      camera.deliver(toCameraFrame(buffer, width, height, timestamp, bytesPerRow));
    },
    [camera],
  );

  const frameOutput = useFrameOutput({
    // §14 needs pixels, and RGB is what `jsQR` reads. YUV would be cheaper on
    // the camera pipeline but would need a colour conversion here, which is
    // the kind of extra step that quietly corrupts a decode.
    pixelFormat: 'rgb',
    targetResolution: { width: targetWidth, height: Math.round((targetWidth * 3) / 4) },
    // §12 asks the receiver to decode as quickly as practical, and a backlog of
    // stale frames helps nobody: a QR frame that has already been replaced on
    // the sender's screen is not worth decoding.
    dropFramesWhileBusy: true,

    onFrame(frame: Frame) {
      'worklet';

      try {
        if (!frame.isValid || !frame.hasPixelBuffer) {
          return;
        }

        deliverFrame(
          frame.getPixelBuffer(),
          frame.width,
          frame.height,
          frame.timestamp,
          frame.bytesPerRow,
        );
      } finally {
        // Required: an undisposed frame stalls the camera pipeline.
        frame.dispose();
      }
    },
  });

  if (device === undefined) {
    return null;
  }

  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={isActive}
      outputs={[frameOutput]}
    />
  );
}
