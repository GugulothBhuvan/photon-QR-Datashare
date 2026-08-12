/**
 * core/fountain — rateless optical transport (ADR-0008).
 *
 * The coding layer of the fountain engine: which blocks go into which frame,
 * how a payload becomes an endless stream, and how a stream becomes a payload
 * again. Nothing here knows about QR codes, cameras, files or sessions.
 *
 * `composition.ts` is **wire format**. Sender and receiver derive subsets
 * independently and never compare notes, so any change there breaks every peer
 * — silently, because the two simply stop agreeing on what a frame contained.
 */

export {
  cycleLength,
  frameComposition,
  splitmix32,
  REPAIR_DEGREE_MAX,
  REPAIR_DEGREE_MIN,
} from './composition';

export {
  createFountainEncoder,
  MAX_SOURCE_BLOCKS,
  type FountainEncoder,
  type FountainEncoderOptions,
} from './encoder';

export {
  decodeFrame,
  encodeFrame,
  fitsUint16,
  fitsUint32,
  matchesChecksum,
  streamIdentity,
  FRAME_HEADER_BYTES,
  FRAME_MAGIC,
  FRAME_VERSION,
  FrameRejection,
  type FrameDecodeResult,
  type FrameHeader,
} from './frameCodec';

export {
  fitsContainer,
  packContainer,
  safeFileName,
  unpackContainer,
  CONTAINER_HEADER_BYTES,
  CONTAINER_MAGIC,
  ContainerRejection,
  type ContainerFile,
  type ContainerResult,
  type UnpackedFile,
} from './container';

export {
  createFountainDecoder,
  type FountainDecoder,
  type FountainDecoderOptions,
  type FountainProgress,
} from './decoder';
