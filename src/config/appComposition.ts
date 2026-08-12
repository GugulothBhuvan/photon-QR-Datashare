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
import { createDeviceStorage } from '@storage/deviceStorage';
import type { KeyValueStore } from '@storage/ports';

import type { Store } from '@state/store';
import { createPlatformCamera, type CameraDrops } from './platformCamera';
import { createPlatformDisplay } from './platformDisplay';
import { createQrDecoder, type DecoderStats } from '@camera/qrDecoder';
import { createQrEncoder } from '@qr/qrEncoder';

import type { ComponentType } from 'react';

import type { Clock, IdGenerator, IntegrityVerifier, PayloadCipher } from '@core/contracts';
import { toUserMessage } from '@core/errors';
import { createManifestManager } from '@core/manifest/manifestManager';
import { createPacketManager } from '@core/packet/packetManager';
import { createSessionManager } from '@core/session/sessionManager';

import { createFountainReceiveController } from '@controllers/fountainReceiveController';
import { createFountainSendController } from '@controllers/fountainSendController';
import { createReceiveController } from '@controllers/receiveController';
import { createSendController } from '@controllers/sendController';
import { createSettingsController } from '@controllers/settingsController';

import { protocolVersion as toProtocolVersion } from '@domain/ids';
import type { TransferRecord } from '@domain/history';

import type { ValueRepository } from '@repositories/repository';
import { createHistoryRepository } from '@repositories/historyRepository';
import { createValueRepository } from '@repositories/valueRepository';

import { createDiscoveryService } from '@services/discoveryService';
import { createFountainReceiveService } from '@services/fountainReceiveService';
import { createFountainSendService } from '@services/fountainSendService';
import { createReceiveService } from '@services/receiveService';
import { createTransferService } from '@services/transferService';

import { bytesToHex } from '@utils/hex';

import { NONE } from '@domain/manifest';
import { cipherFor } from '@security/cipher';
import { createSha256Verifier } from '@security/integrity';

import { defaultAppConfig, parseConfig, serializeConfig, type AppConfig } from './appConfig';

/** The protocol version this build speaks. See COMPATIBILITY.md §2. */
export const PROTOCOL_VERSION = 1;

/** The key application settings are stored under. */
export const SETTINGS_KEY = 'settings';

/**
 * Settings persisted through a key-value adapter.
 *
 * Falls back to the defaults for a record it cannot read rather than throwing:
 * a preferences file written by an older build should cost a user their
 * preferences, not their ability to launch.
 */
export function createSettingsRepository(store: KeyValueStore): ValueRepository<AppConfig> {
  return createValueRepository({
    store,
    key: SETTINGS_KEY,
    codec: { encode: serializeConfig, decode: parseConfig },
    defaultValue: defaultAppConfig,
  });
}

/** An in-memory settings repository, used by tests and platforms without storage. */
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
  /**
   * Which optical transport to build (ADR-0008).
   *
   * Defaults to `PACKET`, and stays there until a hardware benchmark shows the
   * fountain engine wins on real devices. Both are built either way — they
   * share the camera, the decoder and the QR layer, so having both costs a
   * little memory and nothing else, and it is what makes the comparison
   * measurable rather than asserted.
   */
  readonly engine?: TransportEngine;
}

/** The two optical transports (ADR-0008). */
export const TransportEngine = {
  /** Indexed packets, manifest preamble, resume and recovery. PROTOCOL_SPEC. */
  Packet: 'PACKET',
  /** Rateless frames, no preamble, one file. Supersedes the sections ADR-0008 lists. */
  Fountain: 'FOUNTAIN',
} as const;

export type TransportEngine = (typeof TransportEngine)[keyof typeof TransportEngine];

/** Everything the UI needs, wired. */
export interface AppGraph {
  readonly send: ReturnType<typeof createSendController>;
  readonly receive: ReturnType<typeof createReceiveController>;
  readonly settings: ReturnType<typeof createSettingsController>;
  /** Exposed so a receive screen can start the camera it was given. */
  readonly camera: CameraAdapter;
  /**
   * Watches for a sender and reports the session it announces (§7.4–§7.6).
   *
   * This is what lets a receiver begin without being told a session id it has
   * no way of knowing.
   */
  readonly discovery: ReturnType<typeof createDiscoveryService>;
  /**
   * The live camera preview, when the platform has one.
   *
   * An opaque component: the UI renders it without importing the camera layer,
   * which the layer boundary forbids. `undefined` under Node and on the web,
   * where the receive screen falls back to its placeholder.
   */
  readonly cameraPreview?: ComponentType;
  /**
   * Failures reported by a camera that did load.
   *
   * A store, because the failure arrives after the screen has mounted — a
   * camera that starts and then drops out is exactly what a static reason
   * cannot describe.
   */
  readonly cameraErrors?: Store<string | undefined>;
  /** Frames not delivered to the decoder, by cause (E6). */
  readonly cameraDrops?: Store<CameraDrops>;
  /**
   * What decoding has cost so far (E6).
   *
   * A function returning plain numbers rather than the decoder, so a screen
   * can report §12's "as quickly as practical" without importing the camera
   * layer.
   */
  readonly decoderStats: () => DecoderStats;
  /** Which transport the UI is driving (ADR-0008). */
  readonly engine: TransportEngine;
  /**
   * The rateless transport (ADR-0008).
   *
   * Present whichever engine is selected, so a benchmark can drive both
   * without building a second graph.
   */
  readonly fountain: {
    readonly send: ReturnType<typeof createFountainSendService>;
    readonly receive: ReturnType<typeof createFountainReceiveService>;
    /** Screen-facing state for the rateless engine. */
    readonly sendController: ReturnType<typeof createFountainSendController>;
    readonly receiveController: ReturnType<typeof createFountainReceiveController>;
  };
  /**
   * Why there is no camera preview, when there is none.
   *
   * A device build that cannot reach its camera must say so. Showing the
   * placeholder alone made a failed native module look like a camera that had
   * not focused yet, which cost three device sessions to work out.
   */
  readonly cameraUnavailableReason?: string;
  /**
   * Opens the platform file picker (A12-02).
   *
   * Resolves empty when the user cancels, or when the platform has no picker —
   * a screen gets an empty selection rather than an unhandled rejection.
   */
  readonly pickFiles: () => Promise<readonly PickedFile[]>;
  /**
   * Saves a received file, returning where it was written.
   *
   * `directoryUri` is §5.6's download folder. Absent means the application's
   * document directory.
   */
  readonly saveFile: (name: string, bytes: Uint8Array, directoryUri?: string) => Promise<string>;
  /** Asks the user for a download folder (§5.6). `undefined` if cancelled. */
  readonly pickDirectory: () => Promise<string | undefined>;
  /**
   * Holds the screen awake, bright and unrotated for a transfer (QR_SPEC §11).
   *
   * Returns the function that undoes it. A plain function pair rather than the
   * adapter, so a screen meets §11 without importing a platform module.
   */
  readonly beginTransferDisplay: () => () => void;
  /**
   * Records a finished transfer (A12-03, ADR-0007).
   *
   * A plain function rather than the repository, so the UI stores a transfer
   * without importing the repository layer — the same shape `saveFile` takes.
   */
  readonly recordTransfer: (record: TransferRecord) => Promise<void>;
  /** Finished transfers, newest first (ADR-0007). */
  readonly recentTransfers: () => Promise<readonly TransferRecord[]>;
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

  // Persistent records, when the platform has a filesystem. Resolved even when
  // a test supplies its own settings repository, because the About screen
  // reports whether storage is persistent either way.
  const storage = createDeviceStorage();

  // QR_SPEC §11: screen sleep, brightness and orientation during a transfer.
  const display = createPlatformDisplay();

  // A12-03: transfer history, bounded and ordered by ADR-0007.
  const history = createHistoryRepository({ store: storage.store });

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

  // §7.4–§7.6: a receiver learns the session from a scanned frame rather than
  // from a caller. Exposed on the graph so the receive screen can listen for a
  // sender instead of being handed a session id it could not know.
  // **One decoder, shared.** Two of them meant two independent crop anchors,
  // and the anchor discovery found while locking on was thrown away the moment
  // collection started. Sharing carries it across, so the first collected
  // packet is decoded from a crop rather than a full scan.
  const decoder = createQrDecoder();

  // The fountain engine encodes frames on demand rather than up front, so it
  // needs an encoder of its own; the packet engine's lives inside its service.
  const qrEncoder = createQrEncoder();

  const fountainSend = createFountainSendService({
    qr: qrEncoder,
    verifier,
    // Sixteen bits, drawn from the same id source the sessions use so a test
    // controls it. Collisions across sender restarts are handled by comparing
    // the whole stream identity, not by widening this field.
    randomSeed: () =>
      Number.parseInt(
        idGenerator
          .next()
          .replace(/[^0-9a-f]/gi, '')
          .slice(0, 4),
        16,
      ) || 1,
  });

  const fountainReceive = createFountainReceiveService({ camera, decoder, verifier });

  const discovery = createDiscoveryService({
    camera,
    decoder,
    sessions,
    manifests,
    supportedVersions: [PROTOCOL_VERSION],
  });

  const receives = createReceiveService({
    camera,
    cipher,
    decoder,
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
    receive: createReceiveController({ camera, receives, discovery, toUserMessage }),
    discovery,
    settings: createSettingsController({
      // Persisted, so preferences survive a restart. Before this the graph
      // only ever registered the in-memory repository and every setting reset
      // on launch.
      repository: options.settingsRepository ?? createSettingsRepository(storage.store),
      defaults: defaultAppConfig,
      toUserMessage,
    }),
    camera,
    ...(platform?.Preview === undefined ? {} : { cameraPreview: platform.Preview }),
    ...(platform?.errors === undefined ? {} : { cameraErrors: platform.errors }),
    ...(platform?.drops === undefined ? {} : { cameraDrops: platform.drops }),
    decoderStats: () => decoder.stats(),
    engine: options.engine ?? TransportEngine.Packet,
    fountain: {
      send: fountainSend,
      receive: fountainReceive,
      sendController: createFountainSendController({ sender: fountainSend, clock, toUserMessage }),
      receiveController: createFountainReceiveController({
        camera,
        receiver: fountainReceive,
        toUserMessage,
      }),
    },
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
      {
        name: 'Display control',
        status:
          display.capabilities.length === 0
            ? (display.unavailableReason ?? 'Unavailable')
            : display.capabilities.join(', '),
      },
      {
        name: 'Settings storage',
        status: storage.isPersistent
          ? 'Persistent'
          : `Resets on launch — ${storage.unavailableReason ?? 'no filesystem'}`,
      },
    ],
    ...(platform?.unavailableReason === undefined
      ? {}
      : { cameraUnavailableReason: platform.unavailableReason }),
    pickFiles: files.pickFiles,
    pickDirectory: files.pickDirectory,
    beginTransferDisplay: () => display.begin(),
    recordTransfer: (record) => history.save(record),
    recentTransfers: () => history.recent(),
    saveFile: files.saveFile,
    now: () => clock.now(),
    integrityAlgorithm: verifier.algorithm,
    protocolVersion: PROTOCOL_VERSION,
  };
}
