/**
 * Fountain receive controller (F7) — ADR-0008.
 *
 * Watching for a rateless stream. Smaller than `receiveController` because
 * there is no discovery step: a receiver does not search for a sender and then
 * start collecting, it simply collects. The first frame it decodes is both the
 * discovery and the first piece of the file.
 *
 * There is no missing-packet count, no resume and no recovery, because the
 * transport has no notion of a frame that had to arrive.
 */
import { CameraPermission, type CameraAdapter } from '@camera/cameraPort';
import type { UnpackedFile } from '@core/fountain/index';
import type {
  FountainOutcome,
  FountainReceiveService,
  FountainReceiveSession,
} from '@services/fountainReceiveService';
import type { Store } from '@state/store';
import { createStore } from '@state/store';

/** Where the receiver is. */
export const FountainReceiveStage = {
  NeedsPermission: 'NEEDS_PERMISSION',
  Starting: 'STARTING',
  /** Camera running, nothing recognised yet. */
  Watching: 'WATCHING',
  /** A stream has been locked onto and blocks are arriving. */
  Collecting: 'COLLECTING',
  /** Every block solved and the file verified. */
  Complete: 'COMPLETE',
  /** Every block solved, but the result did not survive its checks. */
  Rejected: 'REJECTED',
  Stopped: 'STOPPED',
  Failed: 'FAILED',
} as const;

export type FountainReceiveStage = (typeof FountainReceiveStage)[keyof typeof FountainReceiveStage];

export interface FountainReceiveState {
  readonly stage: FountainReceiveStage;
  readonly permission: CameraPermission;
  readonly framesSeen: number;
  readonly framesDecoded: number;
  readonly framesAccepted: number;
  /** Frames that were new but taught the decoder nothing. */
  readonly framesRedundant: number;
  /** Frames belonging to a different transfer. */
  readonly framesForeign: number;
  readonly blocksSolved: number;
  /** Source blocks in the stream. `0` until the first frame is read. */
  readonly k: number;
  /** The file, once received and verified. */
  readonly file: UnpackedFile | undefined;
  /** Why a completed transfer was refused, when it was. */
  readonly rejection: FountainOutcome | undefined;
  readonly errorMessage: string | undefined;
}

export const initialFountainReceiveState: FountainReceiveState = Object.freeze({
  stage: FountainReceiveStage.NeedsPermission,
  permission: CameraPermission.Undetermined,
  framesSeen: 0,
  framesDecoded: 0,
  framesAccepted: 0,
  framesRedundant: 0,
  framesForeign: 0,
  blocksSolved: 0,
  k: 0,
  file: undefined,
  rejection: undefined,
  errorMessage: undefined,
});

export interface FountainReceiveController {
  readonly state: Store<FountainReceiveState>;
  requestPermission(): Promise<CameraPermission>;
  /** Starts the camera and begins collecting from whatever it sees. */
  listen(): Promise<void>;
  stop(): Promise<void>;
}

export interface FountainReceiveControllerOptions {
  readonly camera: CameraAdapter;
  readonly receiver: FountainReceiveService;
  readonly toUserMessage: (error: unknown) => string;
}

export function createFountainReceiveController(
  options: FountainReceiveControllerOptions,
): FountainReceiveController {
  const { camera, receiver, toUserMessage } = options;
  const state = createStore(initialFountainReceiveState);

  let session: FountainReceiveSession | undefined;

  /**
   * Reads the result once every block is solved.
   *
   * Done here rather than left to a screen because §20.14 forbids presenting a
   * file that did not verify: the controller decides between `Complete` and
   * `Rejected`, and a screen renders whichever it is told.
   */
  function settle(): void {
    const result = session?.finish();

    if (result === undefined) {
      return;
    }

    state.setState((previous) =>
      result.outcome === 'RECEIVED'
        ? { ...previous, stage: FountainReceiveStage.Complete, file: result.file }
        : { ...previous, stage: FountainReceiveStage.Rejected, rejection: result.outcome },
    );

    // Nothing more can arrive that matters. Releasing the subscription here
    // stops the decoder paying for frames it will discard.
    session?.stop();
    session = undefined;
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
            ? FountainReceiveStage.Stopped
            : FountainReceiveStage.NeedsPermission,
      }));

      return permission;
    },

    async listen() {
      state.setState((previous) => ({
        ...previous,
        stage: FountainReceiveStage.Starting,
        errorMessage: undefined,
      }));

      try {
        await camera.start();

        session = receiver.listen((progress) => {
          state.setState((previous) => ({
            ...previous,
            framesSeen: progress.framesSeen,
            framesDecoded: progress.framesDecoded,
            framesAccepted: progress.framesAccepted,
            framesRedundant: progress.framesRedundant,
            framesForeign: progress.framesForeign,
            blocksSolved: progress.blocksSolved,
            k: progress.k,
            // A stream is being collected the moment one frame of it lands.
            // There is no separate discovery stage to pass through.
            stage:
              previous.stage === FountainReceiveStage.Watching && progress.k > 0
                ? FountainReceiveStage.Collecting
                : previous.stage,
          }));

          if (progress.complete) {
            settle();
          }
        });

        state.setState((previous) => ({ ...previous, stage: FountainReceiveStage.Watching }));
      } catch (error: unknown) {
        state.setState((previous) => ({
          ...previous,
          stage: FountainReceiveStage.Failed,
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
        // A finished transfer keeps its result: stopping the camera afterwards
        // must not throw away the file the user is about to save.
        stage:
          previous.stage === FountainReceiveStage.Complete ||
          previous.stage === FountainReceiveStage.Rejected
            ? previous.stage
            : FountainReceiveStage.Stopped,
      }));
    },
  };
}
