/**
 * Transfer history (MOD, A12-03).
 *
 * What the application remembers about a transfer once it is over. UI_SPEC
 * §5.5 requires History to exist and lists its controls; it does not say what
 * a record contains or how long one is kept, so both are recorded in
 * **ADR-0007** rather than decided silently here.
 *
 * **Metadata only, never content.** A record holds names, sizes and outcomes.
 * Payload bytes are written to the destination the user chose and are not
 * duplicated into the history store — a transfer log that accumulated copies
 * of everything ever sent would be a storage leak and a disclosure risk, and
 * neither is something a user asked for by opening History.
 */
import type { SessionId } from './ids';

/** Which way a transfer went, from this device's point of view. */
export const TransferDirection = {
  Send: 'SEND',
  Receive: 'RECEIVE',
} as const;

export type TransferDirection = (typeof TransferDirection)[keyof typeof TransferDirection];

/** How a transfer ended. */
export const TransferOutcome = {
  /** Every file arrived and every integrity check passed. */
  Completed: 'COMPLETED',
  /** The user stopped it, or it was abandoned before completing. */
  Cancelled: 'CANCELLED',
  /** It ended on an error, or a file failed its integrity check. */
  Failed: 'FAILED',
  /**
   * It ran to the end and the outcome is genuinely not knowable.
   *
   * This is the normal ending for a **send**. The optical transport has no
   * return path (SI-014), so a sender displays its frames and never learns
   * whether anything read them. Recording those as `Completed` would assert
   * something no part of the system observed.
   */
  Unknown: 'UNKNOWN',
} as const;

export type TransferOutcome = (typeof TransferOutcome)[keyof typeof TransferOutcome];

/** One file within a recorded transfer. */
export interface HistoryFile {
  readonly name: string;
  readonly size: number;
  /**
   * Whether this file's integrity check passed (§20).
   *
   * `undefined` for a sent file: the sender computes the digest that the
   * receiver checks, so there is nothing for it to verify. Distinct from
   * `false`, which means a check ran and failed.
   */
  readonly verified?: boolean;
  /** Where a received file was written. Absent for a sent file. */
  readonly savedTo?: string;
}

/** One completed transfer, as the application stores it. */
export interface TransferRecord {
  readonly sessionId: SessionId;
  readonly direction: TransferDirection;
  readonly outcome: TransferOutcome;
  /** When the transfer ended, from the injected clock. */
  readonly completedAt: number;
  readonly files: readonly HistoryFile[];
  /** Total payload bytes across every file. */
  readonly totalBytes: number;
}

/**
 * A display name for a record.
 *
 * A single file is named by that file; several are counted. History lists one
 * line per transfer, not per file, so the list needs one name for the group.
 */
export function describeRecord(record: TransferRecord): string {
  const [first] = record.files;

  if (first === undefined) {
    return 'Empty transfer';
  }

  return record.files.length === 1 ? first.name : `${String(record.files.length)} files`;
}

/** Whether every file in a record passed the checks that were run. */
export function isFullyVerified(record: TransferRecord): boolean {
  return (
    record.outcome === TransferOutcome.Completed &&
    record.files.every((file) => file.verified !== false)
  );
}
