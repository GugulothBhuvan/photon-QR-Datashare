/**
 * Transfer model (MOD-004) — PROTOCOL_SPEC §3.18, §3.19; API_SPEC §13.
 */
import { fileId, sessionId, transferId } from '@domain/ids';
import {
  createProgress,
  createTransfer,
  isPacketComplete,
  progressEquals,
  progressRatio,
  transferEquals,
  TransferDirection,
} from '@domain/transfer';
import { AppError } from '@core/errors';

const baseInput = {
  id: transferId('aa000000-0000-4000-8000-000000000001'),
  sessionId: sessionId('11111111-1111-4111-8111-111111111111'),
  direction: TransferDirection.Send,
  fileIds: [
    fileId('f1000000-0000-4000-8000-000000000001'),
    fileId('f1000000-0000-4000-8000-000000000002'),
  ],
  totalPacketCount: 7,
  startedAt: 1_700_000_000_000,
};

describe('createTransfer', () => {
  it('keeps every supplied field', () => {
    const transfer = createTransfer(baseInput);

    expect(transfer.id).toBe('aa000000-0000-4000-8000-000000000001');
    expect(transfer.direction).toBe(TransferDirection.Send);
    expect(transfer.totalPacketCount).toBe(7);
  });

  it('occurs within exactly one session (§8.1)', () => {
    expect(createTransfer(baseInput).sessionId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('is frozen, file list included', () => {
    const transfer = createTransfer(baseInput);

    expect(Object.isFrozen(transfer)).toBe(true);
    expect(Object.isFrozen(transfer.fileIds)).toBe(true);
  });

  it('copies the file list so the caller cannot alter it afterwards', () => {
    const fileIds = [fileId('f1000000-0000-4000-8000-000000000001')];
    const transfer = createTransfer({ ...baseInput, fileIds });

    fileIds.push(fileId('f1000000-0000-4000-8000-000000000009'));

    expect(transfer.fileIds).toHaveLength(1);
  });

  it('carries multiple files in one session (§3.19)', () => {
    expect(createTransfer(baseInput).fileIds).toHaveLength(2);
  });

  it.each([
    ['no files', { fileIds: [] }],
    [
      'duplicate files',
      {
        fileIds: [
          fileId('f1000000-0000-4000-8000-000000000001'),
          fileId('f1000000-0000-4000-8000-000000000001'),
        ],
      },
    ],
    ['a negative packet count', { totalPacketCount: -1 }],
    ['a fractional packet count', { totalPacketCount: 1.5 }],
    ['a negative start time', { startedAt: -1 }],
  ])('rejects %s', (_label, change) => {
    expect(() => createTransfer({ ...baseInput, ...change })).toThrow(AppError);
  });
});

describe('createProgress', () => {
  it('records completed and total packets', () => {
    const progress = createProgress(3, 10);

    expect(progress.completedPackets).toBe(3);
    expect(progress.totalPackets).toBe(10);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(createProgress(3, 10))).toBe(true);
  });

  it('clamps completed packets to the total', () => {
    expect(createProgress(15, 10).completedPackets).toBe(10);
  });

  it.each([
    [-1, 10],
    [1, -10],
    [1.5, 10],
  ])('rejects (%p, %p)', (completed, total) => {
    expect(() => createProgress(completed, total)).toThrow(AppError);
  });
});

describe('progressRatio', () => {
  it.each([
    [0, 10, 0],
    [5, 10, 0.5],
    [10, 10, 1],
  ])('reports %p of %p as %p', (completed, total, expected) => {
    expect(progressRatio(createProgress(completed, total))).toBe(expected);
  });

  it('treats an empty transfer as complete rather than undefined', () => {
    expect(progressRatio(createProgress(0, 0))).toBe(1);
  });
});

describe('isPacketComplete', () => {
  it('is true once every expected packet is accounted for', () => {
    expect(isPacketComplete(createProgress(10, 10))).toBe(true);
    expect(isPacketComplete(createProgress(9, 10))).toBe(false);
  });

  it('reports packet completeness, not transfer completion (§3.24)', () => {
    // File integrity verification still has to pass before a transfer is
    // complete; this value knows nothing about that.
    expect(isPacketComplete(createProgress(10, 10))).toBe(true);
  });
});

describe('equality helpers', () => {
  it('compare transfers structurally', () => {
    expect(transferEquals(createTransfer(baseInput), createTransfer(baseInput))).toBe(true);
  });

  it.each([
    ['id', { id: transferId('aa000000-0000-4000-8000-000000000002') }],
    ['sessionId', { sessionId: sessionId('22222222-2222-4222-8222-222222222222') }],
    ['direction', { direction: TransferDirection.Receive }],
    ['totalPacketCount', { totalPacketCount: 8 }],
    ['startedAt', { startedAt: 1 }],
    ['fileIds', { fileIds: [fileId('f1000000-0000-4000-8000-000000000001')] }],
  ])('detect a difference in %s', (_label, change) => {
    expect(
      transferEquals(createTransfer(baseInput), createTransfer({ ...baseInput, ...change })),
    ).toBe(false);
  });

  it('compare progress structurally', () => {
    expect(progressEquals(createProgress(1, 2), createProgress(1, 2))).toBe(true);
    expect(progressEquals(createProgress(1, 2), createProgress(2, 2))).toBe(false);
  });
});
