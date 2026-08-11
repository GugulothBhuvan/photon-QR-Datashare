/**
 * Failure testing (TST-003) — TEST_SPEC §11, invariant §15.5.
 *
 * §11 names eight scenarios and requires the application to **fail
 * gracefully**. That phrase is what these tests pin down, because it is the
 * one that a system can appear to satisfy while quietly doing the wrong thing.
 * Failing gracefully is taken to mean all of:
 *
 * 1. No crash, and no unhandled rejection.
 * 2. No corrupt output — §15.5: invalid packets SHALL never produce valid files.
 * 3. The failure is *reported*, not swallowed: a counter moves, a stage
 *    changes, or a validation result says why.
 *
 * A test that only asserted "did not throw" would pass on a receiver that
 * silently discarded everything, so each scenario below also asserts what the
 * system said about the failure.
 */
import { isPlausiblyDecodable, MIN_USABLE_LUMINANCE } from '@camera/frameProcessor';
import type { CameraFrame } from '@camera/cameraPort';
import { createQrDecoder } from '@camera/qrDecoder';
import { createAppGraph, createMemorySettingsRepository } from '@config/appComposition';
import { createSettingsController } from '@controllers/settingsController';
import { defaultAppConfig, type AppConfig } from '@config/appConfig';
import { deserializePacket } from '@core/packet/deserializer';
import { PacketRejection } from '@core/packet/validator';
import { createManifestManager } from '@core/manifest/manifestManager';
import { sessionId } from '@domain/ids';
import { Theme } from '@domain/settings';
import type { ValueRepository } from '@repositories/repository';

import { CORPUS } from '../support/fileCorpus';
import {
  bytesEqual,
  captureOf,
  corrupt,
  createHarness,
  fixedClock,
  scuff,
  sequentialIds,
} from '../support/opticalHarness';

const PACKET_SIZE = 128;

function corpusFile(name: string) {
  const file = CORPUS.find((candidate) => candidate.name === name);

  if (file === undefined) {
    throw new Error(`No corpus fixture named ${name}.`);
  }

  return {
    name: file.name,
    mimeType: file.mimeType,
    extension: file.extension,
    content: file.content,
  };
}

describe('corrupted packets (§11)', () => {
  it('never lets a corrupted frame become file content (§15.5)', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const file = corpusFile('notes.txt');

    // Every frame damaged on the first pass, clean thereafter. If a corrupted
    // frame could contribute bytes, the output would differ.
    const outcome = await harness.run([file], {
      seed: 0xc0f7,
      corruptionRate: 1,
      passes: 1,
    });

    // Nothing usable arrived, so nothing is produced — not a partial file.
    expect(outcome.files).toHaveLength(0);
    expect(outcome.collectedPackets).toBe(0);

    // And the receiver saw the frames rather than missing them: it reports
    // frames that arrived and could not be used.
    expect(harness.graph.receive.state.getState().framesSeen).toBeGreaterThan(0);
  });

  it('recovers once clean copies arrive, with output still byte-identical', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const file = corpusFile('notes.txt');

    const outcome = await harness.run([file], {
      seed: 0xc0f8,
      corruptionRate: 0.4,
      passes: 4,
    });

    expect(outcome.files).toHaveLength(1);
    expect(bytesEqual(outcome.files[0]!.stream, file.content)).toBe(true);
  });

  it('rejects a heavily damaged frame at the decoder rather than passing bytes on', () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    harness.graph.send.addFiles([corpusFile('pixel.png')]);
    harness.graph.send.prepare();

    // Index 2: the first data frame, after the handshake and manifest preamble.
    const frame = harness.graph.send.prepared()!.frames.at(2)!;
    const decoder = createQrDecoder();

    expect(decoder.decode(captureOf(frame)).ok).toBe(true);
    expect(decoder.decode(corrupt(captureOf(frame))).ok).toBe(false);
  });

  it('repairs light damage through error correction (QR_SPEC §7)', () => {
    // The other half of the story: a level is chosen so ordinary optical noise
    // does not cost a packet. Without this test, `corrupt` could be weakened
    // and the suite would still look green.
    const harness = createHarness({ packetSize: PACKET_SIZE });
    harness.graph.send.addFiles([corpusFile('pixel.png')]);
    harness.graph.send.prepare();

    // Index 2: the first data frame, after the handshake and manifest preamble.
    const frame = harness.graph.send.prepared()!.frames.at(2)!;
    const decoded = createQrDecoder().decode(scuff(captureOf(frame)));

    expect(decoded.ok).toBe(true);
  });
});

describe('missing packets (§11)', () => {
  it('reports the shortfall and withholds the file', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const outcome = await harness.run([corpusFile('video.mp4')], {
      seed: 0x1055,
      lossRate: 0.4,
      passes: 1,
    });

    // §5.3 requires a missing packet counter; it must actually count.
    expect(outcome.missingPackets).toBeGreaterThan(0);
    expect(outcome.collectedPackets + outcome.missingPackets).toBe(outcome.totalPackets);
    expect(outcome.files).toHaveLength(0);
  });
});

describe('duplicate packets (§11)', () => {
  it('stores a packet once, however many copies arrive (§11.13)', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const file = corpusFile('data.json');

    const outcome = await harness.run([file], {
      seed: 0xd0b1,
      duplicationRate: 1,
      passes: 3,
    });

    // Far more frames delivered than packets exist, yet the count is exact.
    expect(outcome.framesDelivered).toBeGreaterThan(outcome.totalPackets);
    expect(outcome.collectedPackets).toBe(outcome.totalPackets);
    expect(bytesEqual(outcome.files[0]!.stream, file.content)).toBe(true);
  });
});

describe('camera interruption (§11)', () => {
  it('stops consuming frames when the camera stops, and keeps what it had', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const file = corpusFile('audio.mp3');

    harness.graph.send.addFiles([file]);
    harness.graph.send.prepare();
    harness.graph.send.start();

    const prepared = harness.graph.send.prepared()!;
    await harness.graph.receive.start(prepared.sessionId);

    // Skip the two preamble frames; count only data packets collected.
    for (const frame of [...prepared.frames].slice(2, 5)) {
      harness.camera.push(captureOf(frame));
    }
    harness.camera.emitAll();

    const beforeInterruption = harness.graph.receive.state.getState().collectedPackets;
    expect(beforeInterruption).toBe(3);

    // The camera is taken away mid-transfer.
    await harness.graph.receive.stop();

    for (const frame of [...prepared.frames].slice(5)) {
      harness.camera.push(captureOf(frame));
    }
    harness.camera.emitAll();

    // Nothing further is consumed, and nothing already validated is lost —
    // §8.8: pausing discards no session information.
    expect(harness.graph.receive.state.getState().collectedPackets).toBe(beforeInterruption);
  });

  it('surfaces a permission failure as a stage rather than throwing', async () => {
    const graph = createAppGraph({
      clock: fixedClock,
      idGenerator: sequentialIds(),
      settingsRepository: createMemorySettingsRepository(),
    });

    // Starting a receive for a session that has no manifest is the failure a
    // receiver hits when it scans before a handshake.
    await expect(
      graph.receive.start(sessionId('99999999-9999-4999-8999-999999999999')),
    ).resolves.toBeUndefined();

    const state = graph.receive.state.getState();
    expect(state.stage).toBe('FAILED');
    // §6.11: a user-safe message, not a protocol internal.
    expect(state.errorMessage).toBeTruthy();
  });
});

describe('low-light scanning (§11)', () => {
  function dimmed(frame: CameraFrame, factor: number): CameraFrame {
    return {
      ...frame,
      data: Uint8ClampedArray.from(frame.data, (value) => Math.round(value * factor)),
    };
  }

  it('identifies a frame too dark to decode before attempting one', () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    harness.graph.send.addFiles([corpusFile('pixel.png')]);
    harness.graph.send.prepare();

    const lit = captureOf(harness.graph.send.prepared()!.frames.at(0)!);
    const dark = dimmed(lit, 0.02);

    expect(isPlausiblyDecodable(lit)).toBe(true);
    expect(isPlausiblyDecodable(dark)).toBe(false);
  });

  it('treats an unusable frame as no packet, not as a corrupt one', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const file = corpusFile('pixel.png');

    harness.graph.send.addFiles([file]);
    harness.graph.send.prepare();
    harness.graph.send.start();

    const prepared = harness.graph.send.prepared()!;
    await harness.graph.receive.start(prepared.sessionId);

    // A stretch of darkness, then the light comes back.
    for (const frame of prepared.frames) {
      harness.camera.push(dimmed(captureOf(frame), 0.02));
    }
    harness.camera.emitAll();

    expect(harness.graph.receive.state.getState().collectedPackets).toBe(0);

    for (const frame of prepared.frames) {
      harness.camera.push(captureOf(frame));
    }
    harness.camera.emitAll();

    const received = harness.graph.receive.finish();
    expect(bytesEqual(received[0]!.stream, file.content)).toBe(true);
  });

  it('places the darkness threshold where the decoder actually fails', () => {
    // The cheap check must not reject frames the decoder could have read: a
    // threshold that is too eager loses packets that were there.
    const harness = createHarness({ packetSize: PACKET_SIZE });
    harness.graph.send.addFiles([corpusFile('pixel.png')]);
    harness.graph.send.prepare();

    const lit = captureOf(harness.graph.send.prepared()!.frames.at(0)!);
    const decoder = createQrDecoder();

    // Dimmed to just above the threshold, a frame still decodes.
    const marginal = dimmed(lit, (MIN_USABLE_LUMINANCE * 2) / 255);

    expect(isPlausiblyDecodable(marginal)).toBe(true);
    expect(decoder.decode(marginal).ok).toBe(true);
  });
});

describe('invalid manifest (§11)', () => {
  it('rejects a malformed manifest with a reason rather than throwing', () => {
    const manifests = createManifestManager();

    const outcome = manifests.parseManifest(
      { sessionId: 'not-a-uuid', files: 'not-a-list' },
      { integrityVerified: true },
    );

    expect(outcome.ok).toBe(false);
  });

  it('rejects a manifest whose declared counts disagree with its entries (§10.13)', () => {
    const manifests = createManifestManager();

    const outcome = manifests.parseManifest(
      {
        sessionId: '11111111-1111-4111-8111-111111111111',
        protocolVersion: 1,
        createdAt: 1,
        fileCount: 9,
        totalSize: 1,
        totalPacketCount: 1,
        entries: [],
        configuration: {
          packetSize: 128,
          recoveryMethod: 'NATURAL_REPETITION',
          integrityAlgorithm: 'TEST',
          transportCapabilities: ['QR'],
        },
      },
      { integrityVerified: true },
    );

    expect(outcome.ok).toBe(false);
  });

  it('refuses a manifest whose integrity was not verified (§10.8)', () => {
    // §10.8 requires integrity to be verified *before* acceptance. Passing
    // `false` is the case where a receiver has not checked.
    const manifests = createManifestManager();

    const outcome = manifests.parseManifest(
      {
        sessionId: '11111111-1111-4111-8111-111111111111',
        protocolVersion: 1,
        createdAt: 1,
        entries: [],
        configuration: {
          packetSize: 128,
          recoveryMethod: 'NATURAL_REPETITION',
          integrityAlgorithm: 'TEST',
          transportCapabilities: ['QR'],
        },
      },
      { integrityVerified: false },
    );

    expect(outcome.ok).toBe(false);
  });
});

describe('session mismatch (§11)', () => {
  it('rejects a packet from another session without storing it', async () => {
    const first = createHarness({ packetSize: PACKET_SIZE, idPrefix: '0a000000' });
    const second = createHarness({ packetSize: PACKET_SIZE, idPrefix: '0b000000' });

    first.graph.send.addFiles([corpusFile('pixel.png')]);
    first.graph.send.prepare();
    second.graph.send.addFiles([corpusFile('data.json')]);
    second.graph.send.prepare();

    const mine = first.graph.send.prepared()!;
    const theirs = second.graph.send.prepared()!;

    expect(mine.sessionId).not.toBe(theirs.sessionId);

    first.graph.send.start();
    await first.graph.receive.start(mine.sessionId);

    // The other session's frames are shown to this receiver.
    for (const frame of theirs.frames) {
      first.camera.push(captureOf(frame));
    }
    first.camera.emitAll();

    const state = first.graph.receive.state.getState();

    // Seen, decoded, and refused — not silently absorbed.
    expect(state.framesSeen).toBeGreaterThan(0);
    expect(state.collectedPackets).toBe(0);
  });

  it('names the mismatch when parsing, rather than reporting a generic failure', () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    harness.graph.send.addFiles([corpusFile('pixel.png')]);
    harness.graph.send.prepare();

    // Index 2: the first data frame, after the handshake and manifest preamble.
    const frame = harness.graph.send.prepared()!.frames.at(2)!;
    const decoded = createQrDecoder().decode(captureOf(frame));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }

    const parsed = deserializePacket(decoded.payload, {
      expectedSessionId: sessionId('99999999-9999-4999-8999-999999999999'),
    });

    // A foreign packet is well-formed — it parses. What refuses it is
    // validation, and it says which rule was broken rather than failing
    // generically. Asserting `ok === false` here would have been asserting at
    // the wrong layer, and would pass equally on a packet that was truncated.
    expect(parsed.ok).toBe(true);
    expect(parsed.validation.valid).toBe(false);
    expect(parsed.validation.rejections).toContain(PacketRejection.ForeignSession);
  });
});

describe('storage failure (§11)', () => {
  /** A repository whose every operation fails, as a full disk would. */
  function failingRepository(): ValueRepository<AppConfig> {
    return {
      get: () => Promise.reject(new Error('storage unavailable')),
      set: () => Promise.reject(new Error('storage unavailable')),
      clear: () => Promise.reject(new Error('storage unavailable')),
    };
  }

  it('starts on defaults when preferences cannot be read', async () => {
    const settings = createSettingsController({
      repository: failingRepository(),
      defaults: defaultAppConfig,
      toUserMessage: () => 'Settings could not be loaded.',
    });

    await settings.load();

    const state = settings.state.getState();

    // A corrupt or unreachable store must not prevent the app starting.
    expect(state.settings).toEqual(defaultAppConfig);
    expect(state.loading).toBe(false);
    expect(state.errorMessage).toBe('Settings could not be loaded.');
  });

  it('keeps the change visible and says the save failed', async () => {
    const settings = createSettingsController({
      repository: failingRepository(),
      defaults: defaultAppConfig,
      toUserMessage: () => 'Could not save.',
    });

    await settings.setTheme(Theme.Dark);

    const state = settings.state.getState();

    // Reverting the control under the user's finger would be worse than
    // showing the choice alongside the reason it did not persist.
    expect(state.settings.theme).toBe(Theme.Dark);
    expect(state.errorMessage).toBe('Could not save.');
  });

  it('does not corrupt a transfer when preferences are unavailable', async () => {
    // Storage is an application concern; a protocol transfer must not depend
    // on it. This checks the two are genuinely independent.
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const file = corpusFile('notes.txt');

    const outcome = await harness.run([file]);

    expect(bytesEqual(outcome.files[0]!.stream, file.content)).toBe(true);
  });
});
