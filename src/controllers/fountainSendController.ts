/**
 * Fountain send controller (F7) — ADR-0008.
 *
 * The send workflow for the rateless engine. Much smaller than
 * `sendController` because the transport it drives is: there is no session to
 * open, no manifest to build, no packet count to reach and no end to arrive
 * at. A user picks one file, the codes start, and the codes stop when they say
 * so.
 *
 * Kept separate rather than folded into `sendController` behind a flag. The
 * two engines differ in what a transfer *is* — many files against one, a
 * finite frame list against an endless stream, a completion against a user
 * decision — and a single controller pretending otherwise would have to lie
 * about one of them in every method.
 */
import type { Clock } from '@core/contracts';
import type { ContainerFile } from '@core/fountain/index';
import type {
  CarouselPosition,
  FountainSendService,
  FountainStream,
} from '@services/fountainSendService';
import type { Store } from '@state/store';
import { createStore } from '@state/store';

import { QRSpeedPreference } from '@domain/settings';
import { FRAME_RATE_FOR_PREFERENCE, FRAME_DURATION_MS } from '@qr/frameScheduler';
import { renderFrame, toSvgPath } from '@qr/qrRenderer';

import type { QrFrameGeometry } from './sendController';

/** Where the user is in the rateless send workflow. */
export const FountainSendStage = {
  /** No file chosen. */
  Selecting: 'SELECTING',
  /** Codes are on screen. */
  Sending: 'SENDING',
  /** Paused by the user. */
  Paused: 'PAUSED',
  /** The file could not be prepared. */
  Failed: 'FAILED',
} as const;

export type FountainSendStage = (typeof FountainSendStage)[keyof typeof FountainSendStage];

export interface FountainSendState {
  readonly stage: FountainSendStage;
  readonly file: ContainerFile | undefined;
  /** Source blocks the stream splits into. `0` before preparation. */
  readonly k: number;
  readonly blockLength: number;
  readonly speed: QRSpeedPreference;
  /** Where the carousel has reached. `undefined` before preparation. */
  readonly position: CarouselPosition | undefined;
  /** How long the current frame is shown, in milliseconds. */
  readonly durationMs: number;
  readonly startedAt: number | undefined;
  readonly errorMessage: string | undefined;
}

/** Default payload bytes per frame, before the 20-byte frame header. */
export const DEFAULT_BLOCK_LENGTH = 512;

export const initialFountainSendState: FountainSendState = Object.freeze({
  stage: FountainSendStage.Selecting,
  file: undefined,
  k: 0,
  blockLength: DEFAULT_BLOCK_LENGTH,
  speed: QRSpeedPreference.Balanced,
  position: undefined,
  durationMs: FRAME_DURATION_MS[FRAME_RATE_FOR_PREFERENCE[QRSpeedPreference.Balanced]],
  startedAt: undefined,
  errorMessage: undefined,
});

export interface FountainSendController {
  readonly state: Store<FountainSendState>;

  /** Drawable geometry for the code now showing, or `undefined` before one. */
  currentFrame(targetSize: number): QrFrameGeometry | undefined;

  chooseFile(file: ContainerFile): void;
  setBlockLength(bytes: number): void;
  setSpeed(speed: QRSpeedPreference): void;

  /** Prepares the stream and puts the first code on screen. */
  start(): void;
  /**
   * Moves to the next sequence number.
   *
   * Never ends. The carousel repeats, and each pass draws different repair
   * frames, so watching longer always adds information.
   */
  advance(): void;
  pause(): void;
  resume(): void;
  /** Restarts the sweep at sequence zero. */
  restart(): void;
  /** Stops and clears, returning to file selection. */
  cancel(): void;
}

export interface FountainSendControllerOptions {
  readonly sender: FountainSendService;
  readonly clock: Clock;
  readonly toUserMessage: (error: unknown) => string;
}

export function createFountainSendController(
  options: FountainSendControllerOptions,
): FountainSendController {
  const { sender, clock, toUserMessage } = options;
  const state = createStore(initialFountainSendState);

  let stream: FountainStream | undefined;

  /** Publishes the carousel position so the screen re-renders when it moves. */
  function publish(): void {
    if (stream === undefined) {
      return;
    }

    const position = stream.position();
    state.setState((previous) => ({ ...previous, position }));
  }

  // Declared as local functions, not methods: the screens pass these straight
  // to `onPress`, which detaches them from the controller object.
  function beginStream(): void {
    const current = state.getState();

    if (current.file === undefined) {
      return;
    }

    try {
      stream = sender.prepare({ file: current.file, blockLength: current.blockLength });

      state.setState((previous) => ({
        ...previous,
        stage: FountainSendStage.Sending,
        k: stream?.k ?? 0,
        position: stream?.position(),
        startedAt: previous.startedAt ?? clock.now(),
        errorMessage: undefined,
      }));
    } catch (error: unknown) {
      // A block length past QR capacity lands here, before anything is shown.
      state.setState((previous) => ({
        ...previous,
        stage: FountainSendStage.Failed,
        errorMessage: toUserMessage(error),
      }));
    }
  }

  return {
    state,

    currentFrame(targetSize) {
      const frame = stream?.current();

      if (frame === undefined) {
        return undefined;
      }

      const rendered = renderFrame(frame, { targetSize });

      return {
        size: rendered.size,
        path: toSvgPath(rendered),
        foreground: rendered.foreground,
        background: rendered.background,
      };
    },

    chooseFile(file) {
      stream = undefined;
      state.setState((previous) => ({
        ...previous,
        file,
        stage: FountainSendStage.Selecting,
        k: 0,
        position: undefined,
        startedAt: undefined,
        errorMessage: undefined,
      }));
    },

    setBlockLength(bytes) {
      // Changing the block length changes k, so the stream is rebuilt on the
      // next start rather than adjusted — a receiver mid-transfer would see a
      // different stream identity and reset, which is correct.
      stream = undefined;
      state.setState((previous) => ({ ...previous, blockLength: bytes, position: undefined }));
    },

    setSpeed(speed) {
      state.setState((previous) => ({
        ...previous,
        speed,
        durationMs: FRAME_DURATION_MS[FRAME_RATE_FOR_PREFERENCE[speed]],
      }));
    },

    start: beginStream,

    advance() {
      if (state.getState().stage !== FountainSendStage.Sending) {
        return;
      }

      stream?.advance();
      publish();
    },

    pause() {
      if (state.getState().stage === FountainSendStage.Sending) {
        state.setState((previous) => ({ ...previous, stage: FountainSendStage.Paused }));
      }
    },

    resume() {
      if (state.getState().stage === FountainSendStage.Paused) {
        state.setState((previous) => ({ ...previous, stage: FountainSendStage.Sending }));
      }
    },

    restart() {
      stream?.reset();
      publish();
    },

    cancel() {
      stream = undefined;
      state.setState((previous) => ({
        ...initialFountainSendState,
        // The chosen file survives a cancel: a user who stops to move the
        // phones should not have to pick it again.
        file: previous.file,
        blockLength: previous.blockLength,
        speed: previous.speed,
        durationMs: previous.durationMs,
      }));
    },
  };
}
