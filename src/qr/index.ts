/**
 * qr/ — Adapter layer — optical transport, send side
 *
 * Encodes protocol packets into displayable frames and paces them. Treats
 * payload bytes as opaque.
 *
 * Purpose, ownership, dependency rules and public exports: see ./README.md.
 * Behaviour is defined by docs/QR_SPEC.md.
 */

export {
  createQrEncoder,
  ErrorCorrectionLevel,
  MAX_PAYLOAD_BYTES,
  MAX_QR_VERSION,
  MIN_QR_VERSION,
  moduleAt,
  type EncodeOptions,
  type QrEncoder,
  type QrEncoderOptions,
  type QrFrame,
} from './qrEncoder';

export {
  DEFAULT_BACKGROUND,
  DEFAULT_FOREGROUND,
  DISPLAY_RECOMMENDATION,
  QUIET_ZONE_MODULES,
  renderFrame,
  toSvgPath,
  type DisplayRecommendation,
  type ModuleRect,
  type RenderedFrame,
  type RenderOptions,
} from './qrRenderer';

export {
  createFrameScheduler,
  FRAME_DURATION_MS,
  FrameRate,
  MAX_FRAME_DURATION_MS,
  MIN_FRAME_DURATION_MS,
  type FrameScheduler,
  type SchedulerOptions,
  type SchedulerState,
} from './frameScheduler';

export {
  adapt,
  AdaptationDirection,
  ADAPTATION_WINDOW,
  DEFAULT_PARAMETERS,
  DEGRADE_THRESHOLD,
  IMPROVE_THRESHOLD,
  parametersFor,
  type AdaptationDecision,
  type TransportObservation,
  type TransportParameters,
} from './adaptiveTiming';

export {
  benchmarkEncoding,
  DEFAULT_PAYLOAD_SIZES,
  formatBenchmark,
  type BenchmarkOptions,
  type BenchmarkSample,
} from './benchmark';
