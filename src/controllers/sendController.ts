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
import { renderFrame, toSvgPath } from '@qr/qrRenderer';

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
/** What a screen needs to draw one frame (§13). */
export interface QrFrameGeometry {
  readonly size: number;
  /** One SVG path covering every dark module. */
  readonly path: string;
  readonly foreground: string;
  readonly background: string;
}

export interface FramePosition {
  /** Zero-based index of the frame now showing. */
  readonly index: number;
  readonly frameCount: number;
  /** How long this frame is shown, in milliseconds (§9). */
  readonly durationMs: number;
  /** Complete passes over the frame list (§11.11 looping). */
  readonly loops: number;
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
 * Lowered from 512. Fitting inside the QR capacity is the easy constraint; the
 * one that decides whether a transfer works at all is how many modules a
 * receiving camera has to resolve. 512 bytes plus the 54-byte header lands
 * near QR version 20 — around 97 modules across — and a phone camera reading
 * another phone's screen at arm's length has only a few pixels per module to
 * work with, before autofocus and hand tremor take their share.
 *
 * 256 bytes lands near version 12, about 65 modules, which is roughly half the
 * density for the same physical code. The cost is more frames for the same
 * file, which the transport already handles: §11.11 loops, and a frame missed
 * is a frame repeated.
 *
 * Every optical-transfer implementation arrives at this trade, and the ones
 * with hardware behind them recommend cutting bytes per frame as the *first*
 * thing to try when nothing decodes.
 */
export const DEFAULT_PACKET_SIZE = 256;

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
   * Drawable geometry for the frame now showing.
   *
   * The controller renders rather than the screen: §13's rendering rules belong
   * to the QR layer, and a screen that reached into it to draw would be one
   * more place those rules could be got wrong.
   *
   * Returns a **path** rather than a list of rectangles. A version 40 code has
   * over 30,000 modules, and drawing one view each made the interface too busy
   * to accept a touch on a real device.
   *
   * @param targetSize Rendering units for the geometry. The screen scales it to
   *   whatever size it draws at, so this need not match the display size.
   * @returns `undefined` before a transfer has been prepared.
   */
  currentFrame(targetSize: number): QrFrameGeometry | undefined;

  /** Moves the display to the next frame in packet order (§8). */
  advance(): void;

  /**
   * Restarts the frame sequence from the first frame (§8).
   *
   * A receiver that joined late, or lost its place, needs the preamble again.
   * Looping brings it round eventually; restarting brings it round now.
   */
  restart(): void;

  addFiles(files: readonly SelectedFile[]): void;
  removeFile(name: string): void;
  clearFiles(): void;

  setPacketSize(size: number): void;
  setLevel(level: ErrorCorrectionLevel): void;
  /** Changes the user's speed preference, live if a transfer is running (§10). */
  setSpeed(speed: QRSpeedPreference): void;

  /** Builds the manifest and encodes every frame (§5.2 Start Transfer). */
  prepare(): void;

  /**
   * Prepares a transfer and begins transmitting it (§5.2's Start Transfer).
   *
   * §5.2 specifies **one** start button, so one tap must reach a state that
   * displays codes. `prepare` alone leaves the session at `Ready`, which the
   * send screen renders as the file list — so a user who tapped Start saw
   * nothing happen. Found on hardware, not in the suite, because every test
   * called `prepare` and `start` itself and so never exercised the gap
   * between them.
   */
  beginTransfer(): void;
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

    const { index, frameCount, durationMs, loops } = scheduler.state();
    state.setState((previous) => ({
      ...previous,
      position: { index, frameCount, durationMs, loops },
    }));
  }

  /**
   * Declared as local functions, not methods.
   *
   * The send screen passes these straight to a button's `onPress`, which
   * detaches them from the controller object — a method body relying on `this`
   * throws the moment it is used the way the UI uses it. That is exactly how
   * `beginTransfer` broke first time round.
   */
  function prepareTransfer(): void {
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
          loops: position.loops,
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
  }

  function startTransmission(): void {
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
  }

  return {
    state,

    prepared() {
      return preparedTransfer;
    },

    currentFrame(targetSize) {
      const frame = preparedTransfer?.scheduler.current();

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

    advance() {
      preparedTransfer?.scheduler.advance();
      publishPosition();
    },

    restart() {
      preparedTransfer?.scheduler.reset();
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

    prepare: prepareTransfer,

    beginTransfer() {
      prepareTransfer();

      // `prepare` is synchronous, so the stage is already settled. Starting is
      // conditional on it having succeeded: a failed preparation must stay on
      // its error state rather than being driven onward.
      if (state.getState().stage === SendStage.Ready) {
        startTransmission();
      }
    },

    start: startTransmission,

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
