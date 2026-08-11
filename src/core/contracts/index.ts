/**
 * contracts/ — The interfaces the protocol engine depends on
 *
 * Everything the engine needs from outside itself is declared here as an
 * interface, and supplied by the composition root. Nothing in `src/core`
 * imports a concrete implementation of any of these.
 *
 * Two reasons this matters:
 *
 * 1. **Determinism.** A clock and a random identifier are the two things that
 *    would make protocol behaviour irreproducible (PROTOCOL_SPEC §2.4). As
 *    contracts, a test supplies a controllable clock and a counting generator,
 *    and every run is identical.
 *
 * 2. **Layer independence.** `PacketCodec` is the seam between Protocol and
 *    Binary; `IntegrityVerifier` is the seam to whatever computes a digest.
 *    Declaring both here means the protocol engine names no module below it,
 *    so the engine compiles and is tested with neither present.
 *
 * Contracts declare *what* is needed, never *how*. There is no implementation
 * in this directory — implementations live in the layers that own the
 * mechanism, and are injected.
 */

export type { Clock } from './clock';
export type { IdGenerator } from './idGenerator';
export type { IntegrityVerifier } from './integrityVerifier';
export type { Logger, LogContext, ProtocolLogger } from './logger';
export type { PacketCodec, DecodedPacket } from './packetCodec';
export type {
  PayloadCipher,
  DecryptResult,
  DecryptSuccess,
  DecryptRejection,
} from './payloadCipher';
export { DecryptFailure } from './payloadCipher';
