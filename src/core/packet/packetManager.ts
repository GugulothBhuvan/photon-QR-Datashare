/**
 * PacketManager (PRO-003) — PROTOCOL_SPEC §11; docs/API_SPEC.md §7.
 *
 * Coordinates the packet lifecycle at the *protocol* level: dividing a binary
 * stream into packets (§11.2), validating an arriving packet against what the
 * session and manifest expect (§11.12), rejecting duplicates (§11.13) and
 * corrupted packets (§11.15), and tracking ordering and completeness (§11.10,
 * §11.14).
 *
 * The layer separation is deliberate and must not collapse:
 *
 * ```text
 * Domain    @domain/packet     what a packet is
 *   ↓
 * Protocol  this module        what may be done with one
 *   ↓
 * Binary    @core/packet/*     how one is laid out in bytes
 *   ↓
 * Transport (later phases)     how bytes reach the other device
 * ```
 *
 * So this module contains **no byte manipulation**: no offsets, no CRC, no
 * endianness. `serialize` and `deserialize` exist because docs/API_SPEC.md §7
 * puts them on this interface, but they are one-line delegations to an
 * injected codec — the manager coordinates the binary layer, it does not
 * implement it. Every other method touches only domain objects.
 *
 * It also does not render QR codes, read a camera, manage sessions, or
 * reconstruct files.
 */
import { invalid, valid, type ValidationOutcome } from '@core/validation';
import { NO_FILE, type PacketRegistry } from '@core/registry/packetRegistry';
import { createPacketRegistry } from '@core/registry/packetRegistry';

import { createPacket, PacketType, type Packet } from '@domain/packet';
import type { FileId, SessionId } from '@domain/ids';

/** Why a packet was rejected at the protocol level (§11.15). */
export const PacketProtocolRejection = {
  /** §11.12.4, §11.5: the packet names a different session. */
  ForeignSession: 'FOREIGN_SESSION',
  /** §11.12.5: integrity verification did not succeed. */
  IntegrityFailed: 'INTEGRITY_FAILED',
  /** §11.12.6, §11.9: payload longer than the negotiated packet size. */
  BadPayloadLength: 'BAD_PAYLOAD_LENGTH',
  /** §11.10: index negative, or beyond what the manifest declares. */
  BadPacketIndex: 'BAD_PACKET_INDEX',
  /** §11.5: a data packet naming no file. */
  MissingFile: 'MISSING_FILE',
  /** §11.14: the manifest describes no such file. */
  UnknownFile: 'UNKNOWN_FILE',
} as const;

export type PacketProtocolRejection =
  (typeof PacketProtocolRejection)[keyof typeof PacketProtocolRejection];

export type PacketValidationResult = ValidationOutcome<PacketProtocolRejection>;

/** What happened when a packet was offered to the manager. */
export const AcceptOutcome = {
  /** First valid copy; it is now stored (§11.12.8). */
  Stored: 'STORED',
  /** A valid copy was already stored; ignored without overwriting (§11.13). */
  Duplicate: 'DUPLICATE',
  /** Failed validation; discarded and not stored (§11.15). */
  Rejected: 'REJECTED',
} as const;

export type AcceptOutcome = (typeof AcceptOutcome)[keyof typeof AcceptOutcome];

export interface AcceptResult {
  readonly outcome: AcceptOutcome;
  readonly validation: PacketValidationResult;
}

/**
 * What the receiver expects of an arriving packet.
 *
 * Everything here comes from the session and the manifest — the manager asks
 * neither of them directly, because it manages neither.
 */
export interface PacketExpectations {
  /** Session being collected for. A packet naming another is foreign (§11.5, §8.11). */
  readonly sessionId: SessionId;
  /**
   * Whether integrity verification already succeeded (§11.12.5, §11.13).
   *
   * Supplied by the binary layer, which is where the checksum lives. Required
   * rather than optional so it cannot be skipped by omitting an option.
   */
  readonly integrityVerified: boolean;
  /** Negotiated payload size (§11.9). A longer payload is invalid. */
  readonly packetSize?: number;
  /**
   * Packets the manifest declares for each file, keyed by file id.
   *
   * When given, an index at or beyond a file's count is invalid, and a packet
   * for an unlisted file is rejected (§11.14).
   */
  readonly expectedCounts?: Readonly<Record<string, number>>;
}

export interface PacketizeInput {
  readonly sessionId: SessionId;
  readonly fileId: FileId;
  /** The file's binary stream (§3.9). */
  readonly stream: Uint8Array;
  /** Negotiated payload size (§11.9). */
  readonly packetSize: number;
  readonly type?: PacketType;
}

/** Optional codec, so the manager can satisfy API_SPEC §7 without owning bytes. */
export interface PacketCodec {
  serialize(packet: Packet): Uint8Array;
  deserialize(bytes: Uint8Array): Packet | undefined;
}

export interface PacketManagerOptions {
  /** Where validated packets are held. Defaults to a fresh in-memory registry. */
  readonly registry?: PacketRegistry;
  /**
   * Binary codec, injected from the layer below.
   *
   * Absent by default: the manager works entirely on domain objects, and only
   * `serialize`/`deserialize` need it.
   */
  readonly codec?: PacketCodec;
}

export interface PacketManager {
  /**
   * Divides a binary stream into packets (§11.2, API_SPEC §7).
   *
   * Every packet carries the negotiated payload size except the last, which
   * may be shorter (§11.9). Indices are zero-based and contiguous (§11.10).
   */
  packetize(input: PacketizeInput): readonly Packet[];

  /** Validates a packet against the receiver's expectations (§11.12). */
  validatePacket(packet: Packet, expectations: PacketExpectations): PacketValidationResult;

  /**
   * Validates a packet and stores it if it is the first valid copy.
   *
   * Implements §11.12 steps 3–8 at the protocol level: corrupted packets are
   * discarded and not stored (§11.15), duplicates are ignored without
   * overwriting (§11.13), and only validated packets are stored (§11.12.8).
   */
  accept(packet: Packet, expectations: PacketExpectations): AcceptResult;

  /** Whether a packet has already been stored at this position (§11.13). */
  isDuplicate(packet: Packet): boolean;

  /** Stored packets for a file, ordered by index (§11.10, §11.18). */
  orderedPackets(session: SessionId, file: FileId): readonly Packet[];

  /** Indices stored for a file, ascending. */
  storedIndices(session: SessionId, file: FileId): readonly number[];

  /**
   * Indices the manifest expects but which have not been validated (§11.14).
   *
   * @param expectedCount Packets the manifest declares for the file.
   */
  missingIndices(session: SessionId, file: FileId, expectedCount: number): readonly number[];

  /** Whether every declared packet for a file has been stored (§11.14). */
  isFileComplete(session: SessionId, file: FileId, expectedCount: number): boolean;

  /** How many packets are stored for a file. */
  storedCount(session: SessionId, file: FileId): number;

  /** Discards every packet held for a session (§11.19). */
  releaseSession(session: SessionId): number;

  /** Discards every packet held for a file. */
  releaseFile(session: SessionId, file: FileId): number;

  /** Serializes a packet by delegating to the injected codec (API_SPEC §7). */
  serialize(packet: Packet): Uint8Array;

  /** Parses a packet by delegating to the injected codec (API_SPEC §7). */
  deserialize(bytes: Uint8Array): Packet | undefined;
}

/** Thrown when a codec-dependent method is used without a codec. */
function requireCodec(codec: PacketCodec | undefined): PacketCodec {
  if (codec === undefined) {
    throw new Error(
      'PacketManager was constructed without a codec; serialize and deserialize are unavailable.',
    );
  }
  return codec;
}

/**
 * Creates a packet manager.
 *
 * Deterministic and transport-agnostic: no clock, no randomness, no I/O.
 */
export function createPacketManager(options: PacketManagerOptions = {}): PacketManager {
  const registry = options.registry ?? createPacketRegistry();
  const { codec } = options;

  const manager: PacketManager = {
    packetize(input) {
      const { stream, packetSize, sessionId, fileId } = input;

      if (!Number.isInteger(packetSize) || packetSize <= 0) {
        throw new Error('Packet size must be a positive integer.');
      }

      const packets: Packet[] = [];

      // A zero-byte file yields no packets: there is nothing to carry, and
      // §3.8 admits any byte sequence as a file.
      for (
        let offset = 0, index = 0;
        offset < stream.byteLength;
        offset += packetSize, index += 1
      ) {
        packets.push(
          createPacket({
            sessionId,
            fileId,
            index,
            // The final packet may be shorter than the negotiated size (§11.9).
            payload: stream.subarray(offset, Math.min(offset + packetSize, stream.byteLength)),
            ...(input.type === undefined ? {} : { type: input.type }),
          }),
        );
      }

      return Object.freeze(packets);
    },

    validatePacket(packet, expectations) {
      const rejections: PacketProtocolRejection[] = [];

      // §11.12.4 — Session ID. §8.11 makes cross-session mixing a violation.
      if (packet.sessionId !== expectations.sessionId) {
        rejections.push(PacketProtocolRejection.ForeignSession);
      }

      // §11.12.5 — Packet Integrity, verified by the binary layer.
      if (!expectations.integrityVerified) {
        rejections.push(PacketProtocolRejection.IntegrityFailed);
      }

      // §11.12.6 — Payload Length. §11.9 allows a shorter final packet but
      // never a longer one.
      if (expectations.packetSize !== undefined && packet.size > expectations.packetSize) {
        rejections.push(PacketProtocolRejection.BadPayloadLength);
      }

      // §11.5 — a data packet belongs to exactly one file.
      if (packet.type === PacketType.Data && packet.fileId === undefined) {
        rejections.push(PacketProtocolRejection.MissingFile);
      }

      // §11.10 — zero-based index, within what the manifest declares (§11.14).
      if (!Number.isInteger(packet.index) || packet.index < 0) {
        rejections.push(PacketProtocolRejection.BadPacketIndex);
      } else if (expectations.expectedCounts !== undefined && packet.fileId !== undefined) {
        const expected = expectations.expectedCounts[packet.fileId];

        if (expected === undefined) {
          rejections.push(PacketProtocolRejection.UnknownFile);
        } else if (packet.index >= expected) {
          rejections.push(PacketProtocolRejection.BadPacketIndex);
        }
      }

      return rejections.length === 0
        ? valid<PacketProtocolRejection>()
        : invalid([...new Set(rejections)]);
    },

    accept(packet, expectations) {
      const validation = manager.validatePacket(packet, expectations);

      // §11.15: corrupted packets are discarded immediately and SHALL NOT be
      // stored.
      if (!validation.valid) {
        return { outcome: AcceptOutcome.Rejected, validation };
      }

      // §11.13: a duplicate is ignored after the first valid copy is stored,
      // and never overwrites it. The registry refuses the write, which is what
      // makes that guarantee structural rather than a convention.
      const stored = registry.store(packet);

      return {
        outcome: stored ? AcceptOutcome.Stored : AcceptOutcome.Duplicate,
        validation,
      };
    },

    isDuplicate(packet) {
      return registry.has(packet.sessionId, packet.fileId ?? NO_FILE, packet.index);
    },

    orderedPackets(session, file) {
      return registry.ordered(session, file);
    },

    storedIndices(session, file) {
      return registry.indices(session, file);
    },

    missingIndices(session, file, expectedCount) {
      const present = new Set(registry.indices(session, file));
      const missing: number[] = [];

      for (let index = 0; index < expectedCount; index += 1) {
        if (!present.has(index)) {
          missing.push(index);
        }
      }

      return missing;
    },

    isFileComplete(session, file, expectedCount) {
      return manager.missingIndices(session, file, expectedCount).length === 0;
    },

    storedCount(session, file) {
      return registry.count(session, file);
    },

    releaseSession(session) {
      return registry.releaseSession(session);
    },

    releaseFile(session, file) {
      return registry.releaseFile(session, file);
    },

    serialize(packet) {
      return requireCodec(codec).serialize(packet);
    },

    deserialize(bytes) {
      return requireCodec(codec).deserialize(bytes);
    },
  };

  return manager;
}
