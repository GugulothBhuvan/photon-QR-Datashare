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
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';

import { CameraPermission } from './cameraPort';
import {
  sourceBytesPerPixelFor,
  toCameraFrame,
  toGrayscaleFrame,
  type DeviceCamera,
} from './deviceCamera';

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
  /**
   * Reports how many frames were dropped, and why.
   *
   * Two counts because they mean opposite things. **Backpressure** drops are
   * this application declining frames the decoder cannot keep up with — the
   * healthy state at any camera rate above the decode rate, and the number
   * that says how much headroom a faster decoder would buy. **Pipeline** drops
   * are the camera failing to deliver, which is a different problem with a
   * different fix.
   */
  readonly onDropped?: (counts: { backpressure: number; pipeline: number }) => void;
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
  onDropped,
}: CameraSourceProps) {
  const device = useCameraDevice('back');
  const permission = useCameraPermission();

  /**
   * Whether a frame is already on its way to JavaScript.
   *
   * **Backpressure, and the receiver runs out of memory without it.**
   * `dropFramesWhileBusy` drops frames while the *worklet* is busy, and this
   * worklet is not: it copies a buffer and returns. So the camera delivered at
   * its own rate — thirty to sixty frames a second — and every one allocated a
   * 691 KB luminance plane and queued it for a JavaScript thread that decodes
   * about twelve a second. The queue grew by tens of megabytes a second, held
   * every buffer in it alive, and the process was killed.
   *
   * One frame in flight at a time. Frames arriving while JavaScript is busy
   * are dropped on the camera thread before anything is allocated, which is
   * also the right answer on merit: a frame from three seconds ago shows a QR
   * code the sender has already replaced.
   *
   * A `Synchronizable` rather than a plain variable because the two runtimes
   * do not share memory — a captured `let` would be copied into the worklet
   * and the JavaScript side's writes would never be seen.
   */
  const inFlight = useMemo(() => createSynchronizable(false), []);

  /**
   * Frames the worklet declined because JavaScript was still busy.
   *
   * Counted on the camera thread, so it cannot be a plain variable: the two
   * runtimes do not share memory. Read on a timer rather than reported per
   * drop, because a callback per dropped frame would cost exactly what
   * dropping the frame was meant to save.
   */
  const backpressureDrops = useMemo(() => createSynchronizable(0), []);
  const pipelineDrops = useRef(0);
  /**
   * When the last frame reached JavaScript, for the watchdog below.
   *
   * Zero rather than `Date.now()`: reading the clock during render is impure,
   * and the watchdog only compares against it after a delivery has set it.
   */
  const lastDelivery = useRef(0);

  useEffect(() => {
    if (onDropped === undefined) {
      return;
    }

    const timer = setInterval(() => {
      onDropped({
        backpressure: backpressureDrops.getDirty(),
        pipeline: pipelineDrops.current,
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [onDropped, backpressureDrops]);

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
      try {
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
      } finally {
        inFlight.setBlocking(false);
      }
    },
    [camera, inFlight],
  );

  /**
   * Hands one luminance plane to the JavaScript thread.
   *
   * The Y plane of a YUV frame is exactly what a QR decoder needs, so nothing
   * is lost by not carrying colour, and a quarter of the bytes cross the
   * thread boundary.
   */
  const deliverLuminance = useCallback(
    (pixels: Uint8Array, width: number, height: number, bytesPerRow: number): void => {
      try {
        camera.deliver(
          toGrayscaleFrame(pixels.buffer as ArrayBuffer, width, height, Date.now(), bytesPerRow),
        );
      } finally {
        // Released whatever happened. A decode that throws must not stop the
        // camera thread ever sending another frame.
        lastDelivery.current = Date.now();
        inFlight.setBlocking(false);
      }
    },
    [camera, inFlight],
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
        if (!frame.isValid) {
          return;
        }

        // Dropped before anything is allocated. See `inFlight`.
        if (inFlight.getDirty()) {
          backpressureDrops.setBlocking((previous) => previous + 1);
          return;
        }

        // **Planar frames come through their planes, not the pixel buffer.**
        // VisionCamera documents `getPixelBuffer()` as *undefined behaviour*
        // for a planar frame, and `hasPixelBuffer` is false for one — so the
        // old guard discarded every frame a device chose to deliver as YUV,
        // silently, while the preview carried on working. That is
        // indistinguishable from a broken receiver, and it is why `'yuv'` is
        // now requested: it is the format cameras produce natively, so it is
        // always available, where `'rgb'` asks for a conversion a device may
        // decline.
        if (frame.isPlanar) {
          const planes = frame.getPlanes();
          const luminance = planes[0];

          if (luminance === undefined) {
            return;
          }

          const plane = new Uint8Array(luminance.getPixelBuffer()).slice();

          inFlight.setBlocking(true);
          scheduleOnRN(
            deliverLuminance,
            plane,
            luminance.width,
            luminance.height,
            luminance.bytesPerRow,
          );
          return;
        }

        if (!frame.hasPixelBuffer) {
          return;
        }

        // **Copied before dispose, deliberately.** `getPixelBuffer` does not
        // copy — it hands back a view of a buffer the camera owns, and the
        // `finally` below invalidates it. Marshalling the view to JavaScript
        // would deliver bytes that are already gone.
        const copy = new Uint8Array(frame.getPixelBuffer()).slice();

        inFlight.setBlocking(true);

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
    [deliverFrame, deliverLuminance, inFlight, backpressureDrops],
  );

  const frameOutput = useFrameOutput({
    // §14 needs pixels, and RGB is what `jsQR` reads. YUV would be cheaper on
    // the camera pipeline but would need a colour conversion here, which is
    // the kind of extra step that quietly corrupts a decode.
    // **YUV, not RGB.** The Y plane is luminance at full resolution, which is
    // all a QR decoder reads — the symbol is black on white and colour carries
    // nothing. YUV is also what the pipeline produces natively, so no device
    // can decline it, and it is 2.6x less bandwidth than RGB.
    pixelFormat: 'yuv',
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

    // Reported rather than left to VisionCamera's default console warning. A
    // receiver dropping every frame and a receiver receiving none look the
    // same from outside, and they need opposite fixes.
    // The camera failing to deliver, which is not the same as this
    // application declining to accept. Counted, not reported as an error: at
    // any camera rate above the decode rate some dropping is the healthy
    // state, and an error banner for it would cry wolf.
    onFrameDropped: () => {
      pipelineDrops.current += 1;
    },
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

  useEffect(() => {
    /**
     * Clears an in-flight flag that was never released.
     *
     * The flag is set on the camera thread and cleared on the JavaScript
     * thread, so anything that stops the scheduled callback arriving — the app
     * backgrounding mid-hop, a runtime tearing down — leaves it set forever
     * and **the camera never sends another frame**. The failure is total and
     * silent, and looks exactly like a camera that has stopped working.
     *
     * Two seconds is far longer than any decode: the current mean is 80 ms.
     */
    const watchdog = setInterval(() => {
      if (inFlight.getDirty() && Date.now() - lastDelivery.current > 2_000) {
        // Nothing has come back for two seconds while a frame is marked in
        // flight, so the hop was lost.
        inFlight.setBlocking(false);
      }
    }, 1_000);

    return () => {
      clearInterval(watchdog);
    };
  }, [inFlight]);

  useEffect(() => {
    // Cleared on both edges. A frame in flight when this unmounts never
    // reaches its callback, and a flag left set would stop the camera thread
    // ever sending another one — a receiver that works until you leave the
    // screen and never again.
    inFlight.setBlocking(false);

    return () => {
      inFlight.setBlocking(false);
    };
  }, [inFlight]);

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
    const { width, height } = previewSize.current;

    // **Guarded, and the receiver stops focusing without it.** `onStarted`
    // fires before `onLayout` has measured, so this ran with a zero size and
    // asked the camera to focus the point (0, 0) — the top-left corner of the
    // view — *continuously*. Pointed at another phone's screen that corner is
    // the room behind it, so the lens settled on the background and held it
    // there, and every frame of the code came back soft.
    if (camera === null || width === 0 || height === 0) {
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
        // Focused here as well as on start, because whichever of the two
        // happens second is the first moment both a camera and a size exist.
        focusCentre();
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
