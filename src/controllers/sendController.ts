/**
 * Send controller (UI-003) — UI_SPEC §5.2; ARCHITECTURE §6.5.
 *
 * Coordinates the Send workflow: which files are selected, what the transfer
 * options are, and moving from selection into transmission.
 *
 * ARCHITECTURE §6.5 and §6.14.2: controllers orchestrate workflows rather than
 * perform processing. Nothing here packetizes, encodes or validates — every
 * such step is a service call. What the controller owns is *screen-facing
 * state*: what the user has chosen and what stage they are at.
 *
 * Plain TypeScript with no React, so the whole Send workflow is testable
 * without a renderer.
 */
import type { Clock } from '@core/contracts';
import type { PreparedTransfer, SelectedFile, TransferService } from '@services/transferService';
import type { Store } from '@state/store';
import { createStore } from '@state/store';

import type { SessionId } from '@domain/ids';
import { QRSpeedPreference } from '@domain/settings';
import type { ErrorCorrectionLevel } from '@qr/qrEncoder';
import { FRAME_RATE_FOR_PREFERENCE } from '@qr/frameScheduler';
import { renderFrame, type RenderedFrame } from '@qr/qrRenderer';

/** Where the user is in the Send workflow (§7 screen states). */
export const SendStage = {
  /** No files chosen yet (§15 empty state). */
  Selecting: 'SELECTING',
  /** Building the manifest and encoding frames (§16 loading state). */
  Preparing: 'PREPARING',
  /** Frames ready; the screen may display them. */
  Ready: 'READY',
  /** Transmitting. */
  Sending: 'SENDING',
  /** Paused by the user (§14.6). */
  Paused: 'PAUSED',
  /** Preparation failed (§14 error state). */
  Failed: 'FAILED',
} as const;

export type SendStage = (typeof SendStage)[keyof typeof SendStage];

/**
 * Where the display has reached in the frame sequence (§5.4).
 *
 * Named here rather than borrowed from the scheduler so the screen depends on
 * the controller's vocabulary, not the transport's.
 */
export interface FramePosition {
  /** Zero-based index of the frame now showing. */
  readonly index: number;
  readonly frameCount: number;
  /** How long this frame is shown, in milliseconds (§9). */
  readonly durationMs: number;
}

export interface SendState {
  readonly stage: SendStage;
  readonly files: readonly SelectedFile[];
  readonly packetSize: number;
  readonly level: ErrorCorrectionLevel;
  /**
   * The user's speed preference (§5.2).
   *
   * A preference, not a frame duration — translating it into transport timing
   * is the transport's job, and this controller is where the two meet.
   */
  readonly speed: QRSpeedPreference;
  readonly sessionId: SessionId | undefined;
  readonly totalPackets: number;
  /** `undefined` until a transfer has been prepared. */
  readonly position: FramePosition | undefined;
  /**
   * When transmission began, from the injected clock. `undefined` until then.
   *
   * Held here so §5.4's elapsed time and throughput are derived from the same
   * clock the protocol uses, rather than a screen reading the wall clock.
   */
  readonly startedAt: number | undefined;
  /** A user-safe message (§14, ARCHITECTURE §6.11). Never a protocol internal. */
  readonly errorMessage: string | undefined;
}

/**
 * Default payload size.
 *
 * Comfortably inside the medium-error-correction QR capacity of 2331 bytes
 * once the 54-byte packet overhead is added, and small enough that a dropped
 * frame costs little to repeat.
 */
export const DEFAULT_PACKET_SIZE = 512;

export const initialSendState: SendState = Object.freeze({
  stage: SendStage.Selecting,
  files: Object.freeze([]),
  packetSize: DEFAULT_PACKET_SIZE,
  level: 'M',
  speed: QRSpeedPreference.Balanced,
  sessionId: undefined,
  totalPackets: 0,
  position: undefined,
  startedAt: undefined,
  errorMessage: undefined,
});

export interface SendController {
  readonly state: Store<SendState>;
  /** The prepared transfer, once preparation succeeded. */
  prepared(): PreparedTransfer | undefined;

  /**
   * Drawable geometry for the frame now showing, at the given width in points.
   *
   * The controller renders rather than the screen: §13's rendering rules belong
   * to the QR layer, and a screen that reached into it to draw would be one
   * more place those rules could be got wrong.
   *
   * @returns `undefined` before a transfer has been prepared.
   */
  currentFrame(targetSize: number): RenderedFrame | undefined;

  /** Moves the display to the next frame in packet order (§8). */
  advance(): void;

  addFiles(files: readonly SelectedFile[]): void;
  removeFile(name: string): void;
  clearFiles(): void;

  setPacketSize(size: number): void;
  setLevel(level: ErrorCorrectionLevel): void;
  /** Changes the user's speed preference, live if a transfer is running (§10). */
  setSpeed(speed: QRSpeedPreference): void;

  /** Builds the manifest and encodes every frame (§5.2 Start Transfer). */
  prepare(): void;
  /** Begins transmission. */
  start(): void;
  /** Pauses transmission (§5.4 Pause). */
  pause(): void;
  /** Ends the transfer and returns to selection (§5.4 Cancel). */
  cancel(): void;
}

export interface SendControllerOptions {
  readonly transfers: TransferService;
  /** Stamps when transmission began. Injected — the controller reads no clock. */
  readonly clock: Clock;
  readonly integrityAlgorithm: string;
  readonly hashFile: (content: Uint8Array) => string;
  /** Reports a user-safe message. Injected so the controller names no UI. */
  readonly toUserMessage: (error: unknown) => string;
}

export function createSendController(options: SendControllerOptions): SendController {
  const { transfers, clock, integrityAlgorithm, hashFile, toUserMessage } = options;
  const state = createStore(initialSendState);

  let preparedTransfer: PreparedTransfer | undefined;

  /** Publishes the scheduler's position so the screen re-renders when it moves. */
  function publishPosition(): void {
    const scheduler = preparedTransfer?.scheduler;

    if (scheduler === undefined) {
      return;
    }

    const { index, frameCount, durationMs } = scheduler.state();
    state.setState((previous) => ({ ...previous, position: { index, frameCount, durationMs } }));
  }

  return {
    state,

    prepared() {
      return preparedTransfer;
    },

    currentFrame(targetSize) {
      const frame = preparedTransfer?.scheduler.current();

      return frame === undefined ? undefined : renderFrame(frame, { targetSize });
    },

    advance() {
      preparedTransfer?.scheduler.advance();
      publishPosition();
    },

    addFiles(files) {
      state.setState((previous) => ({
        ...previous,
        // Replacing by name keeps a re-picked file from appearing twice.
        files: [
          ...previous.files.filter(
            (existing) => !files.some((file) => file.name === existing.name),
          ),
          ...files,
        ],
        stage: SendStage.Selecting,
        errorMessage: undefined,
      }));
    },

    removeFile(name) {
      state.setState((previous) => ({
        ...previous,
        files: previous.files.filter((file) => file.name !== name),
      }));
    },

    clearFiles() {
      state.setState((previous) => ({ ...previous, files: [], stage: SendStage.Selecting }));
    },

    setPacketSize(size) {
      state.setState((previous) => ({ ...previous, packetSize: size }));
    },

    setLevel(level) {
      state.setState((previous) => ({ ...previous, level }));
    },

    setSpeed(speed) {
      state.setState((previous) => ({ ...previous, speed }));

      // Adapting a live transfer is permitted mid-flight (QR_SPEC §10).
      preparedTransfer?.scheduler.setRate(FRAME_RATE_FOR_PREFERENCE[speed]);
      publishPosition();
    },

    prepare() {
      const current = state.getState();

      if (current.files.length === 0) {
        return;
      }

      state.setState((previous) => ({
        ...previous,
        stage: SendStage.Preparing,
        errorMessage: undefined,
      }));

      try {
        preparedTransfer = transfers.prepare({
          files: current.files,
          packetSize: current.packetSize,
          level: current.level,
          rate: FRAME_RATE_FOR_PREFERENCE[current.speed],
          integrityAlgorithm,
          hashFile,
        });

        const position = preparedTransfer.scheduler.state();

        state.setState((previous) => ({
          ...previous,
          stage: SendStage.Ready,
          sessionId: preparedTransfer?.sessionId,
          totalPackets: preparedTransfer?.totalPackets ?? 0,
          position: {
            index: position.index,
            frameCount: position.frameCount,
            durationMs: position.durationMs,
          },
        }));
      } catch (error: unknown) {
        // §6.11: only a user-safe representation reaches the screen.
        state.setState((previous) => ({
          ...previous,
          stage: SendStage.Failed,
          errorMessage: toUserMessage(error),
        }));
      }
    },

    start() {
      const { sessionId, stage } = state.getState();

      if (sessionId === undefined || preparedTransfer === undefined) {
        return;
      }

      // Resuming and beginning are different transitions. §5.4's one button
      // does both, so the controller decides which — a paused session is past
      // Waiting and Handshake, and asking it for them would fail.
      const started =
        stage === SendStage.Paused ? transfers.resume(sessionId) : transfers.begin(sessionId);

      if (started) {
        state.setState((previous) => ({
          ...previous,
          stage: SendStage.Sending,
          // Resuming keeps the original start time: §5.4's elapsed time is how
          // long the transfer has been going, not how long since the last
          // resume.
          startedAt: previous.startedAt ?? clock.now(),
        }));
      }
    },

    pause() {
      const { sessionId } = state.getState();

      if (sessionId !== undefined && transfers.pause(sessionId)) {
        state.setState((previous) => ({ ...previous, stage: SendStage.Paused }));
      }
    },

    cancel() {
      const { sessionId } = state.getState();

      if (sessionId !== undefined) {
        transfers.cancel(sessionId);
      }

      preparedTransfer = undefined;
      state.setState(() => initialSendState);
    },
  };
}
