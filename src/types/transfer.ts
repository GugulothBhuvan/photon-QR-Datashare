/**
 * Transfer — the process of moving files within a session (MOD-004).
 *
 * PROTOCOL_SPEC §3.18, §3.19; docs/API_SPEC.md §13 lists Transfer and Progress
 * as shared data contracts.
 *
 * **No transfer state machine here.** PROTOCOL_SPEC §12 defines the transfer
 * lifecycle and §26 its FSM; neither is read in this phase, and inventing
 * states would create a second, unauthoritative definition of protocol
 * behaviour. This model carries a transfer's identity and shape only. Lifecycle
 * arrives with the protocol engine.
 */
import { AppError, ErrorCode } from '@core/errors';

import { type FileId, type SessionId, type TransferId } from './ids';

/**
 * Which end of the transfer this device is.
 *
 * PROTOCOL_SPEC §3.5 and §3.6: exactly one sender per session, one or more
 * receivers.
 */
export const TransferDirection = {
  Send: 'SEND',
  Receive: 'RECEIVE',
} as const;

export type TransferDirection = (typeof TransferDirection)[keyof typeof TransferDirection];

export interface Transfer {
  readonly id: TransferId;
  /** Every transfer occurs within exactly one session (§8.1). */
  readonly sessionId: SessionId;
  readonly direction: TransferDirection;
  /** Files carried, in manifest order. Each has an independent packet sequence (§3.19). */
  readonly fileIds: readonly FileId[];
  /** Total packets expected across every file. */
  readonly totalPacketCount: number;
  /** Start time in epoch milliseconds, supplied by the caller. */
  readonly startedAt: number;
}

export interface TransferInput {
  readonly id: TransferId;
  readonly sessionId: SessionId;
  readonly direction: TransferDirection;
  readonly fileIds: readonly FileId[];
  readonly totalPacketCount: number;
  readonly startedAt: number;
}

/**
 * Progress through a transfer.
 *
 * A pure projection: how many of the expected packets have been accounted for.
 * It records no timing estimate, because estimating throughput is adaptive
 * transport's job (§17).
 */
export interface TransferProgress {
  readonly completedPackets: number;
  readonly totalPackets: number;
}

/** Creates a transfer. */
export function createTransfer(input: TransferInput): Transfer {
  if (input.fileIds.length === 0) {
    throw new AppError(ErrorCode.TRANSFER_FAILED, 'A transfer must carry at least one file.');
  }

  if (new Set(input.fileIds).size !== input.fileIds.length) {
    throw new AppError(ErrorCode.TRANSFER_FAILED, 'Transfer file ids must be unique.');
  }

  if (!Number.isInteger(input.totalPacketCount) || input.totalPacketCount < 0) {
    throw new AppError(
      ErrorCode.TRANSFER_FAILED,
      'Transfer totalPacketCount must be a non-negative integer.',
      { details: { totalPacketCount: input.totalPacketCount } },
    );
  }

  if (!Number.isFinite(input.startedAt) || input.startedAt < 0) {
    throw new AppError(
      ErrorCode.TRANSFER_FAILED,
      'Transfer startedAt must be a non-negative timestamp.',
      { details: { startedAt: input.startedAt } },
    );
  }

  return Object.freeze({
    id: input.id,
    sessionId: input.sessionId,
    direction: input.direction,
    fileIds: Object.freeze([...input.fileIds]),
    totalPacketCount: input.totalPacketCount,
    startedAt: input.startedAt,
  });
}

/** Creates a progress value. Completed packets are clamped to the total. */
export function createProgress(completedPackets: number, totalPackets: number): TransferProgress {
  if (!Number.isInteger(totalPackets) || totalPackets < 0) {
    throw new AppError(
      ErrorCode.TRANSFER_FAILED,
      'Progress totalPackets must be a non-negative integer.',
      { details: { totalPackets } },
    );
  }

  if (!Number.isInteger(completedPackets) || completedPackets < 0) {
    throw new AppError(
      ErrorCode.TRANSFER_FAILED,
      'Progress completedPackets must be a non-negative integer.',
      { details: { completedPackets } },
    );
  }

  return Object.freeze({
    completedPackets: Math.min(completedPackets, totalPackets),
    totalPackets,
  });
}

/**
 * Completion ratio between 0 and 1.
 *
 * A transfer with no packets is complete, not undefined — there is nothing
 * left to send.
 */
export function progressRatio(progress: TransferProgress): number {
  return progress.totalPackets === 0 ? 1 : progress.completedPackets / progress.totalPackets;
}

/**
 * Whether every expected packet is accounted for.
 *
 * Note this is *packet* completeness, not transfer completion: §3.24 requires
 * file integrity verification before a transfer is considered complete.
 */
export function isPacketComplete(progress: TransferProgress): boolean {
  return progress.completedPackets >= progress.totalPackets;
}

/** Structural equality. */
export function transferEquals(left: Transfer, right: Transfer): boolean {
  return (
    left.id === right.id &&
    left.sessionId === right.sessionId &&
    left.direction === right.direction &&
    left.totalPacketCount === right.totalPacketCount &&
    left.startedAt === right.startedAt &&
    left.fileIds.length === right.fileIds.length &&
    left.fileIds.every((id, index) => id === right.fileIds[index])
  );
}

/** Structural equality of progress. */
export function progressEquals(left: TransferProgress, right: TransferProgress): boolean {
  return (
    left.completedPackets === right.completedPackets && left.totalPackets === right.totalPackets
  );
}
