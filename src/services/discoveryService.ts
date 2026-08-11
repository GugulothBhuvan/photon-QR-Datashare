/**
 * Receiver discovery (Stage 1.3) — PROTOCOL_SPEC §7.4–§7.6.
 *
 * Turns a camera pointed at nothing in particular into a session.
 *
 * Until now the receiver was told which session to collect for, by a caller in
 * the same process. That works in a test and is meaningless between two phones:
 * a real receiver knows nothing until it reads a frame. This module is the step
 * that was missing —
 *
 * ```text
 * QR frame → packet → handshake announcement → validation
 *          → manifest → session created → data packets
 * ```
 *
 * **One way, and unilateral.** §7.5 describes a negotiated handshake; the
 * optical link cannot carry one (SI-014). So the sender *announces* and this
 * module *decides*: it validates the announcement against what this build
 * supports and either proceeds or refuses. The sender is never told. Every name
 * here says "announcement" rather than "negotiation" for that reason.
 *
 * It owns no protocol rules. Session creation is the SessionManager's, manifest
 * acceptance is the ManifestManager's; what this adds is the order in which a
 * receiver learns things.
 */
import type { CameraAdapter, CameraFrame } from '@camera/cameraPort';
import type { QrDecoder } from '@camera/qrDecoder';

import { deserializePacket } from '@core/packet/deserializer';
import { PacketTypeId } from '@core/packet/header';
import {
  decodeHandshake,
  type HandshakeAnnouncement,
  type HandshakeRejection,
} from '@core/packet/handshakeCodec';
import { decodeManifest, type ManifestDecodeFailure } from '@core/packet/manifestCodec';
import type { ManifestManager } from '@core/manifest/manifestManager';
import type { SessionManager } from '@core/session/sessionManager';

import type { SessionId } from '@domain/ids';
import type { Manifest } from '@domain/manifest';

/** What a receiver has learned so far. */
export const DiscoveryStage = {
  /** Nothing recognised yet. */
  Searching: 'SEARCHING',
  /** A handshake announcement was read and accepted. */
  Announced: 'ANNOUNCED',
  /** A manifest arrived and was accepted; collection may begin. */
  Ready: 'READY',
  /** Something was read and refused. */
  Refused: 'REFUSED',
} as const;

export type DiscoveryStage = (typeof DiscoveryStage)[keyof typeof DiscoveryStage];

/** Why discovery refused what it read. */
export type DiscoveryRefusal =
  | { readonly kind: 'HANDSHAKE'; readonly reason: HandshakeRejection }
  | { readonly kind: 'MANIFEST'; readonly reason: ManifestDecodeFailure };

export interface DiscoveryState {
  readonly stage: DiscoveryStage;
  /** The sender's announcement, once one has been accepted. */
  readonly announcement: HandshakeAnnouncement | undefined;
  /** The session the sender is transmitting, once the manifest arrived. */
  readonly sessionId: SessionId | undefined;
  readonly manifest: Manifest | undefined;
  readonly refusal: DiscoveryRefusal | undefined;
  /** Frames seen since listening began, whether or not they decoded. */
  readonly framesSeen: number;
}

export interface DiscoveryOptions {
  readonly camera: CameraAdapter;
  readonly decoder: QrDecoder;
  readonly sessions: SessionManager;
  readonly manifests: ManifestManager;
  /** Protocol versions this build accepts (§23, §24). */
  readonly supportedVersions: readonly number[];
}

export interface DiscoveryListener {
  /** Stops consuming frames. Idempotent. */
  stop(): void;
  /** What has been learned so far. */
  state(): DiscoveryState;
}

export interface DiscoveryService {
  /**
   * Watches for a sender and reports when one is ready to be received from.
   *
   * @param onReady Called once, when a manifest has been accepted and a
   *   session exists. The receive flow starts collecting from there.
   */
  listen(onReady: (sessionId: SessionId, manifest: Manifest) => void): DiscoveryListener;
}

export function createDiscoveryService(options: DiscoveryOptions): DiscoveryService {
  const { camera, decoder, sessions, manifests, supportedVersions } = options;

  return {
    listen(onReady) {
      let stage: DiscoveryStage = DiscoveryStage.Searching;
      let announcement: HandshakeAnnouncement | undefined;
      let sessionId: SessionId | undefined;
      let manifest: Manifest | undefined;
      let refusal: DiscoveryRefusal | undefined;
      let framesSeen = 0;
      let stopped = false;

      function consume(frame: CameraFrame): void {
        framesSeen += 1;

        const decoded = decoder.decode(frame);

        if (!decoded.ok) {
          return;
        }

        // No expected session yet — that is the whole point. The session id
        // arrives *in* the packet, so it cannot be checked against one.
        const parsed = deserializePacket(decoded.payload);

        if (!parsed.ok) {
          return;
        }

        const { header, payload } = parsed.packet;

        if (header.packetType === PacketTypeId.Handshake) {
          const result = decodeHandshake(payload, { supportedVersions });

          if (!result.ok) {
            // §24: a version this build cannot speak is where compatibility
            // ends. Refusing loudly beats collecting packets it will never
            // reconstruct.
            stage = DiscoveryStage.Refused;
            refusal = { kind: 'HANDSHAKE', reason: result.reason };
            return;
          }

          announcement = result.announcement;

          if (stage === DiscoveryStage.Searching) {
            stage = DiscoveryStage.Announced;
          }

          return;
        }

        if (header.packetType !== PacketTypeId.Manifest || stage === DiscoveryStage.Ready) {
          // Data packets are not this module's business, and a manifest that
          // arrives twice is the sender looping (§11.11), not a new transfer.
          return;
        }

        const result = decodeManifest(payload);

        if (!result.ok) {
          // §10.13: a rejected manifest initializes no protocol state. Nothing
          // below runs, so no session is created.
          stage = DiscoveryStage.Refused;
          refusal = { kind: 'MANIFEST', reason: result.reason };
          return;
        }

        // The session is adopted from the manifest rather than generated:
        // both devices must agree on the id, and the sender chose it.
        sessions.adoptSession(result.manifest.sessionId, result.manifest.protocolVersion);
        manifests.accept(result.manifest);

        sessionId = result.manifest.sessionId;
        manifest = result.manifest;
        stage = DiscoveryStage.Ready;

        onReady(sessionId, manifest);
      }

      const unsubscribe = camera.onFrame((frame) => {
        if (!stopped) {
          consume(frame);
        }
      });

      return {
        stop() {
          if (stopped) {
            return;
          }
          stopped = true;
          unsubscribe();
        },

        state() {
          return { stage, announcement, sessionId, manifest, refusal, framesSeen };
        },
      };
    },
  };
}
