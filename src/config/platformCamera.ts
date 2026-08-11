/**
 * Platform camera selection (A12-01, SI-013) — ADR-0005.
 *
 * Chooses the camera the application graph runs on: the device camera where a
 * native runtime is present, the in-memory one everywhere else.
 *
 * **Why a guarded `require` and not a `.native.ts` file.** The obvious
 * mechanism is Metro's platform extensions, but Jest's `jest-expo` preset also
 * resolves `.native`, which would drag the NitroModules TurboModule into every
 * test run and break the suite on a machine with no device attached. Loading
 * the binding inside a `try` sidesteps the question entirely: on a phone the
 * module loads, and anywhere else it throws during import and the in-memory
 * camera takes over. The failure is expected rather than exceptional, which is
 * why it is caught rather than reported.
 *
 * The rest of the application sees only `CameraAdapter` and an opaque
 * component. Nothing above this file knows which camera it received.
 */
import { createElement, type ComponentType } from 'react';

import { CameraPermission, type CameraAdapter } from '@camera/cameraPort';
import { createMemoryCamera } from '@camera/memoryCamera';
import { createStore, type Store } from '@state/store';

/** What the composition root needs to wire a camera into the graph. */
export interface PlatformCamera {
  readonly adapter: CameraAdapter;
  /**
   * The preview surface, when the platform has a real camera.
   *
   * `undefined` under Node and on the web. Passed to the UI as an opaque
   * component so a screen can render a live camera without importing the
   * camera layer, which the layer boundary forbids.
   */
  readonly Preview?: ComponentType;
  /** Whether a real device camera was found. */
  readonly isDevice: boolean;
  /**
   * Why the device camera was unavailable, when it was.
   *
   * A bare `catch` that returns a fallback is undiagnosable on a handset: the
   * user sees a placeholder and neither they nor a developer can tell whether
   * the module failed to load, the permission was refused, or the fallback was
   * intended. The reason is kept and surfaced on the About screen.
   */
  readonly unavailableReason?: string;
  /**
   * Camera session failures reported after the module loaded successfully.
   *
   * Distinct from `unavailableReason`, which covers a camera that never
   * loaded. This one covers a camera that loaded and then failed to run — the
   * case that previously showed an empty preview and said nothing, and left
   * three device sessions guessing.
   */
  readonly errors?: Store<string | undefined>;
}

/**
 * Resolves the camera for this platform.
 *
 * @param force Overrides detection. Supplied by tests that need to assert both
 *   branches without a device.
 */
export function createPlatformCamera(force?: 'memory'): PlatformCamera {
  if (force === 'memory') {
    return { adapter: createMemoryCamera(), isDevice: false };
  }

  try {
    // Deliberately dynamic: a static import would be evaluated when this module
    // loads, which is exactly what must not happen off-device.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const binding = require('@camera/visionCamera') as typeof import('@camera/visionCamera');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const device = require('@camera/deviceCamera') as typeof import('@camera/deviceCamera');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vision = require('react-native-vision-camera') as {
      VisionCamera: { requestCameraPermission(): Promise<boolean> };
    };

    const camera = device.createDeviceCamera({
      // VisionCamera 5's imperative entry point. The v3/v4 statics
      // `Camera.requestCameraPermission` and `Camera.getCameraPermissionStatus`
      // do not exist here — calling them threw, and the fallback below hid it,
      // which is why no permission dialog ever appeared on a device.
      requestPermission: () => vision.VisionCamera.requestCameraPermission(),

      // v5 exposes the *current* status only through the `useCameraPermission`
      // hook, which cannot be called outside React. So the adapter starts
      // undetermined and `CameraSource` reports the real status through
      // `setPermission` as soon as it mounts. Undetermined is the honest
      // starting value: the app genuinely does not know yet.
      currentPermission: () => CameraPermission.Undetermined,
    });

    // **Created as an element, not called as a function.** `CameraSource({...})`
    // ran the camera's hooks inside this wrapper's own render, so the two
    // shared a single hook list and `CameraSource` had no component identity —
    // nothing React could memoize, and no way to stop a parent's re-render
    // from reconfiguring the camera session.
    const errors = createStore<string | undefined>(undefined);

    const Preview: ComponentType = () =>
      createElement(binding.CameraSource, {
        camera,
        onError: (message: string) => {
          errors.setState(() => message);
        },
      });

    return { adapter: camera.adapter, Preview, isDevice: true, errors };
  } catch (error: unknown) {
    // No native runtime — Node, the web build, or a device build where the
    // native module did not link. The in-memory camera keeps the app working;
    // the reason is kept so a device can say which of those happened.
    return {
      adapter: createMemoryCamera(),
      isDevice: false,
      unavailableReason: error instanceof Error ? error.message : String(error),
    };
  }
}
