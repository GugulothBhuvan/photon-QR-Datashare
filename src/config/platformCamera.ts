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
import type { ComponentType } from 'react';

import { CameraPermission, type CameraAdapter } from '@camera/cameraPort';
import { createMemoryCamera } from '@camera/memoryCamera';

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
      Camera: { getCameraPermissionStatus(): string; requestCameraPermission(): Promise<string> };
    };

    const camera = device.createDeviceCamera({
      requestPermission: async () => {
        const status = await vision.Camera.requestCameraPermission();
        return status === 'granted' || status === 'authorized';
      },
      currentPermission: () => {
        const status = vision.Camera.getCameraPermissionStatus();

        if (status === 'granted' || status === 'authorized') {
          return CameraPermission.Granted;
        }

        // VisionCamera distinguishes "never asked" from "refused"; so does the
        // port, and the receive screen's recovery action depends on it.
        return status === 'not-determined'
          ? CameraPermission.Undetermined
          : CameraPermission.Denied;
      },
    });

    const Preview: ComponentType = () => binding.CameraSource({ camera });

    return { adapter: camera.adapter, Preview, isDevice: true };
  } catch {
    // No native runtime — Node, the web build, or a device build without the
    // native module linked. The in-memory camera keeps everything working.
    return { adapter: createMemoryCamera(), isDevice: false };
  }
}
