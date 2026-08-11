/**
 * Application composition (UI-001).
 *
 * Builds the full object graph the UI runs on: protocol engine, transport
 * adapters, services and controllers, wired together and handed to the screens
 * as one value.
 *
 * This is the **only** place concrete implementations are named. Everything
 * else receives its collaborators. See ARCHITECTURE_GRAPH.md §3 for why this
 * module's imports point upward and why that is not a layer violation.
 *
 * Two implementations here are deliberately not production-grade, and both are
 * isolated behind contracts so replacing them touches nothing else:
 *
 * - **The digest** is a non-cryptographic fingerprint. `PROTOCOL_SPEC.md` §20
 *   owns integrity algorithms and is unread; Phase 11 supplies SHA-256 against
 *   the same `IntegrityVerifier` contract.
 * - **The camera** defaults to the in-memory adapter. A device build injects
 *   `createDeviceCamera` (ADR-0005) instead; this module does not import it,
 *   because VisionCamera cannot be loaded outside a native runtime. A device camera needs a native
 *   module and a development build; the `CameraAdapter` contract is what the
 *   controller talks to, so only the adapter changes.
 */
import type { CameraAdapter } from '@camera/cameraPort';
import { createMemoryCamera } from '@camera/memoryCamera';
import { createDeviceFiles, type PickedFile } from '@storage/deviceFiles';

import { createPlatformCamera } from './platformCamera';
import { createQrDecoder } from '@camera/qrDecoder';

import type { ComponentType } from 'react';

import type { Clock, IdGenerator, IntegrityVerifier, PayloadCipher } from '@core/contracts';
import { toUserMessage } from '@core/errors';
import { createManifestManager } from '@core/manifest/manifestManager';
import { createPacketManager } from '@core/packet/packetManager';
import { createSessionManager } from '@core/session/sessionManager';

import { createReceiveController } from '@controllers/receiveController';
import { createSendController } from '@controllers/sendController';
import { createSettingsController } from '@controllers/settingsController';

import { protocolVersion as toProtocolVersion } from '@domain/ids';

import type { ValueRepository } from '@repositories/repository';

import { createReceiveService } from '@services/receiveService';
import { createTransferService } from '@services/transferService';

import { bytesToHex } from '@utils/hex';

import { NONE } from '@domain/manifest';
import { cipherFor } from '@security/cipher';
import { createSha256Verifier } from '@security/integrity';

import { defaultAppConfig, type AppConfig } from './appConfig';

/** The protocol version this build speaks. See COMPATIBILITY.md §2. */
export const PROTOCOL_VERSION = 1;

/** An in-memory settings repository, used until a storage adapter exists. */
export function createMemorySettingsRepository(
  initial: AppConfig = defaultAppConfig,
): ValueRepository<AppConfig> {
  let value: AppConfig = initial;

  return {
    async get() {
      return value;
    },
    async set(next) {
      value = next;
    },
    async clear() {
      value = initial;
    },
  };
}

export interface AppCompositionOptions {
  /** Defaults to the system clock. */
  readonly clock?: Clock;
  /** Defaults to `crypto.randomUUID` where available. */
  readonly idGenerator?: IdGenerator;
  readonly verifier?: IntegrityVerifier;
  /** Defaults to the disabled cipher (§19.4). */
  readonly cipher?: PayloadCipher;
  /**
   * The encryption algorithm for the session (§19.12).
   *
   * Defaults to `NONE`. Any other value selects a cipher that refuses, because
   * no cipher is implemented — see SI-012.
   */
  readonly encryptionAlgorithm?: string;
  /**
   * The camera to receive through.
   *
   * Any `CameraAdapter`: the in-memory one for tests and the web build, or the
   * device camera (`createDeviceCamera`, ADR-0005) on hardware. Widened from
   * the in-memory type in Milestone D so a device build can inject a real
   * camera without the composition root importing VisionCamera — which cannot
   * be loaded outside a native runtime.
   */
  readonly camera?: CameraAdapter;
  readonly settingsRepository?: ValueRepository<AppConfig>;
}

/** Everything the UI needs, wired. */
export interface AppGraph {
  readonly send: ReturnType<typeof createSendController>;
  readonly receive: ReturnType<typeof createReceiveController>;
  readonly settings: ReturnType<typeof createSettingsController>;
  /** Exposed so a receive screen can start the camera it was given. */
  readonly camera: CameraAdapter;
  /**
   * The live camera preview, when the platform has one.
   *
   * An opaque component: the UI renders it without importing the camera layer,
   * which the layer boundary forbids. `undefined` under Node and on the web,
   * where the receive screen falls back to its placeholder.
   */
  readonly cameraPreview?: ComponentType;
  /**
   * Opens the platform file picker (A12-02).
   *
   * Resolves empty when the user cancels, or when the platform has no picker —
   * a screen gets an empty selection rather than an unhandled rejection.
   */
  readonly pickFiles: () => Promise<readonly PickedFile[]>;
  /** Saves a received file, returning where it was written. */
  readonly saveFile: (name: string, bytes: Uint8Array) => Promise<string>;
  /**
   * What the platform actually provided.
   *
   * Present so a handset can report which native capabilities resolved and why
   * one did not, rather than silently degrading to a placeholder.
   */
  readonly diagnostics: readonly { readonly name: string; readonly status: string }[];
  /**
   * The application's notion of now.
   *
   * Exposed so a screen showing elapsed time reads the same clock the protocol
   * does, and so a test can control it. A function rather than the `Clock`
   * contract: the UI layer may not import from the core.
   */
  readonly now: () => number;
  readonly integrityAlgorithm: string;
  readonly protocolVersion: number;
}

/** A UUID source, falling back to a deterministic counter where unavailable. */
function defaultIdGenerator(): IdGenerator {
  let counter = 0;

  return {
    next: () => {
      const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;

      if (typeof globalCrypto?.randomUUID === 'function') {
        return globalCrypto.randomUUID();
      }

      // Not a real UUID source. Present so a runtime without WebCrypto starts
      // rather than crashing; a build relying on it would repeat ids across
      // launches, which §8.17.2 forbids.
      counter += 1;
      return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
  };
}

/**
 * Builds the application graph.
 *
 * Every dependency is overridable, which is what lets a test render a real
 * screen against a controlled clock, a counting id source and an in-memory
 * camera.
 */
export function createAppGraph(options: AppCompositionOptions = {}): AppGraph {
  const clock: Clock = options.clock ?? { now: () => Date.now() };
  const idGenerator = options.idGenerator ?? defaultIdGenerator();
  const verifier = options.verifier ?? createSha256Verifier();
  // A device build resolves the real camera here; Node and the web fall back
  // to the in-memory one (ADR-0005). An explicit `camera` option always wins,
  // which is how every test injects its own.
  const platform = options.camera === undefined ? createPlatformCamera() : undefined;
  const files = createDeviceFiles();
  const camera = options.camera ?? platform?.adapter ?? createMemoryCamera();

  const sessions = createSessionManager({
    clock,
    idGenerator,
    protocolVersion: toProtocolVersion(PROTOCOL_VERSION),
  });
  const manifests = createManifestManager();
  const packets = createPacketManager();

  // §19.12 negotiates the algorithm; this build has no negotiation, so it is
  // configured. `NONE` yields a working cipher and anything else yields one
  // that refuses — a build configured for an algorithm it cannot perform must
  // fail, not quietly transmit plain text (§19.14).
  const cipher = options.cipher ?? cipherFor(options.encryptionAlgorithm ?? NONE);

  const transfers = createTransferService({
    sessions,
    cipher,
    manifests,
    packets,
    clock,
    idGenerator,
    protocolVersion: PROTOCOL_VERSION,
  });

  const receives = createReceiveService({
    camera,
    cipher,
    decoder: createQrDecoder(),
    packets,
    manifests,
    verifier,
  });

  return {
    send: createSendController({
      transfers,
      clock,
      integrityAlgorithm: verifier.algorithm,
      hashFile: (content) => bytesToHex(verifier.digest(content)),
      toUserMessage,
    }),
    receive: createReceiveController({ camera, receives, toUserMessage }),
    settings: createSettingsController({
      repository: options.settingsRepository ?? createMemorySettingsRepository(),
      defaults: defaultAppConfig,
      toUserMessage,
    }),
    camera,
    ...(platform?.Preview === undefined ? {} : { cameraPreview: platform.Preview }),
    diagnostics: [
      {
        name: 'Camera',
        status:
          platform?.isDevice === true
            ? 'Device camera'
            : (platform?.unavailableReason ?? 'In-memory (no device camera)'),
      },
      {
        name: 'File picker',
        status: files.isDevice ? 'Available' : (files.unavailableReason ?? 'Unavailable'),
      },
    ],
    pickFiles: files.pickFiles,
    saveFile: files.saveFile,
    now: () => clock.now(),
    integrityAlgorithm: verifier.algorithm,
    protocolVersion: PROTOCOL_VERSION,
  };
}
