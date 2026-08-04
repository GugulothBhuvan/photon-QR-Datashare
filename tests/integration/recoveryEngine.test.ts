/**
 * RecoveryEngine (PRO-005) — PROTOCOL_SPEC §15.
 */
import type { Clock, IdGenerator } from '@core/contracts';
import { createManifestManager } from '@core/manifest/manifestManager';
import { createPacketManager } from '@core/packet/packetManager';
import {
  createRecoveryEngine,
  RecoveryAcceptOutcome,
  RecoveryCondition,
  RecoveryRefusal,
  RecoveryStrategy,
} from '@core/recovery/recoveryEngine';
import { createResumeEngine } from '@core/resume/resumeEngine';
import { createSessionManager } from '@core/session/sessionManager';
import { createFileMetadata } from '@domain/fileMetadata';
import { fileId, protocolVersion, sessionId } from '@domain/ids';
import { NONE, type ManifestConfiguration } from '@domain/manifest';
import { createPacket, PacketType } from '@domain/packet';
import { SessionState } from '@domain/session';

const VERSION = protocolVersion(1);
const FILE_A = fileId('f1000000-0000-4000-8000-000000000001');

const fileA = createFileMetadata({ id: FILE_A, name: 'a.bin', size: 24, hash: 'hash-a' });

const configuration: ManifestConfiguration = {
  packetSize: 4,
  recoveryMethod: RecoveryStrategy.NaturalRepetition,
  integrityAlgorithm: 'SHA-256',
  transportCapabilities: ['QR'],
};

function makeClock(start = 1_700_000_000_000): Clock {
  return { now: () => start };
}

function makeIds(): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
  };
}

/**
 * An active transfer with packets 0, 1, 3 and 5 of 6 collected.
 *
 * Deliberately the §15.5 worked example: indices 2 and 4 are missing.
 */
function makeActiveTransfer(overrides: { readonly recoveryMethod?: string } = {}) {
  const clock = makeClock();
  const sessions = createSessionManager({
    clock,
    idGenerator: makeIds(),
    protocolVersion: VERSION,
  });
  const manifests = createManifestManager();
  const packets = createPacketManager();
  const engine = createRecoveryEngine({ sessions, manifests, packets });

  const session = sessions.createSession();
  const id = session.id;

  manifests.accept(
    manifests.createManifest({
      sessionId: id,
      protocolVersion: VERSION,
      createdAt: clock.now(),
      files: [fileA],
      configuration: {
        ...configuration,
        ...(overrides.recoveryMethod === undefined
          ? {}
          : { recoveryMethod: overrides.recoveryMethod }),
      },
    }),
  );

  sessions.transition(id, SessionState.Waiting);
  sessions.transition(id, SessionState.Handshake);
  sessions.transition(id, SessionState.Active);

  const expectations = { sessionId: id, integrityVerified: true };

  for (const index of [0, 1, 3, 5]) {
    packets.accept(
      createPacket({ sessionId: id, fileId: FILE_A, index, payload: new Uint8Array(4) }),
      expectations,
    );
  }

  return { clock, sessions, manifests, packets, engine, id, expectations };
}

describe('recoverable conditions (§15.4)', () => {
  it.each([
    RecoveryCondition.MissingPacket,
    RecoveryCondition.CorruptedPacket,
    RecoveryCondition.DroppedFrame,
    RecoveryCondition.CameraFrameLoss,
    RecoveryCondition.LightingInterruption,
  ])('may recover from %s', (condition) => {
    expect(makeActiveTransfer().engine.isRecoverable(condition)).toBe(true);
  });

  it.each([
    RecoveryCondition.ManifestCorruption,
    RecoveryCondition.SessionMismatch,
    RecoveryCondition.VersionMismatch,
    RecoveryCondition.InvalidEncryptionParameters,
  ])('SHALL NOT be used for %s', (condition) => {
    expect(makeActiveTransfer().engine.isRecoverable(condition)).toBe(false);
  });
});

describe('missing packet detection (§15.5)', () => {
  it('reports exactly the indices the manifest expects but the map lacks', () => {
    const { engine, id } = makeActiveTransfer();
    const status = engine.detectMissing(id);

    // The §15.5 example: expected 0-5, received 0, 1, 3, 5, missing 2 and 4.
    expect(status?.gaps[0]?.missingIndices).toEqual([2, 4]);
    expect(status?.missingPacketCount).toBe(2);
  });

  it('reports recovery as needed while packets are absent', () => {
    const { engine, id } = makeActiveTransfer();

    expect(engine.detectMissing(id)?.recoveryNeeded).toBe(true);
    expect(engine.isComplete(id)).toBe(false);
  });

  it('counts only validated packets as received (§15.5)', () => {
    const { engine, packets, id } = makeActiveTransfer();

    // A packet that fails validation is never stored (§11.15), so index 2
    // stays missing.
    packets.accept(
      createPacket({ sessionId: id, fileId: FILE_A, index: 2, payload: new Uint8Array(4) }),
      { sessionId: id, integrityVerified: false },
    );

    expect(engine.detectMissing(id)?.gaps[0]?.missingIndices).toEqual([2, 4]);
  });

  it('lists no gaps once every packet exists', () => {
    const { engine, packets, id, expectations } = makeActiveTransfer();

    for (const index of [2, 4]) {
      packets.accept(
        createPacket({ sessionId: id, fileId: FILE_A, index, payload: new Uint8Array(4) }),
        expectations,
      );
    }

    const status = engine.detectMissing(id);

    expect(status?.gaps).toEqual([]);
    expect(status?.complete).toBe(true);
  });

  it('returns undefined without a manifest, which is what declares the requirement', () => {
    const { engine, manifests, id } = makeActiveTransfer();
    manifests.release(id);

    expect(engine.detectMissing(id)).toBeUndefined();
    expect(engine.isComplete(id)).toBe(false);
  });

  it('is frozen', () => {
    const { engine, id } = makeActiveTransfer();

    expect(Object.isFrozen(engine.detectMissing(id))).toBe(true);
  });
});

describe('eligibility (§15.14.9)', () => {
  it('permits recovery within an active session', () => {
    const { engine, id } = makeActiveTransfer();

    expect(engine.checkEligibility(id).valid).toBe(true);
  });

  it('refuses once the session is no longer active', () => {
    const { engine, sessions, id } = makeActiveTransfer();

    sessions.transition(id, SessionState.Paused);

    // §15.1: recovery operates while the session remains active; a paused
    // session is resume's business, not recovery's.
    expect(engine.checkEligibility(id).rejections).toContain(RecoveryRefusal.SessionNotActive);
  });

  it('refuses an unknown session', () => {
    const { engine } = makeActiveTransfer();

    expect(
      engine.checkEligibility(sessionId('99999999-9999-4999-8999-999999999999')).rejections,
    ).toContain(RecoveryRefusal.UnknownSession);
  });

  it('refuses without a manifest', () => {
    const { engine, manifests, id } = makeActiveTransfer();
    manifests.release(id);

    expect(engine.checkEligibility(id).rejections).toContain(RecoveryRefusal.ManifestMissing);
  });

  it('refuses a strategy this implementation cannot perform (§15.6)', () => {
    const { engine, id } = makeActiveTransfer({
      recoveryMethod: RecoveryStrategy.ForwardErrorCorrection,
    });

    expect(engine.checkEligibility(id).rejections).toContain(RecoveryRefusal.StrategyUnsupported);
  });

  it('accepts a manifest naming no recovery method', () => {
    const { engine, id } = makeActiveTransfer({ recoveryMethod: NONE });

    expect(engine.checkEligibility(id).valid).toBe(true);
  });
});

describe('strategies (§15.6)', () => {
  it('supports natural repetition, the OSP/1.0 default', () => {
    expect(makeActiveTransfer().engine.supports(RecoveryStrategy.NaturalRepetition)).toBe(true);
  });

  it.each([RecoveryStrategy.ForwardErrorCorrection, RecoveryStrategy.SelectiveRecovery])(
    'does not support %s, which is future work',
    (strategy) => {
      expect(makeActiveTransfer().engine.supports(strategy)).toBe(false);
    },
  );

  it('reports the strategy the manifest names', () => {
    const { engine, id } = makeActiveTransfer();

    expect(engine.strategyFor(id)).toBe(RecoveryStrategy.NaturalRepetition);
  });

  it('reports no strategy for an unrecognised method', () => {
    const { engine, id } = makeActiveTransfer({ recoveryMethod: 'SOMETHING_FUTURE' });

    expect(engine.strategyFor(id)).toBeUndefined();
  });
});

describe('recovered packets (§15.8, §15.11)', () => {
  it('fills a gap through the normal validation path', () => {
    const { engine, id, expectations } = makeActiveTransfer();

    const result = engine.acceptRecoveredPacket(
      createPacket({ sessionId: id, fileId: FILE_A, index: 2, payload: new Uint8Array(4) }),
      expectations,
    );

    expect(result.outcome).toBe(RecoveryAcceptOutcome.Recovered);
    expect(engine.detectMissing(id)?.gaps[0]?.missingIndices).toEqual([4]);
  });

  it('does not bypass validation (§15.8, §15.14.6)', () => {
    const { engine, id } = makeActiveTransfer();

    const result = engine.acceptRecoveredPacket(
      createPacket({ sessionId: id, fileId: FILE_A, index: 2, payload: new Uint8Array(4) }),
      { sessionId: id, integrityVerified: false },
    );

    expect(result.outcome).toBe(RecoveryAcceptOutcome.Rejected);
    expect(engine.detectMissing(id)?.gaps[0]?.missingIndices).toEqual([2, 4]);
  });

  it('retains the first validated copy when a duplicate arrives (§15.11)', () => {
    const { engine, packets, id, expectations } = makeActiveTransfer();

    const result = engine.acceptRecoveredPacket(
      createPacket({
        sessionId: id,
        fileId: FILE_A,
        index: 0,
        payload: new Uint8Array(4).fill(9),
      }),
      expectations,
    );

    expect(result.outcome).toBe(RecoveryAcceptOutcome.Duplicate);
    // §15.14.2: recovery SHALL NOT modify validated packets.
    expect(packets.orderedPackets(id, FILE_A)[0]?.payload[0]).toBe(0);
  });

  it('never lets a recovery packet occupy a data packet position (§15.7)', () => {
    const { engine, packets, id, expectations } = makeActiveTransfer();

    const result = engine.acceptRecoveredPacket(
      createPacket({
        sessionId: id,
        fileId: FILE_A,
        index: 2,
        payload: new Uint8Array(4),
        type: PacketType.Recovery,
      }),
      expectations,
    );

    // OSP/1.0 has no forward error correction, so parity cannot be consumed.
    expect(result.outcome).toBe(RecoveryAcceptOutcome.Unusable);
    expect(packets.storedIndices(id, FILE_A)).toEqual([0, 1, 3, 5]);
  });

  it('preserves packet indices (§15.14.1)', () => {
    const { engine, packets, id, expectations } = makeActiveTransfer();

    engine.acceptRecoveredPacket(
      createPacket({ sessionId: id, fileId: FILE_A, index: 2, payload: new Uint8Array(4) }),
      expectations,
    );

    expect(packets.storedIndices(id, FILE_A)).toEqual([0, 1, 2, 3, 5]);
  });

  it('reports completion as soon as the last gap is filled (§15.9)', () => {
    const { engine, id, expectations } = makeActiveTransfer();

    const first = engine.acceptRecoveredPacket(
      createPacket({ sessionId: id, fileId: FILE_A, index: 2, payload: new Uint8Array(4) }),
      expectations,
    );
    expect(first.complete).toBe(false);

    const second = engine.acceptRecoveredPacket(
      createPacket({ sessionId: id, fileId: FILE_A, index: 4, payload: new Uint8Array(4) }),
      expectations,
    );

    expect(second.complete).toBe(true);
    expect(engine.isComplete(id)).toBe(true);
  });

  it('rejects a packet from another session (§15.14.8)', () => {
    const { engine, expectations } = makeActiveTransfer();

    const foreign = createPacket({
      sessionId: sessionId('99999999-9999-4999-8999-999999999999'),
      fileId: FILE_A,
      index: 2,
      payload: new Uint8Array(4),
    });

    expect(engine.acceptRecoveredPacket(foreign, expectations).outcome).toBe(
      RecoveryAcceptOutcome.Rejected,
    );
  });
});

describe('independence from resume (§15.12)', () => {
  it('both engines operate over the same transfer without interfering', () => {
    const { sessions, manifests, packets, id, expectations } = makeActiveTransfer();
    const recovery = createRecoveryEngine({ sessions, manifests, packets });
    const resume = createResumeEngine({ sessions, manifests, packets });

    // Recovery fills a gap while the session is active.
    recovery.acceptRecoveredPacket(
      createPacket({ sessionId: id, fileId: FILE_A, index: 2, payload: new Uint8Array(4) }),
      expectations,
    );

    // The transfer is then interrupted, and resume takes over.
    resume.pause(id);

    expect(resume.checkEligibility(id).valid).toBe(true);
    expect(resume.determineRemainingWork(id)?.missingPacketCount).toBe(1);
    // Recovery declines while paused; the two do not overlap in state.
    expect(recovery.checkEligibility(id).rejections).toContain(RecoveryRefusal.SessionNotActive);
  });

  it('recovery restores data while resume restores state', () => {
    const { sessions, manifests, packets, id } = makeActiveTransfer();
    const recovery = createRecoveryEngine({ sessions, manifests, packets });
    const resume = createResumeEngine({ sessions, manifests, packets });

    // Both see the same gaps, because both read the same packet map.
    expect(recovery.detectMissing(id)?.missingPacketCount).toBe(
      resume.determineRemainingWork(id)?.missingPacketCount,
    );
  });
});
