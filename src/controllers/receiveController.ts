/**
 * Receive controller (UI-004) — UI_SPEC §5.3; ARCHITECTURE §6.5.
 *
 * Coordinates the Receive workflow: camera permission, capture, and progress
 * as packets arrive.
 *
 * The camera is reached only through the `CameraAdapter` contract, so the
 * controller runs identically against a device camera and the in-memory one —
 * which is what makes the whole Receive workflow testable with no hardware.
 */
import type { CameraAdapter } from '@camera/cameraPort';
import { CameraPermission } from '@camera/cameraPort';

import type {
  CompletedFile,
  ReceiveProgress,
  ReceiveService,
  ReceiveSession,
} from '@services/receiveService';
import { createStore, type Store } from '@state/store';

import type { SessionId } from '@domain/ids';

/** Where the user is in the Receive workflow (§7 screen states). */
export const ReceiveStage = {
  /** Permission has not been granted yet (§14: a recoverable error). */
  NeedsPermission: 'NEEDS_PERMISSION',
  /** Camera starting (§16 loading state). */
  Starting: 'STARTING',
  /** Capturing frames. */
  Scanning: 'SCANNING',
  /** Every declared packet collected (§13.11). */
  Complete: 'COMPLETE',
  /** Stopped by the user. */
  Stopped: 'STOPPED',
  /** The camera could not be used (§14 error state). */
  Failed: 'FAILED',
} as const;

export type ReceiveStage = (typeof ReceiveStage)[keyof typeof ReceiveStage];

export interface ReceiveState {
  readonly stage: ReceiveStage;
  readonly permission: CameraPermission;
  readonly sessionId: SessionId | undefined;
  readonly totalPackets: number;
  readonly collectedPackets: number;
  /** §5.3 requires a missing packet counter. */
  readonly missingPackets: number;
  readonly framesSeen: number;
  readonly framesDecoded: number;
  readonly errorMessage: string | undefined;
}

export const initialReceiveState: ReceiveState = Object.freeze({
  stage: ReceiveStage.NeedsPermission,
  permission: CameraPermission.Undetermined,
  sessionId: undefined,
  totalPackets: 0,
  collectedPackets: 0,
  missingPackets: 0,
  framesSeen: 0,
  framesDecoded: 0,
  errorMessage: undefined,
});

export interface ReceiveController {
  readonly state: Store<ReceiveState>;

  /** Asks for camera permission (§12, §14 recovery action). */
  requestPermission(): Promise<CameraPermission>;
  /** Starts the camera and begins consuming frames for a session. */
  start(sessionId: SessionId): Promise<void>;
  /** Stops capture and releases the camera. */
  stop(): Promise<void>;
  /** Reassembles and verifies every complete file (§3.24). */
  finish(): readonly CompletedFile[];
}

export interface ReceiveControllerOptions {
  readonly camera: CameraAdapter;
  readonly receives: ReceiveService;
  readonly toUserMessage: (error: unknown) => string;
}

export function createReceiveController(options: ReceiveControllerOptions): ReceiveController {
  const { camera, receives, toUserMessage } = options;
  const state = createStore(initialReceiveState);

  let session: ReceiveSession | undefined;

  function applyProgress(progress: ReceiveProgress): void {
    state.setState((previous) => ({
      ...previous,
      totalPackets: progress.totalPackets,
      collectedPackets: progress.collectedPackets,
      missingPackets: progress.missingPackets,
      framesSeen: progress.framesSeen,
      framesDecoded: progress.framesDecoded,
      stage: progress.complete ? ReceiveStage.Complete : previous.stage,
    }));
  }

  return {
    state,

    async requestPermission() {
      const permission = await camera.requestPermission();

      state.setState((previous) => ({
        ...previous,
        permission,
        stage:
          permission === CameraPermission.Granted
            ? ReceiveStage.Stopped
            : ReceiveStage.NeedsPermission,
      }));

      return permission;
    },

    async start(sessionId) {
      state.setState((previous) => ({
        ...previous,
        stage: ReceiveStage.Starting,
        sessionId,
        errorMessage: undefined,
      }));

      try {
        await camera.start();
        session = receives.start(sessionId, applyProgress);

        state.setState((previous) => ({ ...previous, stage: ReceiveStage.Scanning }));
        applyProgress(session.progress());
      } catch (error: unknown) {
        state.setState((previous) => ({
          ...previous,
          stage: ReceiveStage.Failed,
          errorMessage: toUserMessage(error),
        }));
      }
    },

    async stop() {
      session?.stop();
      session = undefined;
      await camera.stop();

      state.setState((previous) => ({
        ...previous,
        // A completed transfer stays complete; stopping does not undo it.
        stage: previous.stage === ReceiveStage.Complete ? previous.stage : ReceiveStage.Stopped,
      }));
    },

    finish() {
      return session?.finish() ?? [];
    },
  };
}
