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
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import {
  Camera,
  type CameraRef,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  type Frame,
} from 'react-native-vision-camera';
// Imported for its side effect: VisionCamera lazily requires this package to
// obtain the worklet runtime that `useFrameOutput` runs `onFrame` on. Without
// it the frame stream never starts.
import 'react-native-vision-camera-worklets';
import { scheduleOnRN } from 'react-native-worklets';

import { CameraPermission } from './cameraPort';
import { sourceBytesPerPixelFor, toCameraFrame, type DeviceCamera } from './deviceCamera';

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
  /**
   * Reports a camera session failure in the platform's own words.
   *
   * Without this, VisionCamera's default handler logs and the interface shows
   * a blank rectangle, which is indistinguishable from a camera that is
   * working and pointed at nothing.
   */
  readonly onError?: (message: string) => void;
}

/**
 * Renders the camera preview and streams its frames into the adapter.
 *
 * Mount this once, inside a receive screen. Unmounting it tears the session
 * down — VisionCamera releases the device with the component.
 */
function CameraSourceImpl({
  camera,
  targetWidth = 960,
  isActive = true,
  onError,
}: CameraSourceProps) {
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
      pixels: Uint8Array,
      width: number,
      height: number,
      bytesPerRow: number,
      pixelFormat: string,
    ): void => {
      camera.deliver(
        toCameraFrame(
          pixels.buffer as ArrayBuffer,
          width,
          height,
          // The capture timestamp is the camera thread's clock, which is not
          // the JS thread's. A receiver only uses this for ordering within a
          // session, so a JS-side reading is the consistent one.
          Date.now(),
          bytesPerRow,
          // `pixelFormat: 'rgb'` is a request, not an answer: the camera picks
          // BGRA, RGBA or packed 24-bit RGB. Reading four bytes per pixel from
          // a 24-bit frame offsets every row and decodes nothing.
          sourceBytesPerPixelFor(pixelFormat, bytesPerRow, width),
        ),
      );
    },
    [camera],
  );

  /**
   * **Memoized, and the receiver does not work without it.**
   *
   * `useFrameOutput` builds the frame output inside a `useMemo` keyed on this
   * object, so a fresh literal per render means a fresh output per render —
   * and `<Camera>` reconfigures its session whenever `outputs` changes
   * identity. Delivering a frame updates the receive store, which re-renders
   * this component, which tore down the pipeline that had just produced the
   * frame. The camera spent its life restarting and never delivered a second
   * frame to the decoder.
   */
  const targetResolution = useMemo(
    () => ({ width: targetWidth, height: Math.round((targetWidth * 3) / 4) }),
    [targetWidth],
  );

  /**
   * The frame worklet, given a stable identity for the same reason.
   *
   * `useFrameOutput` re-registers this on the worklet runtime whenever it
   * changes, so an inline function re-registered it on every render.
   */
  const onFrame = useCallback(
    (frame: Frame): void => {
      'worklet';

      try {
        if (!frame.isValid || !frame.hasPixelBuffer) {
          return;
        }

        // **Copied before dispose, deliberately.** `getPixelBuffer` does not
        // copy — it hands back a view of a buffer the camera owns, and the
        // `finally` below invalidates it. Marshalling the view to JavaScript
        // would deliver bytes that are already gone.
        const copy = new Uint8Array(frame.getPixelBuffer()).slice();

        // **Crossed to the JS thread explicitly.** `onFrame` is a worklet on
        // the camera thread; calling a JavaScript function from it directly
        // does nothing on the JS side. That was why the receiver saw no frames
        // at all: the pipeline was correct and nothing was ever handed to it.
        scheduleOnRN(
          deliverFrame,
          copy,
          frame.width,
          frame.height,
          frame.bytesPerRow,
          frame.pixelFormat,
        );
      } finally {
        // Required: an undisposed frame stalls the camera pipeline.
        frame.dispose();
      }
    },
    [deliverFrame],
  );

  const frameOutput = useFrameOutput({
    // §14 needs pixels, and RGB is what `jsQR` reads. YUV would be cheaper on
    // the camera pipeline but would need a colour conversion here, which is
    // the kind of extra step that quietly corrupts a decode.
    pixelFormat: 'rgb',
    targetResolution,
    // §12 asks the receiver to decode as quickly as practical, and a backlog of
    // stale frames helps nobody: a QR frame that has already been replaced on
    // the sender's screen is not worth decoding.
    //
    // This is also the throttle. Every delivered frame is copied and crosses a
    // thread boundary, and dropping while busy means the pipeline self-limits
    // to whatever decoding can actually keep up with — no timer needed, and no
    // mutable state in a worklet that cannot hold any.
    dropFramesWhileBusy: true,
    onFrame,
  });

  // Same rule: a new array is a new `outputs` identity, and `<Camera>` treats
  // that as a session change.
  const outputs = useMemo(() => [frameOutput], [frameOutput]);

  const reportError = useCallback(
    (error: Error): void => {
      onError?.(error.message);
    },
    [onError],
  );

  const cameraRef = useRef<CameraRef>(null);

  /** Measured so the focus point is the middle of what is on screen. */
  const previewSize = useRef({ width: 0, height: 0 });

  /**
   * Focuses the centre of the frame, continuously (QR_SPEC §12).
   *
   * §12 asks the receiver to "maintain autofocus", which was never
   * implemented. A phone held up to another phone's screen is close enough
   * that focus matters, and a lens hunting between the screen and the room
   * behind it produces a stream of frames too soft for any decoder — the
   * failure looks exactly like a camera delivering nothing useful.
   *
   * `adaptiveness: 'continuous'` keeps tracking after the first settle rather
   * than locking, and `'steady'` avoids the visible pumping a snappy refocus
   * causes on a subject that is not moving.
   */
  const focusCentre = useCallback((): void => {
    const camera = cameraRef.current;

    if (camera === null) {
      return;
    }

    void camera
      .focusTo(
        { x: previewSize.current.width / 2, y: previewSize.current.height / 2 },
        { responsiveness: 'steady', adaptiveness: 'continuous', modes: ['AF', 'AE'] },
      )
      .catch(() => {
        // A device without focus or exposure metering refuses. §12 says
        // SHOULD, and a fixed-focus camera can still read a code.
      });
  }, []);

  if (device === undefined) {
    return null;
  }

  return (
    <Camera
      ref={cameraRef}
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={isActive}
      outputs={outputs}
      onError={reportError}
      onStarted={focusCentre}
      onLayout={(event) => {
        previewSize.current = event.nativeEvent.layout;
      }}
      // §12 again, by hand: a user who can see the preview is soft has an
      // immediate way to fix it, which no automatic policy can guarantee.
      enableNativeTapToFocusGesture
    />
  );
}

/**
 * Memoized so a parent's re-render does not reach the camera.
 *
 * The receive screen re-renders on every frame it counts. Without this the
 * session would be reconfigured just as often, whatever the internals do.
 */
export const CameraSource = memo(CameraSourceImpl);
