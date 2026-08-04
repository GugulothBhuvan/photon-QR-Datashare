/**
 * In-memory camera.
 *
 * A real `CameraAdapter` that happens to have no device behind it: frames are
 * supplied by the caller and delivered on demand. It exists for the same reason
 * `createMemoryKeyValueStore` does — the whole receive path can then be built
 * and tested before any native module exists, and every test is deterministic
 * because nothing is captured in real time.
 *
 * Not a mock. It implements the port faithfully, including permission handling
 * and the rule that starting an already-running camera is not an error.
 */
import { AppError, ErrorCode } from '@core/errors';

import {
  CameraPermission,
  type CameraAdapter,
  type CameraFrame,
  type FrameListener,
} from './cameraPort';

export interface MemoryCameraOptions {
  /** Frames to deliver, in order. */
  readonly frames?: readonly CameraFrame[];
  /** Starting permission state. Defaults to granted. */
  readonly permission?: CameraPermission;
}

export interface MemoryCamera extends CameraAdapter {
  /** Delivers the next queued frame, if the camera is running. */
  emitNext(): CameraFrame | undefined;

  /** Delivers every queued frame in order. */
  emitAll(): number;

  /** Queues a frame for later delivery. */
  push(frame: CameraFrame): void;

  /** Frames still queued. */
  pending(): number;
}

/** Creates an in-memory camera. */
export function createMemoryCamera(options: MemoryCameraOptions = {}): MemoryCamera {
  const queue: CameraFrame[] = [...(options.frames ?? [])];
  const listeners = new Set<FrameListener>();

  let permission = options.permission ?? CameraPermission.Granted;
  let running = false;

  function deliver(frame: CameraFrame): void {
    // A snapshot, so subscribing during delivery does not change who receives
    // this frame — the same rule the event bus follows.
    for (const listener of [...listeners]) {
      listener(frame);
    }
  }

  return {
    permission() {
      return permission;
    },

    async requestPermission() {
      if (permission === CameraPermission.Undetermined) {
        permission = CameraPermission.Granted;
      }
      return permission;
    },

    async start() {
      if (permission !== CameraPermission.Granted) {
        throw new AppError(ErrorCode.CAMERA_ERROR, 'Camera permission has not been granted.', {
          details: { permission },
        });
      }
      // Idempotent: a receive screen may be resumed more than once.
      running = true;
    },

    async stop() {
      running = false;
    },

    isRunning() {
      return running;
    },

    onFrame(listener) {
      listeners.add(listener);

      let active = true;
      return (): void => {
        if (!active) {
          return;
        }
        active = false;
        listeners.delete(listener);
      };
    },

    emitNext() {
      if (!running) {
        return undefined;
      }

      const frame = queue.shift();

      if (frame !== undefined) {
        deliver(frame);
      }

      return frame;
    },

    emitAll() {
      let delivered = 0;

      while (running && queue.length > 0) {
        this.emitNext();
        delivered += 1;
      }

      return delivered;
    },

    push(frame) {
      queue.push(frame);
    },

    pending() {
      return queue.length;
    },
  } satisfies MemoryCamera as MemoryCamera;
}
