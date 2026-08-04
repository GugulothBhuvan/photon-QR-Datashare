/**
 * ResumeEngine (PRO-004) — PROTOCOL_SPEC §14.
 *
 * Continues an interrupted transfer instead of restarting it: checks whether a
 * session is resumable (§14.4), validates the resume request (§14.7),
 * determines what work remains (§14.8), and restores protocol state (§14.2).
 *
 * Four things it deliberately does not do:
 *
 * - **No recovery.** §14.9 mentions recovery packets in passing; the Recovery
 *   Protocol is §15 and belongs to PRO-005. Nothing here reconstructs a
 *   missing packet — it only reports which are missing.
 * - **No reconstruction.** §14.11 is explicit that reconstruction begins only
 *   when every required packet is collected, and it is a separate concern.
 *   This engine reports completeness; it never assembles a file.
 * - **No transport or camera.** §14.1 lists camera movement and lighting as
 *   *causes* of interruption, not as things the protocol handles. The engine
 *   is transport-agnostic.
 * - **No serialization.** It works on domain objects throughout.
 *
 * The engine holds no state of its own. It reads the session, manifest and
 * packet managers it is given and returns a decision, which keeps resume
 * deterministic (§14.16: reconstruction remains deterministic) and makes every
 * outcome reproducible from its inputs.
 */
import { invalid, valid, type ValidationOutcome } from '@core/validation';
import type { Clock, Logger } from '@core/contracts';
import type { ManifestManager } from '@core/manifest/manifestManager';
import type { PacketManager } from '@core/packet/packetManager';
import type { SessionManager } from '@core/session/sessionManager';
import { isInterrupted, isTerminal } from '@core/session/transitions';

import type { FileId, ProtocolVersion, SessionId } from '@domain/ids';
import type { Manifest } from '@domain/manifest';
import { SessionState, type Session } from '@domain/session';

/**
 * Why a resume was refused.
 *
 * One code per condition in §14.4's prohibitions and §14.13's failure list.
 */
export const ResumeRefusal = {
  /** §14.4, §14.13: the session no longer exists. */
  UnknownSession: 'UNKNOWN_SESSION',
  /** §14.4, §14.12, §14.13: the session expired before resume. */
  SessionExpired: 'SESSION_EXPIRED',
  /** §14.4: the session is not in a state a resume can act on. */
  SessionNotResumable: 'SESSION_NOT_RESUMABLE',
  /** §14.4, §14.7.3: no validated manifest is held for the session. */
  ManifestMissing: 'MANIFEST_MISSING',
  /** §14.7.3, §14.13: the manifest does not match the session. */
  ManifestMismatch: 'MANIFEST_MISMATCH',
  /** §14.4, §14.7.2, §14.13: the protocol version is no longer compatible. */
  VersionMismatch: 'VERSION_MISMATCH',
  /** §14.7.4, §14.13: the packet map holds packets the manifest cannot explain. */
  PacketMapCorrupt: 'PACKET_MAP_CORRUPT',
  /** §14.4: the transfer already finished; there is nothing to resume. */
  AlreadyComplete: 'ALREADY_COMPLETE',
} as const;

export type ResumeRefusal = (typeof ResumeRefusal)[keyof typeof ResumeRefusal];

export type ResumeValidationResult = ValidationOutcome<ResumeRefusal>;

/** What remains to be collected for one file (§14.8, §14.14). */
export interface FileRemainder {
  readonly fileId: FileId;
  /** Packets the manifest declares for this file. */
  readonly expectedPackets: number;
  /** Packets already validated and stored. */
  readonly storedPackets: number;
  /** Indices still required, ascending (§14.8). */
  readonly missingIndices: readonly number[];
  /** Whether this file needs nothing further (§14.14). */
  readonly complete: boolean;
}

/**
 * The work an interrupted transfer still has to do (§14.8).
 *
 * Per file, because §14.14 requires the packet map to be preserved
 * independently for every file and only incomplete files to continue receiving.
 */
export interface RemainingWork {
  readonly sessionId: SessionId;
  readonly files: readonly FileRemainder[];
  /** Total indices still required across every file. */
  readonly missingPacketCount: number;
  /** Files that still need packets (§14.14). */
  readonly incompleteFiles: readonly FileId[];
  /** Whether every declared packet has been collected. */
  readonly complete: boolean;
}

/** Security and protocol parameters that SHALL NOT change during resume (§14.15). */
export interface PreservedParameters {
  readonly sessionId: SessionId;
  readonly protocolVersion: ProtocolVersion;
  readonly integrityAlgorithm: string;
  /** Compression and encryption per file, keyed by file id. */
  readonly perFileAlgorithms: Readonly<Record<string, { compression: string; encryption: string }>>;
}

/** A resume that was permitted, with everything the caller needs to continue. */
export interface ResumeAccepted {
  readonly ok: true;
  readonly session: Session;
  readonly manifest: Manifest;
  readonly remaining: RemainingWork;
  readonly preserved: PreservedParameters;
}

/** A resume that was refused, with every reason. */
export interface ResumeRejected {
  readonly ok: false;
  readonly validation: ResumeValidationResult;
}

export type ResumeResult = ResumeAccepted | ResumeRejected;

export interface ResumeEngineOptions {
  readonly sessions: SessionManager;
  readonly manifests: ManifestManager;
  readonly packets: PacketManager;
  /** Protocol versions still compatible for resume (§14.4). Defaults to the session's own. */
  readonly supportedVersions?: readonly number[];
  /** Optional diagnostics. Never receives payload bytes. */
  readonly logger?: Logger;
  /** Present for symmetry with the other managers; resume reads no clock of its own. */
  readonly clock?: Clock;
}

export interface ResumeEngine {
  /**
   * Whether a session could be resumed right now (§14.4).
   *
   * Reports every reason it could not, rather than a bare boolean, so a caller
   * can tell an expired session from one that was never paused.
   */
  checkEligibility(id: SessionId): ResumeValidationResult;

  /** The work an interrupted transfer still has to do (§14.8, §14.14). */
  determineRemainingWork(id: SessionId): RemainingWork | undefined;

  /**
   * Performs a resume request (§14.7).
   *
   * Verifies session id, protocol version, manifest consistency and packet map
   * integrity, then moves the session `Paused → Resuming`. On failure the
   * session is terminated, as §14.7 and §14.13 require.
   */
  requestResume(id: SessionId): ResumeResult;

  /**
   * Completes a resume, returning the session to `Active` (§14.3).
   *
   * Separate from `requestResume` because §14.3 has validation and
   * continuation as distinct steps, and a caller may need to prepare between
   * them.
   */
  completeResume(id: SessionId): ResumeResult;

  /** Pauses a live transfer, preserving everything §14.5 lists. */
  pause(id: SessionId): boolean;
}

/** A logger that discards everything, so diagnostics are never required. */
const SILENT: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Creates a resume engine. */
export function createResumeEngine(options: ResumeEngineOptions): ResumeEngine {
  const { sessions, manifests, packets } = options;
  const logger = options.logger ?? SILENT;

  /**
   * Collects every reason a session cannot be resumed.
   *
   * Runs all checks rather than stopping at the first, matching the validators
   * elsewhere in the engine.
   */
  function evaluate(id: SessionId): {
    readonly refusals: readonly ResumeRefusal[];
    readonly session: Session | undefined;
    readonly manifest: Manifest | undefined;
  } {
    const refusals: ResumeRefusal[] = [];
    const session = sessions.getSession(id);

    if (session === undefined) {
      return { refusals: [ResumeRefusal.UnknownSession], session: undefined, manifest: undefined };
    }

    // §14.4, §14.12: resume is not permitted after session expiration.
    if (session.state === SessionState.Expired) {
      refusals.push(ResumeRefusal.SessionExpired);
    } else if (session.state === SessionState.Completed) {
      refusals.push(ResumeRefusal.AlreadyComplete);
    } else if (!isInterrupted(session.state) && session.state !== SessionState.Resuming) {
      // §14.3: resume acts on a paused transfer. A session still Active, or one
      // that never reached Active, has nothing to resume.
      refusals.push(ResumeRefusal.SessionNotResumable);
    }

    // §14.4, §14.7.3: the manifest must already have been validated.
    const manifest = manifests.getManifest(id);

    if (manifest === undefined) {
      refusals.push(ResumeRefusal.ManifestMissing);
      return { refusals, session, manifest: undefined };
    }

    // §14.7.1: the manifest must belong to this session.
    if (manifest.sessionId !== session.id) {
      refusals.push(ResumeRefusal.ManifestMismatch);
    }

    // §14.4, §14.7.2: the protocol version must remain compatible, and §14.15
    // forbids it changing during resume.
    const supported = options.supportedVersions;

    if (manifest.protocolVersion !== session.protocolVersion) {
      refusals.push(ResumeRefusal.VersionMismatch);
    } else if (supported !== undefined && !supported.includes(session.protocolVersion)) {
      refusals.push(ResumeRefusal.VersionMismatch);
    }

    // §14.7.4: packet map integrity. A stored packet the manifest cannot
    // explain — an unknown file, or an index beyond the declared count — means
    // the map and the manifest have diverged.
    if (!packetMapAgrees(manifest, id)) {
      refusals.push(ResumeRefusal.PacketMapCorrupt);
    }

    return { refusals, session, manifest };
  }

  /** Whether every stored packet is one the manifest accounts for (§14.7.4). */
  function packetMapAgrees(manifest: Manifest, id: SessionId): boolean {
    const declared = new Map(
      manifest.entries.map((entry) => [entry.file.id as string, entry.packetCount]),
    );

    for (const entry of manifest.entries) {
      const stored = packets.storedIndices(id, entry.file.id);

      if (stored.some((index) => index >= entry.packetCount)) {
        return false;
      }
    }

    // A file holding packets that the manifest does not describe is corruption
    // of the map, not merely an unexpected packet.
    return manifestCoversStoredFiles(declared, id);
  }

  function manifestCoversStoredFiles(
    declared: ReadonlyMap<string, number>,
    id: SessionId,
  ): boolean {
    for (const file of storedFilesOf(id, declared)) {
      if (!declared.has(file)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Files holding packets for a session.
   *
   * The packet manager exposes counts per file rather than a file list, so
   * this asks about the files the manifest declares plus nothing else — which
   * is sufficient, because a file absent from the manifest can only have been
   * stored by bypassing validation.
   */
  function storedFilesOf(id: SessionId, declared: ReadonlyMap<string, number>): readonly string[] {
    return [...declared.keys()].filter((file) => packets.storedCount(id, file as FileId) > 0);
  }

  function buildRemainingWork(manifest: Manifest, id: SessionId): RemainingWork {
    const files: FileRemainder[] = manifest.entries.map((entry) => {
      const missing = packets.missingIndices(id, entry.file.id, entry.packetCount);

      return Object.freeze({
        fileId: entry.file.id,
        expectedPackets: entry.packetCount,
        storedPackets: packets.storedCount(id, entry.file.id),
        missingIndices: Object.freeze(missing),
        complete: missing.length === 0,
      });
    });

    const incomplete = files.filter((file) => !file.complete);

    return Object.freeze({
      sessionId: id,
      files: Object.freeze(files),
      missingPacketCount: files.reduce((total, file) => total + file.missingIndices.length, 0),
      // §14.14: only incomplete files continue receiving packets.
      incompleteFiles: Object.freeze(incomplete.map((file) => file.fileId)),
      complete: incomplete.length === 0,
    });
  }

  /** Parameters §14.15 forbids changing during resume. */
  function preservedParameters(session: Session, manifest: Manifest): PreservedParameters {
    return Object.freeze({
      sessionId: session.id,
      protocolVersion: session.protocolVersion,
      integrityAlgorithm: manifest.configuration.integrityAlgorithm,
      perFileAlgorithms: Object.freeze(
        Object.fromEntries(
          manifest.entries.map((entry) => [
            entry.file.id as string,
            Object.freeze({ compression: entry.compression, encryption: entry.encryption }),
          ]),
        ),
      ),
    });
  }

  const engine: ResumeEngine = {
    checkEligibility(id) {
      const { refusals } = evaluate(id);
      return refusals.length === 0 ? valid<ResumeRefusal>() : invalid([...new Set(refusals)]);
    },

    determineRemainingWork(id) {
      const manifest = manifests.getManifest(id);
      return manifest === undefined ? undefined : buildRemainingWork(manifest, id);
    },

    requestResume(id) {
      const { refusals, session, manifest } = evaluate(id);

      if (refusals.length > 0 || session === undefined || manifest === undefined) {
        // §14.7: if validation fails, the session SHALL terminate. §14.13
        // additionally requires temporary packet storage to be released.
        if (session !== undefined && !isTerminal(session.state)) {
          sessions.closeSession(id);
          packets.releaseSession(id);
        }

        logger.warn('Resume refused', { sessionId: id, reasons: refusals });

        return { ok: false, validation: invalid([...new Set(refusals)]) };
      }

      // §14.7: a resume request transitions Paused → Resuming. A session
      // already Resuming stays where it is; the request is idempotent.
      if (session.state === SessionState.Paused) {
        const moved = sessions.transition(id, SessionState.Resuming);

        if (!moved.ok) {
          return { ok: false, validation: invalid([ResumeRefusal.SessionNotResumable]) };
        }
      }

      const current = sessions.getSession(id) ?? session;

      return {
        ok: true,
        session: current,
        manifest,
        // §14.8: only missing or invalid packets are still required.
        remaining: buildRemainingWork(manifest, id),
        // §14.15: security and protocol parameters are inherited unchanged.
        preserved: preservedParameters(current, manifest),
      };
    },

    completeResume(id) {
      const session = sessions.getSession(id);

      if (session === undefined) {
        return { ok: false, validation: invalid([ResumeRefusal.UnknownSession]) };
      }

      if (session.state !== SessionState.Resuming) {
        return { ok: false, validation: invalid([ResumeRefusal.SessionNotResumable]) };
      }

      const manifest = manifests.getManifest(id);

      if (manifest === undefined) {
        return { ok: false, validation: invalid([ResumeRefusal.ManifestMissing]) };
      }

      const moved = sessions.transition(id, SessionState.Active);

      if (!moved.ok) {
        return { ok: false, validation: invalid([ResumeRefusal.SessionNotResumable]) };
      }

      return {
        ok: true,
        session: moved.session,
        manifest,
        remaining: buildRemainingWork(manifest, id),
        preserved: preservedParameters(moved.session, manifest),
      };
    },

    pause(id) {
      // §14.5 and §14.6: everything is preserved by *not* touching it. The
      // packet registry, the manifest and the session all remain exactly as
      // they were; pausing only changes the session's state.
      return sessions.transition(id, SessionState.Paused).ok;
    },
  };

  return engine;
}
