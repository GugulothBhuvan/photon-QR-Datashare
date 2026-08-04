/**
 * reconstruction/ — File reconstruction (Phase 7)
 *
 * Implements docs/PROTOCOL_SPEC.md §13.11–§13.17 and §3.24: the packet map,
 * ordered reassembly, and file integrity verification.
 *
 * Deterministic and transport-agnostic. The integrity algorithm is injected,
 * so this layer never implements cryptography.
 */

export {
  createPacketMap,
  PacketState,
  type PacketMap,
  type PacketMapEntry,
  type PacketMapSnapshot,
} from './packetMap';

export {
  buildFile,
  BuildFailure,
  type BuildOptions,
  type BuildRejected,
  type BuildResult,
  type BuildSuccess,
} from './fileBuilder';

export {
  IntegrityFailure,
  verifyFile,
  type IntegrityResult,
  type VerifyFileOptions,
} from './integrityChecker';
