/**
 * ResumeEngine (PRO-004) — PROTOCOL_SPEC §14.
 *
 * Integration rather than unit: resume is defined in terms of what the
 * session, manifest and packet managers already hold, so the engine is
 * exercised against real ones rather than mocks. Everything stays
 * deterministic — the clock and id generator are injected.
 */
import type { Clock, IdGenerator } from '@core/contracts';
import { createManifestManager } from '@core/manifest/manifestManager';
import { createPacketManager } from '@core/packet/packetManager';
import { createResumeEngine, ResumeRefusal } from '@core/resume/resumeEngine';
import { createSessionManager, DEFAULT_SESSION_TIMEOUT_MS } from '@core/session/sessionManager';
import { createFileMetadata } from '@domain/fileMetadata';
import { fileId, protocolVersion, sessionId } from '@domain/ids';
import { NONE, type ManifestConfiguration } from '@domain/manifest';
import { createPacket } from '@domain/packet';
import { SessionState } from '@domain/session';

const VERSION = protocolVersion(1);
const FILE_A = fileId('f1000000-0000-4000-8000-000000000001');
const FILE_B = fileId('f1000000-0000-4000-8000-000000000002');

const configuration: ManifestConfiguration = {
  packetSize: 4,
  recoveryMethod: NONE,
  integrityAlgorithm: 'SHA-256',
  transportCapabilities: ['QR'],
};

const fileA = createFileMetadata({ id: FILE_A, name: 'a.bin', size: 12, hash: 'hash-a' });
const fileB = createFileMetadata({ id: FILE_B, name: 'b.bin', size: 8, hash: 'hash-b' });

function makeClock(start = 1_700_000_000_000): Clock & { advance(ms: number): void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
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
 * Builds a transfer paused partway through.
 *
 * File A expects 3 packets and has 0 and 2; file B expects 2 and has both. So
 * A is missing index 1, and B is complete — the §14.14 case.
 */
function makePausedTransfer(options: { readonly storePackets?: boolean } = {}) {
  const clock = makeClock();
  const sessions = createSessionManager({
    clock,
    idGenerator: makeIds(),
    protocolVersion: VERSION,
  });
  const manifests = createManifestManager();
  const packets = createPacketManager();
  const engine = createResumeEngine({ sessions, manifests, packets });

  const session = sessions.createSession();
  const id = session.id;

  const manifest = manifests.createManifest({
    sessionId: id,
    protocolVersion: VERSION,
    createdAt: clock.now(),
    files: [fileA, fileB],
    configuration,
  });
  manifests.accept(manifest);

  sessions.transition(id, SessionState.Waiting);
  sessions.transition(id, SessionState.Handshake);
  sessions.transition(id, SessionState.Active);

  if (options.storePackets !== false) {
    const expectations = { sessionId: id, integrityVerified: true };

    for (const index of [0, 2]) {
      packets.accept(
        createPacket({ sessionId: id, fileId: FILE_A, index, payload: new Uint8Array(4) }),
        expectations,
      );
    }
    for (const index of [0, 1]) {
      packets.accept(
        createPacket({ sessionId: id, fileId: FILE_B, index, payload: new Uint8Array(4) }),
        expectations,
      );
    }
  }

  engine.pause(id);

  return { clock, sessions, manifests, packets, engine, id, manifest };
}

describe('pause (§14.5, §14.6)', () => {
  it('moves an active session to Paused', () => {
    const { sessions, id } = makePausedTransfer();

    expect(sessions.getSession(id)?.state).toBe(SessionState.Paused);
  });

  it('keeps packet buffers intact (§14.6)', () => {
    const { packets, id } = makePausedTransfer();

    expect(packets.storedCount(id, FILE_A)).toBe(2);
    expect(packets.storedCount(id, FILE_B)).toBe(2);
  });

  it('keeps the manifest available (§14.5)', () => {
    const { manifests, id } = makePausedTransfer();

    expect(manifests.getManifest(id)).toBeDefined();
  });

  it('refuses to pause a session that is not active', () => {
    const { engine, id } = makePausedTransfer();

    // Already paused; §26.4 has no Paused -> Paused edge.
    expect(engine.pause(id)).toBe(false);
  });
});

describe('checkEligibility (§14.4)', () => {
  it('accepts a paused session with a validated manifest and preserved packets', () => {
    const { engine, id } = makePausedTransfer();

    expect(engine.checkEligibility(id).valid).toBe(true);
  });

  it('refuses an unknown session', () => {
    const { engine } = makePausedTransfer();
    const result = engine.checkEligibility(sessionId('99999999-9999-4999-8999-999999999999'));

    expect(result.rejections).toContain(ResumeRefusal.UnknownSession);
  });

  it('refuses after session expiration (§14.4, §14.12)', () => {
    const { engine, sessions, clock, id } = makePausedTransfer();

    clock.advance(DEFAULT_SESSION_TIMEOUT_MS + 1);
    sessions.expireIdleSessions();

    expect(engine.checkEligibility(id).rejections).toContain(ResumeRefusal.SessionExpired);
  });

  it('refuses a session that was never paused (§14.3)', () => {
    const clock = makeClock();
    const sessions = createSessionManager({
      clock,
      idGenerator: makeIds(),
      protocolVersion: VERSION,
    });
    const manifests = createManifestManager();
    const engine = createResumeEngine({
      sessions,
      manifests,
      packets: createPacketManager(),
    });

    const session = sessions.createSession();
    manifests.accept(
      manifests.createManifest({
        sessionId: session.id,
        protocolVersion: VERSION,
        createdAt: clock.now(),
        files: [fileA],
        configuration,
      }),
    );

    expect(engine.checkEligibility(session.id).rejections).toContain(
      ResumeRefusal.SessionNotResumable,
    );
  });

  it('refuses when no manifest has been validated (§14.4)', () => {
    const clock = makeClock();
    const sessions = createSessionManager({
      clock,
      idGenerator: makeIds(),
      protocolVersion: VERSION,
    });
    const engine = createResumeEngine({
      sessions,
      manifests: createManifestManager(),
      packets: createPacketManager(),
    });

    const session = sessions.createSession();
    sessions.transition(session.id, SessionState.Waiting);
    sessions.transition(session.id, SessionState.Handshake);
    sessions.transition(session.id, SessionState.Active);
    sessions.transition(session.id, SessionState.Paused);

    expect(engine.checkEligibility(session.id).rejections).toContain(ResumeRefusal.ManifestMissing);
  });

  it('refuses an incompatible protocol version (§14.4)', () => {
    const { sessions, manifests, packets, id } = makePausedTransfer();
    const engine = createResumeEngine({ sessions, manifests, packets, supportedVersions: [9] });

    expect(engine.checkEligibility(id).rejections).toContain(ResumeRefusal.VersionMismatch);
  });

  it('refuses when the packet map holds an index the manifest cannot explain (§14.7.4)', () => {
    const { packets, id, engine } = makePausedTransfer();

    // Stored without the manifest's expected counts, as a diverged map would
    // look: an index beyond what the manifest declares for this file.
    packets.accept(
      createPacket({ sessionId: id, fileId: FILE_A, index: 99, payload: new Uint8Array(4) }),
      { sessionId: id, integrityVerified: true },
    );

    expect(engine.checkEligibility(id).rejections).toContain(ResumeRefusal.PacketMapCorrupt);
  });

  it('reports every reason, not just the first', () => {
    const { sessions, manifests, packets, clock, id } = makePausedTransfer();
    const engine = createResumeEngine({ sessions, manifests, packets, supportedVersions: [9] });

    clock.advance(DEFAULT_SESSION_TIMEOUT_MS + 1);
    sessions.expireIdleSessions();

    expect(engine.checkEligibility(id).rejections).toEqual(
      expect.arrayContaining([ResumeRefusal.SessionExpired, ResumeRefusal.VersionMismatch]),
    );
  });
});

describe('determineRemainingWork (§14.8, §14.14)', () => {
  it('reports only the missing indices', () => {
    const { engine, id } = makePausedTransfer();
    const work = engine.determineRemainingWork(id);

    // File A holds 0 and 2 of 3, so only index 1 remains — the §14.8 example.
    expect(work?.files.find((file) => file.fileId === FILE_A)?.missingIndices).toEqual([1]);
  });

  it('preserves the packet map independently per file (§14.14)', () => {
    const { engine, id } = makePausedTransfer();
    const work = engine.determineRemainingWork(id);

    expect(work?.files.find((file) => file.fileId === FILE_B)?.complete).toBe(true);
    expect(work?.files.find((file) => file.fileId === FILE_A)?.complete).toBe(false);
  });

  it('lists only incomplete files as needing packets (§14.14)', () => {
    const { engine, id } = makePausedTransfer();

    expect(engine.determineRemainingWork(id)?.incompleteFiles).toEqual([FILE_A]);
  });

  it('counts the packets still required', () => {
    const { engine, id } = makePausedTransfer();

    expect(engine.determineRemainingWork(id)?.missingPacketCount).toBe(1);
  });

  it('reports every packet missing when nothing was collected', () => {
    const { engine, id } = makePausedTransfer({ storePackets: false });
    const work = engine.determineRemainingWork(id);

    expect(work?.missingPacketCount).toBe(5);
    expect(work?.complete).toBe(false);
  });

  it('reports completeness once every packet is held', () => {
    const { engine, packets, id } = makePausedTransfer();

    packets.accept(
      createPacket({ sessionId: id, fileId: FILE_A, index: 1, payload: new Uint8Array(4) }),
      { sessionId: id, integrityVerified: true },
    );

    expect(engine.determineRemainingWork(id)?.complete).toBe(true);
  });

  it('returns undefined without a manifest', () => {
    const { engine, manifests, id } = makePausedTransfer();
    manifests.release(id);

    expect(engine.determineRemainingWork(id)).toBeUndefined();
  });

  it('is frozen', () => {
    const { engine, id } = makePausedTransfer();

    expect(Object.isFrozen(engine.determineRemainingWork(id))).toBe(true);
  });
});

describe('requestResume (§14.7)', () => {
  it('moves the session Paused -> Resuming', () => {
    const { engine, sessions, id } = makePausedTransfer();

    expect(engine.requestResume(id).ok).toBe(true);
    expect(sessions.getSession(id)?.state).toBe(SessionState.Resuming);
  });

  it('continues the existing session rather than creating one (§14.17.1, §14.17.3)', () => {
    const { engine, sessions, id } = makePausedTransfer();
    const before = sessions.listSessions().length;
    const result = engine.requestResume(id);

    expect(result.ok && result.session.id).toBe(id);
    expect(sessions.listSessions()).toHaveLength(before);
  });

  it('returns the remaining work (§14.8)', () => {
    const { engine, id } = makePausedTransfer();
    const result = engine.requestResume(id);

    expect(result.ok && result.remaining.missingPacketCount).toBe(1);
  });

  it('inherits security and protocol parameters unchanged (§14.15)', () => {
    const { engine, id, manifest } = makePausedTransfer();
    const result = engine.requestResume(id);

    expect(result.ok && result.preserved).toEqual({
      sessionId: id,
      protocolVersion: VERSION,
      integrityAlgorithm: manifest.configuration.integrityAlgorithm,
      perFileAlgorithms: {
        [FILE_A]: { compression: NONE, encryption: NONE },
        [FILE_B]: { compression: NONE, encryption: NONE },
      },
    });
  });

  it('preserves validated packets across the request (§14.17.2)', () => {
    const { engine, packets, id } = makePausedTransfer();

    engine.requestResume(id);

    expect(packets.storedIndices(id, FILE_A)).toEqual([0, 2]);
  });

  it('terminates the session when validation fails (§14.7, §14.13)', () => {
    const { sessions, manifests, packets, id } = makePausedTransfer();
    const engine = createResumeEngine({ sessions, manifests, packets, supportedVersions: [9] });

    const result = engine.requestResume(id);

    expect(result.ok).toBe(false);
    expect(sessions.getSession(id)?.state).toBe(SessionState.Expired);
  });

  it('releases packet storage when validation fails (§14.13)', () => {
    const { sessions, manifests, packets, id } = makePausedTransfer();
    const engine = createResumeEngine({ sessions, manifests, packets, supportedVersions: [9] });

    engine.requestResume(id);

    expect(packets.storedCount(id, FILE_A)).toBe(0);
  });

  it('refuses an unknown session without side effects', () => {
    const { engine } = makePausedTransfer();
    const result = engine.requestResume(sessionId('99999999-9999-4999-8999-999999999999'));

    expect(result.ok).toBe(false);
  });

  it('is idempotent for a session already resuming', () => {
    const { engine, id } = makePausedTransfer();

    engine.requestResume(id);
    const second = engine.requestResume(id);

    expect(second.ok).toBe(true);
  });
});

describe('completeResume (§14.3)', () => {
  it('returns the session to Active', () => {
    const { engine, sessions, id } = makePausedTransfer();

    engine.requestResume(id);
    const result = engine.completeResume(id);

    expect(result.ok).toBe(true);
    expect(sessions.getSession(id)?.state).toBe(SessionState.Active);
  });

  it('refuses when no resume was requested', () => {
    const { engine, id } = makePausedTransfer();
    const result = engine.completeResume(id);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.validation.rejections).toContain(ResumeRefusal.SessionNotResumable);
    }
  });

  it('refuses an unknown session', () => {
    const { engine } = makePausedTransfer();
    const result = engine.completeResume(sessionId('99999999-9999-4999-8999-999999999999'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.validation.rejections).toContain(ResumeRefusal.UnknownSession);
    }
  });

  it('keeps packet indices unchanged after resume (§14.17.4)', () => {
    const { engine, packets, id } = makePausedTransfer();

    engine.requestResume(id);
    engine.completeResume(id);

    expect(packets.storedIndices(id, FILE_A)).toEqual([0, 2]);
  });

  it('lets collection continue afterwards, ignoring duplicates (§14.10)', () => {
    const { engine, packets, id } = makePausedTransfer();

    engine.requestResume(id);
    engine.completeResume(id);

    const expectations = { sessionId: id, integrityVerified: true };

    // The missing packet arrives.
    packets.accept(
      createPacket({ sessionId: id, fileId: FILE_A, index: 1, payload: new Uint8Array(4) }),
      expectations,
    );
    // A duplicate arrives and is ignored (§14.10, §14.17.5).
    const duplicate = packets.accept(
      createPacket({ sessionId: id, fileId: FILE_A, index: 0, payload: new Uint8Array(4) }),
      expectations,
    );

    expect(duplicate.outcome).toBe('DUPLICATE');
    expect(engine.determineRemainingWork(id)?.complete).toBe(true);
  });
});

describe('scope', () => {
  it('performs no recovery — it reports what is missing and stops', () => {
    const { engine, packets, id } = makePausedTransfer();

    const work = engine.determineRemainingWork(id);

    // Recovery (§15) would obtain index 1; resume only names it.
    expect(work?.files.find((file) => file.fileId === FILE_A)?.missingIndices).toEqual([1]);
    expect(packets.storedCount(id, FILE_A)).toBe(2);
  });

  it('performs no reconstruction — completeness is reported, not acted on (§14.11)', () => {
    const { engine, packets, id } = makePausedTransfer();

    packets.accept(
      createPacket({ sessionId: id, fileId: FILE_A, index: 1, payload: new Uint8Array(4) }),
      { sessionId: id, integrityVerified: true },
    );

    const work = engine.determineRemainingWork(id);

    expect(work?.complete).toBe(true);
    // Packets remain individually stored; nothing was assembled.
    expect(packets.storedIndices(id, FILE_A)).toEqual([0, 1, 2]);
  });

  it('holds no state of its own — two engines over the same managers agree', () => {
    const { sessions, manifests, packets, id } = makePausedTransfer();

    const first = createResumeEngine({ sessions, manifests, packets });
    const second = createResumeEngine({ sessions, manifests, packets });

    expect(first.determineRemainingWork(id)).toEqual(second.determineRemainingWork(id));
  });
});
