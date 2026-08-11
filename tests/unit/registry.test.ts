/**
 * Registries (TST-001) — TEST_SPEC §4, invariant §15.1.
 *
 * A registry owns *storage* of live protocol state; a manager owns the
 * semantics. These tests hold that line: they check ordering, replacement and
 * absence semantics, and nothing that a specification section governs. If a
 * test here needed to cite PROTOCOL_SPEC, the rule would be in the wrong file.
 *
 * The registries were reached only through their managers until now, which
 * meant their own guarantees — insertion order, `setIfAbsent` semantics, what
 * `delete` returns — were assumed rather than checked.
 */
import { createManifestRegistry } from '@core/registry/manifestRegistry';
import { createPacketRegistry, NO_FILE } from '@core/registry/packetRegistry';
import { createRegistry } from '@core/registry/registry';
import { createSessionRegistry } from '@core/registry/sessionRegistry';

import { createManifest } from '@domain/manifest';
import { createFileMetadata } from '@domain/fileMetadata';
import { fileId, protocolVersion, sessionId, type FileId, type SessionId } from '@domain/ids';
import { createPacket, PacketType } from '@domain/packet';
import { createSession, SessionState } from '@domain/session';

const SESSION_A = sessionId('11111111-1111-4111-8111-111111111111');
const SESSION_B = sessionId('22222222-2222-4222-8222-222222222222');
const FILE_A = fileId('f1000000-0000-4000-8000-000000000001');
const FILE_B = fileId('f1000000-0000-4000-8000-000000000002');

describe('createRegistry', () => {
  it('stores and retrieves by key', () => {
    const registry = createRegistry<string, number>();

    expect(registry.get('a')).toBeUndefined();
    expect(registry.has('a')).toBe(false);

    registry.set('a', 1);

    expect(registry.get('a')).toBe(1);
    expect(registry.has('a')).toBe(true);
    expect(registry.size()).toBe(1);
  });

  it('replaces on set', () => {
    const registry = createRegistry<string, number>();

    registry.set('a', 1);
    registry.set('a', 2);

    expect(registry.get('a')).toBe(2);
    // Replacing is not adding.
    expect(registry.size()).toBe(1);
  });

  it('refuses to overwrite through setIfAbsent', () => {
    const registry = createRegistry<string, number>();

    expect(registry.setIfAbsent('a', 1)).toBe(true);
    expect(registry.setIfAbsent('a', 2)).toBe(false);

    // The refusal must leave the original untouched, not merely report false.
    expect(registry.get('a')).toBe(1);
  });

  it('reports whether delete removed anything', () => {
    const registry = createRegistry<string, number>();
    registry.set('a', 1);

    expect(registry.delete('a')).toBe(true);
    expect(registry.delete('a')).toBe(false);
    expect(registry.size()).toBe(0);
  });

  it('preserves insertion order across keys, values and entries', () => {
    const registry = createRegistry<string, number>();

    registry.set('c', 3);
    registry.set('a', 1);
    registry.set('b', 2);

    expect(registry.keys()).toEqual(['c', 'a', 'b']);
    expect(registry.values()).toEqual([3, 1, 2]);
    expect(registry.entries()).toEqual([
      ['c', 3],
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('keeps a replaced key in its original position', () => {
    // Insertion order means first insertion, which is what a caller iterating
    // a registry during a transfer depends on.
    const registry = createRegistry<string, number>();

    registry.set('a', 1);
    registry.set('b', 2);
    registry.set('a', 9);

    expect(registry.keys()).toEqual(['a', 'b']);
  });

  it('hands out copies, so a caller cannot mutate the registry', () => {
    const registry = createRegistry<string, number>();
    registry.set('a', 1);

    const keys = registry.keys() as string[];
    keys.push('injected');

    expect(registry.keys()).toEqual(['a']);
  });

  it('empties on clear', () => {
    const registry = createRegistry<string, number>();
    registry.set('a', 1);
    registry.set('b', 2);

    registry.clear();

    expect(registry.size()).toBe(0);
    expect(registry.keys()).toEqual([]);
  });
});

describe('createSessionRegistry', () => {
  function session(id = SESSION_A) {
    return createSession({ id, protocolVersion: protocolVersion(1), createdAt: 1000 });
  }

  it('stores a session with its activity timestamp', () => {
    const registry = createSessionRegistry();
    const held = session();

    registry.record(held, 1500);

    expect(registry.getSession(SESSION_A)).toBe(held);
    expect(registry.get(SESSION_A)?.lastActivityAt).toBe(1500);
    expect(registry.has(SESSION_A)).toBe(true);
  });

  it('freezes the entry it stores', () => {
    const registry = createSessionRegistry();
    registry.record(session(), 1500);

    const entry = registry.get(SESSION_A)!;
    expect(Object.isFrozen(entry)).toBe(true);

    // Frozen writes fail silently outside strict mode, so the value is what
    // proves the freeze, not a thrown error.
    (entry as { lastActivityAt: number }).lastActivityAt = 9999;
    expect(registry.get(SESSION_A)?.lastActivityAt).toBe(1500);
  });

  it('replaces on record, so activity can be refreshed', () => {
    const registry = createSessionRegistry();

    registry.record(session(), 1500);
    registry.record(session(), 2500);

    expect(registry.get(SESSION_A)?.lastActivityAt).toBe(2500);
    expect(registry.size()).toBe(1);
  });

  it('refuses a duplicate id through recordIfAbsent (§8.17.2)', () => {
    const registry = createSessionRegistry();

    expect(registry.recordIfAbsent(session(), 1500)).toBe(true);
    expect(registry.recordIfAbsent(session(), 2500)).toBe(false);
    expect(registry.get(SESSION_A)?.lastActivityAt).toBe(1500);
  });

  it('lists sessions newest first and entries oldest first', () => {
    // The two orderings are deliberate and opposite; a change to either would
    // silently reverse a caller's iteration.
    const registry = createSessionRegistry();
    const first = session(SESSION_A);
    const second = session(SESSION_B);

    registry.record(first, 1000);
    registry.record(second, 2000);

    expect(registry.sessions()).toEqual([second, first]);
    expect(registry.entries().map((entry) => entry.session)).toEqual([first, second]);
  });

  it('forgets a session on delete', () => {
    const registry = createSessionRegistry();
    registry.record(session(), 1000);

    expect(registry.delete(SESSION_A)).toBe(true);
    expect(registry.getSession(SESSION_A)).toBeUndefined();
    expect(registry.delete(SESSION_A)).toBe(false);
  });

  it('empties on clear', () => {
    const registry = createSessionRegistry();
    registry.record(session(SESSION_A), 1000);
    registry.record(session(SESSION_B), 2000);

    registry.clear();

    expect(registry.size()).toBe(0);
    expect(registry.sessions()).toEqual([]);
  });

  it('holds a session in any state, since transitions are the manager’s concern', () => {
    const registry = createSessionRegistry();
    const completed = createSession({
      id: SESSION_A,
      protocolVersion: protocolVersion(1),
      createdAt: 1000,
      state: SessionState.Completed,
    });

    registry.record(completed, 1000);

    expect(registry.getSession(SESSION_A)?.state).toBe(SessionState.Completed);
  });
});

describe('createManifestRegistry', () => {
  function manifest(id = SESSION_A) {
    return createManifest({
      sessionId: id,
      protocolVersion: protocolVersion(1),
      createdAt: 1000,
      entries: [
        {
          file: createFileMetadata({ id: FILE_A, name: 'a.bin', size: 10, hash: 'aa' }),
          packetCount: 1,
        },
      ],
      configuration: {
        packetSize: 128,
        recoveryMethod: 'NATURAL_REPETITION',
        integrityAlgorithm: 'TEST',
        transportCapabilities: ['QR'],
      },
    });
  }

  it('keys a manifest by its own session id', () => {
    // The caller passes no key: taking it from the manifest is what makes a
    // manifest filed under the wrong session impossible.
    const registry = createManifestRegistry();
    const held = manifest();

    registry.set(held);

    expect(registry.get(SESSION_A)).toBe(held);
    expect(registry.get(SESSION_B)).toBeUndefined();
  });

  it('refuses to replace through setIfAbsent (§10.9)', () => {
    const registry = createManifestRegistry();
    const first = manifest();

    expect(registry.setIfAbsent(first)).toBe(true);
    expect(registry.setIfAbsent(manifest())).toBe(false);
    expect(registry.get(SESSION_A)).toBe(first);
  });

  it('reports size, values and deletion', () => {
    const registry = createManifestRegistry();

    registry.set(manifest(SESSION_A));
    registry.set(manifest(SESSION_B));

    expect(registry.size()).toBe(2);
    expect(registry.values().map((held) => held.sessionId)).toEqual([SESSION_A, SESSION_B]);
    expect(registry.has(SESSION_A)).toBe(true);

    expect(registry.delete(SESSION_A)).toBe(true);
    expect(registry.has(SESSION_A)).toBe(false);
    expect(registry.size()).toBe(1);

    registry.clear();
    expect(registry.size()).toBe(0);
  });
});

describe('createPacketRegistry', () => {
  function packet(session: SessionId, file: FileId, index: number, marker = index) {
    return createPacket({
      sessionId: session,
      fileId: file,
      index,
      payload: Uint8Array.from([marker, marker + 1, marker + 2]),
    });
  }

  it('keeps packets of different files apart (§13.13)', () => {
    // Index 0 of one file and index 0 of another are different packets. A
    // registry that keyed on index alone would lose one.
    const registry = createPacketRegistry();

    registry.store(packet(SESSION_A, FILE_A, 0, 1));
    registry.store(packet(SESSION_A, FILE_B, 0, 2));

    expect(registry.get(SESSION_A, FILE_A, 0)?.payload[0]).toBe(1);
    expect(registry.get(SESSION_A, FILE_B, 0)?.payload[0]).toBe(2);
  });

  it('keeps packets of different sessions apart', () => {
    const registry = createPacketRegistry();

    registry.store(packet(SESSION_A, FILE_A, 0, 1));
    registry.store(packet(SESSION_B, FILE_A, 0, 2));

    expect(registry.get(SESSION_A, FILE_A, 0)?.payload[0]).toBe(1);
    expect(registry.get(SESSION_B, FILE_A, 0)?.payload[0]).toBe(2);
  });

  it('refuses to overwrite a stored position (§11.13)', () => {
    const registry = createPacketRegistry();

    expect(registry.store(packet(SESSION_A, FILE_A, 0, 1))).toBe(true);
    expect(registry.store(packet(SESSION_A, FILE_A, 0, 2))).toBe(false);

    // The refusal must preserve the first copy — this is the guarantee that
    // makes a late duplicate harmless.
    expect(registry.get(SESSION_A, FILE_A, 0)?.payload[0]).toBe(1);
  });

  it('counts what it holds per file', () => {
    const registry = createPacketRegistry();

    registry.store(packet(SESSION_A, FILE_A, 0));
    registry.store(packet(SESSION_A, FILE_A, 1));
    registry.store(packet(SESSION_A, FILE_B, 0));

    expect(registry.count(SESSION_A, FILE_A)).toBe(2);
    expect(registry.count(SESSION_A, FILE_B)).toBe(1);
    expect(registry.count(SESSION_B, FILE_A)).toBe(0);
  });

  it('returns packets in index order regardless of arrival order (§11.10)', () => {
    const registry = createPacketRegistry();

    registry.store(packet(SESSION_A, FILE_A, 2));
    registry.store(packet(SESSION_A, FILE_A, 0));
    registry.store(packet(SESSION_A, FILE_A, 1));

    expect(registry.indices(SESSION_A, FILE_A)).toEqual([0, 1, 2]);
    expect(registry.ordered(SESSION_A, FILE_A).map((held) => held.index)).toEqual([0, 1, 2]);
  });

  it('files a manifest packet under the no-file sentinel (§10.1)', () => {
    const registry = createPacketRegistry();

    registry.store(
      createPacket({
        sessionId: SESSION_A,
        type: PacketType.Manifest,
        index: 0,
        payload: Uint8Array.from([9]),
      }),
    );

    expect(registry.get(SESSION_A, NO_FILE, 0)?.type).toBe(PacketType.Manifest);
    expect(registry.files(SESSION_A)).toContain(NO_FILE);
  });

  it('lists the sessions and files it holds', () => {
    const registry = createPacketRegistry();

    registry.store(packet(SESSION_A, FILE_A, 0));
    registry.store(packet(SESSION_A, FILE_B, 0));
    registry.store(packet(SESSION_B, FILE_A, 0));

    expect(registry.sessions()).toEqual([SESSION_A, SESSION_B]);
    expect(registry.files(SESSION_A)).toEqual([FILE_A, FILE_B]);
    expect(registry.size()).toBe(3);
  });

  it('releases one file without touching the rest', () => {
    const registry = createPacketRegistry();

    registry.store(packet(SESSION_A, FILE_A, 0));
    registry.store(packet(SESSION_A, FILE_A, 1));
    registry.store(packet(SESSION_A, FILE_B, 0));

    expect(registry.releaseFile(SESSION_A, FILE_A)).toBe(2);
    expect(registry.count(SESSION_A, FILE_A)).toBe(0);
    expect(registry.count(SESSION_A, FILE_B)).toBe(1);
  });

  it('releases everything for a session at once (§11.19)', () => {
    const registry = createPacketRegistry();

    registry.store(packet(SESSION_A, FILE_A, 0));
    registry.store(packet(SESSION_A, FILE_B, 0));
    registry.store(packet(SESSION_B, FILE_A, 0));

    expect(registry.releaseSession(SESSION_A)).toBe(2);

    expect(registry.count(SESSION_A, FILE_A)).toBe(0);
    expect(registry.count(SESSION_A, FILE_B)).toBe(0);
    // Another session's packets are untouched.
    expect(registry.count(SESSION_B, FILE_A)).toBe(1);
  });

  it('empties on clear', () => {
    const registry = createPacketRegistry();
    registry.store(packet(SESSION_A, FILE_A, 0));

    registry.clear();

    expect(registry.size()).toBe(0);
    expect(registry.sessions()).toEqual([]);
  });
});
