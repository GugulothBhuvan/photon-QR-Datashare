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
  DiscoveryListener,
  DiscoveryRefusal,
  DiscoveryService,
} from '@services/discoveryService';
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
  /**
   * Camera running, waiting for a sender to appear (§7.4).
   *
   * Distinct from Scanning: nothing is being collected yet because no manifest
   * has arrived. A receiver spends most of its time here, and telling the user
   * "searching" rather than "scanning" is the difference between a screen that
   * looks broken and one that looks patient.
   */
  Searching: 'SEARCHING',
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
  /**
   * Why a sender was read and refused (§14).
   *
   * A refusal used to leave the screen saying "Looking for a sender" forever:
   * discovery recorded it and nothing published it. A receiver that has
   * decided it cannot speak to the device in front of it must say so.
   */
  readonly refusalReason: string | undefined;
  /**
   * Whether the user refused the camera and Android will not ask again.
   *
   * Derived here rather than compared in the screen: camera vocabulary belongs
   * to the adapter, and a screen importing `CameraPermission` would cross the
   * layer boundary to learn something the controller already knows. The
   * difference matters — a refused permission makes the Grant button do
   * nothing, and the user must be sent to system settings instead.
   */
  readonly permissionRefused: boolean;
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
  refusalReason: undefined,
  permissionRefused: false,
  errorMessage: undefined,
});

/**
 * A refusal, in words a user can act on (§14, ARCHITECTURE §6.11).
 *
 * Protocol vocabulary does not reach a screen. `UNSUPPORTED_VERSION` tells a
 * user nothing; "the other device speaks a newer version" tells them the
 * transfer will not work however long they hold the phone there.
 */
export function describeRefusal(refusal: DiscoveryRefusal | undefined): string | undefined {
  if (refusal === undefined) {
    return undefined;
  }

  if (refusal.kind === 'HANDSHAKE') {
    switch (refusal.reason) {
      case 'UNSUPPORTED_VERSION':
        return 'The other device is using a version of the protocol this app does not support.';
      case 'UNSUPPORTED_CAPABILITY':
        return 'The other device needs a feature this app does not have.';
      default:
        return 'The signal from the other device was incomplete.';
    }
  }

  switch (refusal.reason) {
    case 'UNSUPPORTED_ENCODING_VERSION':
      return 'The other device described its files in a format this app cannot read.';
    case 'COUNT_MISMATCH':
    case 'INVALID_FIELD':
      return 'The file list from the other device did not make sense.';
    default:
      return 'The file list from the other device was incomplete.';
  }
}

export interface ReceiveController {
  readonly state: Store<ReceiveState>;

  /** Asks for camera permission (§12, §14 recovery action). */
  requestPermission(): Promise<CameraPermission>;
  /** Starts the camera and begins consuming frames for a session. */
  start(sessionId: SessionId): Promise<void>;

  /**
   * Starts the camera and waits for a sender to announce itself (§7.4–§7.6).
   *
   * This is what a receiver actually does on a device: it knows no session id,
   * because the sender chose it. `start` remains for callers that already have
   * one — chiefly tests, which construct both sides.
   */
  listen(): Promise<void>;
  /** Stops capture and releases the camera. */
  stop(): Promise<void>;
  /** Reassembles and verifies every complete file (§3.24). */
  finish(): readonly CompletedFile[];
}

export interface ReceiveControllerOptions {
  readonly camera: CameraAdapter;
  readonly receives: ReceiveService;
  /** Watches for a sender. Absent only in tests that supply a session id. */
  readonly discovery?: DiscoveryService;
  readonly toUserMessage: (error: unknown) => string;
}

export function createReceiveController(options: ReceiveControllerOptions): ReceiveController {
  const { camera, receives, discovery, toUserMessage } = options;
  const state = createStore(initialReceiveState);

  let session: ReceiveSession | undefined;
  let listener: DiscoveryListener | undefined;

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
        permissionRefused: permission === CameraPermission.Denied,
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

    async listen() {
      if (discovery === undefined) {
        state.setState((previous) => ({
          ...previous,
          stage: ReceiveStage.Failed,
          errorMessage: 'This build cannot search for a sender.',
        }));
        return;
      }

      state.setState((previous) => ({
        ...previous,
        stage: ReceiveStage.Starting,
        errorMessage: undefined,
      }));

      try {
        await camera.start();

        // Collection begins only once a manifest has been accepted — until
        // then there is nothing to place packets against (§10.14).
        listener = discovery.listen(
          (sessionId) => {
            session = receives.start(sessionId, applyProgress);

            // **Discovery stops here, and halves the cost of every frame.**
            // It stayed subscribed after a session began, decoding every frame
            // a second time only to discard the result — its own guard returns
            // early once a manifest has been accepted. The receive service is
            // the only consumer that matters from this point, and §11.11's
            // repeated preamble is exactly what it already ignores.
            listener?.stop();
            listener = undefined;

            state.setState((previous) => ({
              ...previous,
              stage: ReceiveStage.Scanning,
              sessionId,
              refusalReason: undefined,
            }));

            applyProgress(session.progress());
          },

          // Published on every frame while searching. These counters are the
          // only evidence a receiver can offer that its camera is alive, and
          // until now they came from a session that does not exist yet — so
          // the screen read zero whether or not frames were arriving.
          (progress) => {
            state.setState((previous) =>
              // A live session owns the counters from here on; discovery keeps
              // reading frames it no longer interprets.
              previous.stage === ReceiveStage.Scanning || previous.stage === ReceiveStage.Complete
                ? previous
                : {
                    ...previous,
                    framesSeen: progress.framesSeen,
                    framesDecoded: progress.framesDecoded,
                    refusalReason: describeRefusal(progress.refusal),
                  },
            );
          },
        );

        state.setState((previous) => ({ ...previous, stage: ReceiveStage.Searching }));
      } catch (error: unknown) {
        state.setState((previous) => ({
          ...previous,
          stage: ReceiveStage.Failed,
          errorMessage: toUserMessage(error),
        }));
      }
    },

    async stop() {
      listener?.stop();
      listener = undefined;
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
