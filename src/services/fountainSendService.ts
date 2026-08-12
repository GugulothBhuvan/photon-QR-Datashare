/**
 * Fountain send service (F7) — ADR-0008.
 *
 * Turns one file into an endless stream of QR frames.
 *
 * **Endless is the important word.** The packet engine prepares a finite frame
 * list and loops it, so the frames it will ever show are known before it
 * starts. Here there is no list: the sender emits sequence numbers until the
 * user stops it, and the receiver decides when it has enough. Nothing here
 * knows how long a transfer will take, because nothing can.
 *
 * Frames are therefore encoded **on demand** rather than up front. Encoding
 * ahead would mean deciding a length the protocol does not have, and holding
 * one QR bitmap per frame for a stream that never ends.
 */
import type { IntegrityVerifier } from '@core/contracts';
import { AppError, ErrorCode } from '@core/errors';
import {
  createFountainEncoder,
  cycleLength,
  encodeFrame,
  fitsContainer,
  packContainer,
  FRAME_HEADER_BYTES,
  type ContainerFile,
} from '@core/fountain/index';
import { crc32 } from '@core/packet/crc32';

import type { ErrorCorrectionLevel, QrEncoder, QrFrame } from '@qr/qrEncoder';

/** Where the carousel has reached, for a status line. */
export interface CarouselPosition {
  /** Frames emitted since this stream began. */
  readonly seq: number;
  /** Position within the current cycle. */
  readonly position: number;
  /** Frames in one cycle: a systematic sweep plus its repair frames. */
  readonly cycleLength: number;
  /** Complete passes over the carousel. */
  readonly pass: number;
  /** Whether the current frame carries one block outright, or a repair XOR. */
  readonly systematic: boolean;
}

export interface FountainStream {
  /** Mixed into every frame's PRNG seed; travels in every header. */
  readonly sessionSeed: number;
  readonly k: number;
  readonly blockLength: number;
  /** Container length, which is the file plus its metadata. */
  readonly totalLength: number;
  /** Bytes of the file itself, for a progress estimate a user recognises. */
  readonly contentLength: number;

  /** The frame to display now. */
  current(): QrFrame;
  /** Moves to the next sequence number and returns its frame. */
  advance(): QrFrame;
  position(): CarouselPosition;
  /**
   * Restarts the carousel at sequence zero.
   *
   * Not a protocol requirement — a receiver can join anywhere — but a user
   * watching a stall wants a control that visibly does something, and starting
   * the sweep again is the most useful thing it can do.
   */
  reset(): void;
}

export interface FountainSendService {
  /**
   * Prepares a stream for one file.
   *
   * @throws `AppError` when the file cannot be carried at this block length.
   *   Reported here rather than mid-transfer: a sender that discovers it half
   *   way through has already wasted the user's time.
   */
  prepare(options: PrepareStreamOptions): FountainStream;
}

export interface PrepareStreamOptions {
  readonly file: ContainerFile;
  /**
   * Payload bytes per frame, **before** the frame header.
   *
   * The caller chooses this from what a QR version can hold; this service only
   * checks that the result fits the encoder it was given.
   */
  readonly blockLength: number;
  readonly level?: ErrorCorrectionLevel;
}

export interface FountainSendServiceOptions {
  readonly qr: QrEncoder;
  /** Supplies the container's digest (§20). */
  readonly verifier: IntegrityVerifier;
  /**
   * Draws the per-stream seed.
   *
   * Injected so a test gets a deterministic stream. Sixteen bits, because that
   * is the header field — collisions across restarts are handled by comparing
   * the whole stream identity rather than by making this wider.
   */
  readonly randomSeed: () => number;
}

export function createFountainSendService(
  options: FountainSendServiceOptions,
): FountainSendService {
  const { qr, verifier, randomSeed } = options;

  return {
    prepare({ file, blockLength, level = 'M' }) {
      if (!fitsContainer(file)) {
        throw new AppError(ErrorCode.INVALID_CONFIGURATION, 'The file name or type is too long.', {
          details: { name: file.name },
        });
      }

      const frameBytes = blockLength + FRAME_HEADER_BYTES;
      const capacity = qr.capacityFor(level);

      if (frameBytes > capacity) {
        throw new AppError(
          ErrorCode.INVALID_CONFIGURATION,
          'Bytes per frame is larger than a QR code can hold at this error correction level.',
          { details: { frameBytes, capacity, level } },
        );
      }

      const payload = packContainer(file, verifier.digest(file.content));
      const sessionSeed = randomSeed() & 0xffff;

      const encoder = createFountainEncoder({ payload, blockLength, sessionSeed });
      const payloadCrc = crc32(payload);
      const cycle = cycleLength(encoder.k);

      let seq = 0;
      let rendered: QrFrame | undefined;

      /** Encodes the frame for the current sequence number. */
      function render(): QrFrame {
        const wire = encodeFrame(
          {
            sessionSeed,
            seq,
            k: encoder.k,
            blockLength: encoder.blockLength,
            totalLength: encoder.totalLength,
            payloadCrc,
          },
          encoder.block(seq),
        );

        rendered = qr.encode(wire, { level });
        return rendered;
      }

      return {
        sessionSeed,
        k: encoder.k,
        blockLength: encoder.blockLength,
        totalLength: encoder.totalLength,
        contentLength: file.content.byteLength,

        current() {
          return rendered ?? render();
        },

        advance() {
          seq += 1;
          return render();
        },

        position() {
          const position = seq % cycle;

          return {
            seq,
            position,
            cycleLength: cycle,
            pass: Math.floor(seq / cycle),
            systematic: position < encoder.k,
          };
        },

        reset() {
          seq = 0;
          rendered = undefined;
        },
      };
    },
  };
}
