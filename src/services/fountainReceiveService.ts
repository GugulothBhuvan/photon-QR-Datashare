/**
 * Fountain receive service (F7) — ADR-0008.
 *
 * Watches the camera and reconstructs a file, **knowing nothing when it
 * starts**. No session id is passed in, because there is nothing to pass: the
 * first frame it manages to decode tells it the block count, the block length,
 * the payload length and how to verify the result, and it begins from there.
 *
 * That is the whole difference from `receiveService.ts`, which must be handed a
 * session whose manifest has already been accepted — and therefore cannot
 * begin at all until the discovery service has caught a preamble.
 *
 * Frames from another transfer are not merely ignored, they are *detected*: a
 * foreign block XORed into a decoder corrupts it silently, and the corruption
 * surfaces only as a checksum failure after the whole transfer has run.
 */
import type { CameraAdapter } from '@camera/cameraPort';
import type { QrDecoder } from '@camera/qrDecoder';

import type { IntegrityVerifier } from '@core/contracts';
import {
  createFountainDecoder,
  decodeFrame,
  matchesChecksum,
  streamIdentity,
  unpackContainer,
  type FountainDecoder,
  type FrameHeader,
  type UnpackedFile,
} from '@core/fountain/index';

/** What a receiver can say about a transfer in progress. */
export interface FountainReceiveProgress {
  /** Camera frames seen, whether or not they held a code. */
  readonly framesSeen: number;
  /** Frames a QR symbol was read from. */
  readonly framesDecoded: number;
  /** Frames belonging to this stream that carried something new. */
  readonly framesAccepted: number;
  /**
   * Frames that were new but taught the decoder nothing.
   *
   * A receiver joining late watches the carousel sweep blocks it already
   * holds. Reported separately because a progress estimate fed raw accepted
   * frames overstates itself by exactly this fraction.
   */
  readonly framesRedundant: number;
  /** Frames refused as belonging to a different transfer. */
  readonly framesForeign: number;
  readonly blocksSolved: number;
  /** Source blocks in the stream, or 0 before the first frame is read. */
  readonly k: number;
  readonly complete: boolean;
}

/** How a completed transfer ended. */
export const FountainOutcome = {
  Received: 'RECEIVED',
  /** Reassembled, but not the bytes the stream promised. */
  ChecksumFailed: 'CHECKSUM_FAILED',
  /** Reassembled and intact, but not a container this build understands. */
  Unreadable: 'UNREADABLE',
  /** Reassembled, but the file does not match the digest inside it (§20). */
  IntegrityFailed: 'INTEGRITY_FAILED',
} as const;

export type FountainOutcome = (typeof FountainOutcome)[keyof typeof FountainOutcome];

export type FountainResult =
  | { readonly outcome: 'RECEIVED'; readonly file: UnpackedFile }
  | { readonly outcome: Exclude<FountainOutcome, 'RECEIVED'> };

export interface FountainReceiveSession {
  progress(): FountainReceiveProgress;
  /**
   * The reconstructed file, once every block is solved.
   *
   * `undefined` while incomplete. Verification runs here rather than on every
   * frame: a digest over a whole file is not something to compute speculatively
   * while a camera is delivering thirty frames a second.
   */
  finish(): FountainResult | undefined;
  /** Stops consuming frames. Idempotent. */
  stop(): void;
}

export interface FountainReceiveServiceOptions {
  readonly camera: CameraAdapter;
  readonly decoder: QrDecoder;
  /** Checks the file against the digest the container carried (§20). */
  readonly verifier: IntegrityVerifier;
}

export interface FountainReceiveService {
  /**
   * Begins watching for any fountain stream.
   *
   * @param onProgress Called after each camera frame, so a screen can render
   *   without polling. Called on every frame rather than only on change: the
   *   frame counter is the only evidence a receiver can offer that its camera
   *   is alive, and a receiver that reports nothing while searching is one this
   *   project has already lost four device sessions to.
   */
  listen(onProgress?: (progress: FountainReceiveProgress) => void): FountainReceiveSession;
}

export function createFountainReceiveService(
  options: FountainReceiveServiceOptions,
): FountainReceiveService {
  const { camera, decoder, verifier } = options;

  return {
    listen(onProgress) {
      let fountain: FountainDecoder | undefined;
      let identity: string | undefined;
      let header: FrameHeader | undefined;
      let stopped = false;

      let framesSeen = 0;
      let framesDecoded = 0;
      let framesForeign = 0;

      function snapshot(): FountainReceiveProgress {
        const inner = fountain?.progress();

        return {
          framesSeen,
          framesDecoded,
          framesForeign,
          framesAccepted: inner?.framesAccepted ?? 0,
          framesRedundant: inner?.framesRedundant ?? 0,
          blocksSolved: inner?.blocksSolved ?? 0,
          k: inner?.k ?? 0,
          complete: inner?.complete ?? false,
        };
      }

      function consume(frame: Parameters<Parameters<CameraAdapter['onFrame']>[0]>[0]): void {
        framesSeen += 1;

        const decoded = decoder.decode(frame);

        if (!decoded.ok) {
          return;
        }

        framesDecoded += 1;

        const parsed = decodeFrame(decoded.payload);

        if (!parsed.ok) {
          // Someone else's QR code, or a format this build cannot read. Both
          // are ordinary: a camera is pointed at whatever is in front of it.
          return;
        }

        const seen = streamIdentity(parsed.header);

        if (identity === undefined) {
          identity = seen;
          header = parsed.header;
          fountain = createFountainDecoder({
            k: parsed.header.k,
            blockLength: parsed.header.blockLength,
            totalLength: parsed.header.totalLength,
            sessionSeed: parsed.header.sessionSeed,
          });
        } else if (identity !== seen) {
          // **Detected, not ignored.** Once a transfer is under way a frame
          // from a different one must not reach the decoder: its block would
          // XOR in, the result would be meaningless, and nothing would notice
          // until the final checksum failed. Counted so a user pointing at two
          // senders can see why nothing is progressing.
          framesForeign += 1;
          return;
        }

        fountain?.accept(parsed.header.seq, parsed.block);
      }

      const unsubscribe = camera.onFrame((frame) => {
        if (stopped) {
          return;
        }

        consume(frame);
        onProgress?.(snapshot());
      });

      return {
        progress: snapshot,

        finish() {
          const payload = fountain?.assemble();

          if (payload === undefined || header === undefined) {
            return undefined;
          }

          // The stream's own checksum first. A payload that reassembled but is
          // not what was sent must not reach a parser that would read lengths
          // out of it.
          if (!matchesChecksum(header, payload)) {
            return { outcome: FountainOutcome.ChecksumFailed };
          }

          const container = unpackContainer(payload);

          if (!container.ok) {
            return { outcome: FountainOutcome.Unreadable };
          }

          // §20: verified before the file is reported as received. §20.14
          // forbids presenting a file that did not verify, so this is an
          // outcome rather than a warning attached to a delivered file.
          if (!verifier.verify(container.file.content, container.file.digest)) {
            return { outcome: FountainOutcome.IntegrityFailed };
          }

          return { outcome: FountainOutcome.Received, file: container.file };
        },

        stop() {
          if (stopped) {
            return;
          }

          stopped = true;
          unsubscribe();
        },
      };
    },
  };
}
