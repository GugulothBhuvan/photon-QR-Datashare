/**
 * RecoveryEngine (PRO-005) — PROTOCOL_SPEC §15.
 *
 * Detects and recovers from packet loss or corruption **while the session is
 * still active** (§15.1). That is the line between this engine and the resume
 * engine: resume restores protocol state after an interruption, recovery
 * restores missing packet data during a live transfer, and §15.12 makes them
 * independent — both may operate during the same transfer.
 *
 * The default strategy in OSP/1.0 is natural packet repetition (§15.6): the
 * sender loops, and eventually every packet is observed. That means recovery
 * here is mostly *detection and bookkeeping* rather than reconstruction — there
 * is no parity arithmetic to do, because forward error correction is explicitly
 * future work.
 *
 * What this engine does not do:
 *
 * - **No reconstruction.** §15.3 places reconstruction after recovery in the
 *   pipeline, and §15.9 has recovery terminate once every packet exists.
 *   Assembling a file is a later phase.
 * - **No transport.** §15.14.7 requires recovery to remain independent of the
 *   transport implementation. Nothing here knows a frame was dropped; it only
 *   knows a packet is absent.
 * - **No validation of its own.** §15.8 requires recovered packets to undergo
 *   exactly the same validation as normal ones, so this engine routes them
 *   through the PacketManager rather than duplicating the checks.
 */
import { invalid, valid, type ValidationOutcome } from '@core/validation';
import type { Logger } from '@core/contracts';
import type { ManifestManager } from '@core/manifest/manifestManager';
import { AcceptOutcome, type PacketManager } from '@core/packet/packetManager';
import type { SessionManager } from '@core/session/sessionManager';

import type { FileId, SessionId } from '@domain/ids';
import { PacketType, type Packet } from '@domain/packet';

/**
 * Recovery strategies (PROTOCOL_SPEC §15.6).
 *
 * Only natural repetition is part of OSP/1.0. The other two are named here
 * because the manifest carries a recovery method (§10.5) and a receiver must
 * be able to recognise a method it cannot perform, rather than silently
 * treating it as none.
 */
export const RecoveryStrategy = {
  /** §15.6 Strategy 1, the default: the sender loops until every packet lands. */
  NaturalRepetition: 'NATURAL_REPETITION',
  /** §15.6 Strategy 2: parity packets. OPTIONAL in OSP/1.0 and not implemented. */
  ForwardErrorCorrection: 'FORWARD_ERROR_CORRECTION',
  /** §15.6 Strategy 3: sender prioritises missing packets. Not part of OSP/1.0. */
  SelectiveRecovery: 'SELECTIVE_RECOVERY',
} as const;

export type RecoveryStrategy = (typeof RecoveryStrategy)[keyof typeof RecoveryStrategy];

/** Strategies this implementation can actually perform. */
export const SUPPORTED_STRATEGIES: readonly RecoveryStrategy[] = Object.freeze([
  RecoveryStrategy.NaturalRepetition,
]);

/**
 * Conditions recovery may or may not address (§15.4).
 *
 * The distinction matters: attempting recovery on a manifest corruption would
 * waste a session that should be terminated instead.
 */
export const RecoveryCondition = {
  MissingPacket: 'MISSING_PACKET',
  CorruptedPacket: 'CORRUPTED_PACKET',
  DroppedFrame: 'DROPPED_FRAME',
  CameraFrameLoss: 'CAMERA_FRAME_LOSS',
  LightingInterruption: 'LIGHTING_INTERRUPTION',
  ManifestCorruption: 'MANIFEST_CORRUPTION',
  SessionMismatch: 'SESSION_MISMATCH',
  VersionMismatch: 'VERSION_MISMATCH',
  InvalidEncryptionParameters: 'INVALID_ENCRYPTION_PARAMETERS',
} as const;

export type RecoveryCondition = (typeof RecoveryCondition)[keyof typeof RecoveryCondition];

/** Conditions §15.4 permits recovery for. */
const RECOVERABLE: ReadonlySet<RecoveryCondition> = new Set([
  RecoveryCondition.MissingPacket,
  RecoveryCondition.CorruptedPacket,
  RecoveryCondition.DroppedFrame,
  RecoveryCondition.CameraFrameLoss,
  RecoveryCondition.LightingInterruption,
]);

/** Why recovery was refused. */
export const RecoveryRefusal = {
  /** §15.14.9: recovery operates only within an active session. */
  SessionNotActive: 'SESSION_NOT_ACTIVE',
  /** The session is not known. */
  UnknownSession: 'UNKNOWN_SESSION',
  /** §15.5: detection compares the packet map against the manifest. */
  ManifestMissing: 'MANIFEST_MISSING',
  /** §15.4: the condition is not one recovery may address. */
  ConditionNotRecoverable: 'CONDITION_NOT_RECOVERABLE',
  /** §15.6: the manifest names a strategy this implementation cannot perform. */
  StrategyUnsupported: 'STRATEGY_UNSUPPORTED',
} as const;

export type RecoveryRefusal = (typeof RecoveryRefusal)[keyof typeof RecoveryRefusal];

export type RecoveryValidationResult = ValidationOutcome<RecoveryRefusal>;

/** Packets still absent for one file (§15.5). */
export interface FileGap {
  readonly fileId: FileId;
  readonly expectedPackets: number;
  /** Indices the manifest declares but the packet map lacks, ascending. */
  readonly missingIndices: readonly number[];
}

/** The outcome of comparing the packet map against the manifest (§15.5). */
export interface RecoveryStatus {
  readonly sessionId: SessionId;
  readonly gaps: readonly FileGap[];
  readonly missingPacketCount: number;
  /** Whether every required packet now exists (§15.9). */
  readonly complete: boolean;
  /** Whether any packet is still absent. */
  readonly recoveryNeeded: boolean;
  /** The strategy the manifest names, as this implementation understands it. */
  readonly strategy: RecoveryStrategy | undefined;
}

/** What happened to a packet offered as recovery. */
export const RecoveryAcceptOutcome = {
  /** The packet filled a gap and is now stored. */
  Recovered: 'RECOVERED',
  /** A valid copy already existed; the first one is retained (§15.11). */
  Duplicate: 'DUPLICATE',
  /** Failed validation and was discarded (§15.8). */
  Rejected: 'REJECTED',
  /** A recovery packet carrying parity, which OSP/1.0 cannot consume (§15.6). */
  Unusable: 'UNUSABLE',
} as const;

export type RecoveryAcceptOutcome =
  (typeof RecoveryAcceptOutcome)[keyof typeof RecoveryAcceptOutcome];

export interface RecoveryAcceptResult {
  readonly outcome: RecoveryAcceptOutcome;
  /** Whether every required packet now exists, so recovery may terminate (§15.9). */
  readonly complete: boolean;
}

export interface RecoveryEngineOptions {
  readonly sessions: SessionManager;
  readonly manifests: ManifestManager;
  readonly packets: PacketManager;
  readonly logger?: Logger;
}

export interface RecoveryEngine {
  /** Whether a condition is one recovery may address (§15.4). */
  isRecoverable(condition: RecoveryCondition): boolean;

  /**
   * Whether recovery may run for this session right now.
   *
   * §15.14.9 restricts recovery to an active session, and §15.5 needs a
   * manifest to compare against.
   */
  checkEligibility(id: SessionId): RecoveryValidationResult;

  /**
   * Compares the packet map against the manifest (§15.5).
   *
   * Only validated packets count as received, which follows from the packet
   * manager storing nothing that failed validation (§11.15).
   */
  detectMissing(id: SessionId): RecoveryStatus | undefined;

  /**
   * Offers a packet as recovery for a gap (§15.8, §15.11).
   *
   * Routed through the same validation as any other packet — recovered packets
   * SHALL NOT bypass protocol validation — and subject to the same duplicate
   * rule, so the first validated copy is retained.
   */
  acceptRecoveredPacket(
    packet: Packet,
    expectations: Parameters<PacketManager['accept']>[1],
  ): RecoveryAcceptResult;

  /** Whether every required packet exists, so recovery terminates (§15.9). */
  isComplete(id: SessionId): boolean;

  /** The strategy named by the session's manifest, if this implementation knows it. */
  strategyFor(id: SessionId): RecoveryStrategy | undefined;

  /** Whether this implementation can perform a strategy (§15.6). */
  supports(strategy: RecoveryStrategy): boolean;
}

const SILENT: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Maps a manifest's recovery method string onto a known strategy. */
function toStrategy(method: string): RecoveryStrategy | undefined {
  const known = Object.values(RecoveryStrategy).find((strategy) => strategy === method);
  return known;
}

/** Creates a recovery engine. */
export function createRecoveryEngine(options: RecoveryEngineOptions): RecoveryEngine {
  const { sessions, manifests, packets } = options;
  const logger = options.logger ?? SILENT;

  function buildStatus(id: SessionId): RecoveryStatus | undefined {
    const manifest = manifests.getManifest(id);

    if (manifest === undefined) {
      return undefined;
    }

    const gaps: FileGap[] = manifest.entries.map((entry) => {
      const missing = packets.missingIndices(id, entry.file.id, entry.packetCount);

      return Object.freeze({
        fileId: entry.file.id,
        expectedPackets: entry.packetCount,
        missingIndices: Object.freeze(missing),
      });
    });

    const missingPacketCount = gaps.reduce((total, gap) => total + gap.missingIndices.length, 0);

    return Object.freeze({
      sessionId: id,
      // Only files that are still short are worth reporting as gaps.
      gaps: Object.freeze(gaps.filter((gap) => gap.missingIndices.length > 0)),
      missingPacketCount,
      complete: missingPacketCount === 0,
      recoveryNeeded: missingPacketCount > 0,
      strategy: toStrategy(manifest.configuration.recoveryMethod),
    });
  }

  const engine: RecoveryEngine = {
    isRecoverable(condition) {
      return RECOVERABLE.has(condition);
    },

    checkEligibility(id) {
      const refusals: RecoveryRefusal[] = [];
      const session = sessions.getSession(id);

      if (session === undefined) {
        return invalid([RecoveryRefusal.UnknownSession]);
      }

      // §15.14.9: recovery operates only within an active session. §15.1 draws
      // the same line — recovery runs while the session remains active,
      // whereas resume acts on one that is paused.
      if (!sessions.isSessionActive(id)) {
        refusals.push(RecoveryRefusal.SessionNotActive);
      }

      const manifest = manifests.getManifest(id);

      if (manifest === undefined) {
        refusals.push(RecoveryRefusal.ManifestMissing);
        return invalid(refusals);
      }

      // §15.6: a manifest naming a strategy this implementation cannot perform
      // must be reported rather than silently treated as no recovery.
      const strategy = toStrategy(manifest.configuration.recoveryMethod);

      if (strategy !== undefined && !SUPPORTED_STRATEGIES.includes(strategy)) {
        refusals.push(RecoveryRefusal.StrategyUnsupported);
      }

      return refusals.length === 0 ? valid<RecoveryRefusal>() : invalid([...new Set(refusals)]);
    },

    detectMissing(id) {
      return buildStatus(id);
    },

    acceptRecoveredPacket(packet, expectations) {
      // §15.7: a recovery packet contains recovery information and SHALL never
      // replace an original data packet. OSP/1.0 implements only natural
      // repetition (§15.6), so parity carried by a recovery packet cannot be
      // consumed — it is reported rather than stored, which keeps it from
      // occupying a data packet's position.
      if (packet.type === PacketType.Recovery) {
        logger.debug('Recovery packet ignored: no forward error correction in OSP/1.0', {
          sessionId: packet.sessionId,
          index: packet.index,
        });

        return {
          outcome: RecoveryAcceptOutcome.Unusable,
          complete: engine.isComplete(packet.sessionId),
        };
      }

      // §15.8: recovered packets undergo exactly the same validation, and
      // §15.11 has them participate in duplicate detection. Routing through
      // the packet manager is what guarantees both.
      const result = packets.accept(packet, expectations);

      const outcome =
        result.outcome === AcceptOutcome.Stored
          ? RecoveryAcceptOutcome.Recovered
          : result.outcome === AcceptOutcome.Duplicate
            ? RecoveryAcceptOutcome.Duplicate
            : RecoveryAcceptOutcome.Rejected;

      return { outcome, complete: engine.isComplete(packet.sessionId) };
    },

    isComplete(id) {
      // §15.9: recovery completes when every required packet exists. A session
      // with no manifest cannot be complete, because nothing declares what is
      // required.
      return buildStatus(id)?.complete ?? false;
    },

    strategyFor(id) {
      const manifest = manifests.getManifest(id);
      return manifest === undefined ? undefined : toStrategy(manifest.configuration.recoveryMethod);
    },

    supports(strategy) {
      return SUPPORTED_STRATEGIES.includes(strategy);
    },
  };

  return engine;
}
