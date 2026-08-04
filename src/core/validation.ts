/**
 * Validation results.
 *
 * The protocol validates in several places — packets (PACKET_SPEC §12),
 * manifests (PROTOCOL_SPEC §10.7) — and every one of them needs the same
 * thing: a yes/no answer plus every reason it was no.
 *
 * Reporting rather than throwing is deliberate. Rejected input is the normal
 * case on an optical link, not an exceptional one, and a caller that must
 * distinguish a corrupted packet (§3.27) from a foreign one (§8.11) needs the
 * reasons, not a stack trace.
 *
 * The rejection vocabulary is per-validator; only the shape is shared.
 */

export interface ValidationOutcome<TRejection extends string> {
  readonly valid: boolean;
  /** Every reason validation failed, in the order checked. Empty when valid. */
  readonly rejections: readonly TRejection[];
}

/** A passing result. */
export function valid<TRejection extends string>(): ValidationOutcome<TRejection> {
  return Object.freeze({ valid: true, rejections: Object.freeze([]) });
}

/** A failing result carrying its reasons. */
export function invalid<TRejection extends string>(
  rejections: readonly TRejection[],
): ValidationOutcome<TRejection> {
  return Object.freeze({ valid: false, rejections: Object.freeze([...rejections]) });
}

/** Merges results, preserving order and dropping duplicates. */
export function mergeOutcomes<TRejection extends string>(
  ...outcomes: readonly ValidationOutcome<TRejection>[]
): ValidationOutcome<TRejection> {
  const rejections: TRejection[] = [];

  for (const outcome of outcomes) {
    for (const rejection of outcome.rejections) {
      if (!rejections.includes(rejection)) {
        rejections.push(rejection);
      }
    }
  }

  return rejections.length === 0 ? valid<TRejection>() : invalid(rejections);
}
