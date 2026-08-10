/**
 * services/ — Service layer
 *
 * Business behaviour composed from the core protocol, repositories and
 * adapters. Owns use cases, not protocol rules.
 *
 * Purpose, ownership, dependency rules and public exports: see ./README.md.
 * Interfaces are defined by docs/API_SPEC.md.
 */

export {
  createTransferService,
  type PreparedTransfer,
  type PrepareOptions,
  type SelectedFile,
  type TransferService,
  type TransferServiceOptions,
} from './transferService';

export {
  createReceiveService,
  FrameOutcome,
  type CompletedFile,
  type ReceiveProgress,
  type ReceiveService,
  type ReceiveServiceOptions,
  type ReceiveSession,
} from './receiveService';
