/**
 * ManifestManager (PRO-002) — PROTOCOL_SPEC §10; docs/API_SPEC.md §6.
 */
import { createManifestManager, ManifestRejection, packetsFor } from '@core/manifest/index';
import { AppError } from '@core/errors';
import { createFileMetadata } from '@domain/fileMetadata';
import { fileId, protocolVersion, sessionId } from '@domain/ids';
import { NONE, type ManifestConfiguration } from '@domain/manifest';

const SESSION = sessionId('11111111-1111-4111-8111-111111111111');
const OTHER_SESSION = sessionId('22222222-2222-4222-8222-222222222222');
const FILE_A = fileId('f1000000-0000-4000-8000-000000000001');
const FILE_B = fileId('f1000000-0000-4000-8000-000000000002');
const VERSION = protocolVersion(1);
const CREATED_AT = 1_700_000_000_000;

const configuration: ManifestConfiguration = {
  packetSize: 512,
  recoveryMethod: NONE,
  integrityAlgorithm: 'SHA-256',
  transportCapabilities: ['QR'],
};

const fileA = createFileMetadata({ id: FILE_A, name: 'a.jpg', size: 1024, hash: 'hash-a' });
const fileB = createFileMetadata({ id: FILE_B, name: 'b.pdf', size: 100, hash: 'hash-b' });

const baseInput = {
  sessionId: SESSION,
  protocolVersion: VERSION,
  createdAt: CREATED_AT,
  files: [fileA, fileB],
  configuration,
};

/** Expectations that pass, so each test can vary one thing. */
const passing = { expectedSessionId: SESSION, integrityVerified: true };

describe('packetsFor', () => {
  it.each([
    [0, 512, 0],
    [1, 512, 1],
    [512, 512, 1],
    [513, 512, 2],
    [1024, 512, 2],
  ])('divides %p bytes into %p-byte packets as %p', (size, packetSize, expected) => {
    expect(packetsFor(size, packetSize)).toBe(expected);
  });

  it('gives an empty file zero packets — there is nothing to carry (§3.8)', () => {
    expect(packetsFor(0, 512)).toBe(0);
  });

  it.each([0, -1, 1.5])('rejects a packet size of %p', (packetSize) => {
    expect(() => packetsFor(100, packetSize)).toThrow(AppError);
  });
});

describe('createManifest (§10.5, API_SPEC §6)', () => {
  it('describes every file it was given (§10.15.3)', () => {
    const manifest = createManifestManager().createManifest(baseInput);

    expect(manifest.fileCount).toBe(2);
    expect(manifest.entries.map((entry) => entry.file.id)).toEqual([FILE_A, FILE_B]);
  });

  it('derives packet counts from file size and packet size', () => {
    const manifest = createManifestManager().createManifest(baseInput);

    expect(manifest.entries[0]?.packetCount).toBe(2);
    expect(manifest.entries[1]?.packetCount).toBe(1);
    expect(manifest.totalPacketCount).toBe(3);
  });

  it('sums the transfer size', () => {
    expect(createManifestManager().createManifest(baseInput).totalSize).toBe(1124);
  });

  it('defaults compression and encryption to NONE', () => {
    const manifest = createManifestManager().createManifest(baseInput);

    expect(manifest.entries[0]?.compression).toBe(NONE);
    expect(manifest.entries[0]?.encryption).toBe(NONE);
  });

  it('accepts an explicit packet count, since a compressed stream is not the original bytes', () => {
    const manifest = createManifestManager().createManifest({
      ...baseInput,
      perFile: { [FILE_A]: { packetCount: 1, compression: 'GZIP' } },
    });

    expect(manifest.entries[0]?.packetCount).toBe(1);
    expect(manifest.entries[0]?.compression).toBe('GZIP');
    expect(manifest.totalPacketCount).toBe(2);
  });

  it('produces an immutable manifest (§10.9)', () => {
    const manifest = createManifestManager().createManifest(baseInput);

    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.entries)).toBe(true);
  });

  it('is deterministic — no clock is read', () => {
    const manager = createManifestManager();

    expect(manager.createManifest(baseInput)).toEqual(manager.createManifest(baseInput));
  });

  it('carries no payload data (§10.1)', () => {
    const serialized = JSON.stringify(createManifestManager().createManifest(baseInput));

    expect(serialized).toContain('hash-a');
    expect(serialized).not.toContain('payload');
  });

  it('rejects duplicate file ids (§10.15.5)', () => {
    expect(() =>
      createManifestManager().createManifest({ ...baseInput, files: [fileA, fileA] }),
    ).toThrow(AppError);
  });

  it('rejects a manifest describing no files', () => {
    expect(() => createManifestManager().createManifest({ ...baseInput, files: [] })).toThrow(
      AppError,
    );
  });

  it('shares session, version and transport configuration across files (§10.11)', () => {
    const manifest = createManifestManager().createManifest(baseInput);

    expect(manifest.sessionId).toBe(SESSION);
    expect(manifest.protocolVersion).toBe(VERSION);
    expect(manifest.configuration.transportCapabilities).toEqual(['QR']);
  });
});

describe('validateManifest (§10.7, §10.13)', () => {
  const manager = createManifestManager();
  const manifest = manager.createManifest(baseInput);

  it('accepts a well-formed manifest', () => {
    expect(manager.validateManifest(manifest, passing).valid).toBe(true);
  });

  it('rejects a manifest from another session (§10.7.1)', () => {
    const result = manager.validateManifest(manifest, {
      ...passing,
      expectedSessionId: OTHER_SESSION,
    });

    expect(result.valid).toBe(false);
    expect(result.rejections).toContain(ManifestRejection.ForeignSession);
  });

  it('rejects an unsupported protocol version (§10.7.2)', () => {
    const result = manager.validateManifest(manifest, { ...passing, supportedVersions: [2] });

    expect(result.rejections).toContain(ManifestRejection.UnsupportedVersion);
  });

  it('rejects a manifest whose integrity did not verify (§10.7.3, §10.8)', () => {
    const result = manager.validateManifest(manifest, { ...passing, integrityVerified: false });

    expect(result.rejections).toContain(ManifestRejection.IntegrityFailed);
  });

  it('rejects an unsupported compression method (§10.7.7)', () => {
    const compressed = manager.createManifest({
      ...baseInput,
      perFile: { [FILE_A]: { compression: 'BROTLI' } },
    });

    const result = manager.validateManifest(compressed, {
      ...passing,
      supportedCompression: ['GZIP'],
    });

    expect(result.rejections).toContain(ManifestRejection.UnsupportedAlgorithm);
  });

  it('treats NONE as universally supported', () => {
    expect(
      manager.validateManifest(manifest, {
        ...passing,
        supportedCompression: [],
        supportedEncryption: [],
        supportedIntegrity: ['SHA-256'],
      }).valid,
    ).toBe(true);
  });

  it('rejects an unsupported integrity algorithm (§10.7.7)', () => {
    const result = manager.validateManifest(manifest, {
      ...passing,
      supportedIntegrity: ['SHA-512'],
    });

    expect(result.rejections).toContain(ManifestRejection.UnsupportedAlgorithm);
  });

  it('detects an inconsistent packet count (§10.7.5, §10.13)', () => {
    // Reaching past the factory, which cannot produce this — the check exists
    // for manifests that arrived from another device.
    const tampered = { ...manifest, totalPacketCount: 99 };

    expect(manager.validateManifest(tampered, passing).rejections).toContain(
      ManifestRejection.BadPacketCount,
    );
  });

  it('detects an inconsistent file count (§10.7.4)', () => {
    const tampered = { ...manifest, fileCount: 5 };

    expect(manager.validateManifest(tampered, passing).rejections).toContain(
      ManifestRejection.BadFileCount,
    );
  });

  it('detects invalid file metadata (§10.7.6)', () => {
    const tampered = {
      ...manifest,
      entries: [{ ...manifest.entries[0]!, packetCount: -1 }],
      fileCount: 1,
      totalPacketCount: -1,
      totalSize: 1024,
    };

    expect(manager.validateManifest(tampered, passing).rejections).toContain(
      ManifestRejection.BadFileMetadata,
    );
  });

  it('reports every failure, not just the first', () => {
    const result = manager.validateManifest(manifest, {
      expectedSessionId: OTHER_SESSION,
      integrityVerified: false,
      supportedVersions: [9],
    });

    expect(result.rejections).toEqual(
      expect.arrayContaining([
        ManifestRejection.ForeignSession,
        ManifestRejection.IntegrityFailed,
        ManifestRejection.UnsupportedVersion,
      ]),
    );
  });
});

describe('parseManifest (§10.7, §10.12)', () => {
  const manager = createManifestManager();

  const wireForm = {
    sessionId: SESSION,
    protocolVersion: 1,
    createdAt: CREATED_AT,
    configuration: {
      packetSize: 512,
      recoveryMethod: NONE,
      integrityAlgorithm: 'SHA-256',
      transportCapabilities: ['QR'],
    },
    entries: [
      {
        file: { id: FILE_A, name: 'a.jpg', size: 1024, hash: 'hash-a' },
        packetCount: 2,
        compression: NONE,
        encryption: NONE,
      },
    ],
  };

  it('produces a manifest from a well-formed structure', () => {
    const result = manager.parseManifest(wireForm, passing);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.sessionId).toBe(SESSION);
      expect(result.manifest.entries).toHaveLength(1);
      expect(result.manifest.totalPacketCount).toBe(2);
    }
  });

  it('ignores unknown optional fields (§10.12)', () => {
    const withExtras = {
      ...wireForm,
      futureField: 'ignored',
      entries: [{ ...wireForm.entries[0], futureEntryField: 42 }],
    };

    const result = manager.parseManifest(withExtras, passing);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.manifest)).not.toContain('futureField');
    }
  });

  it('produces a frozen manifest', () => {
    const result = manager.parseManifest(wireForm, passing);

    expect(result.ok && Object.isFrozen(result.manifest)).toBe(true);
  });

  it('round-trips a manifest it created', () => {
    const created = manager.createManifest(baseInput);
    const result = manager.parseManifest(JSON.parse(JSON.stringify(created)), passing);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest).toEqual(created);
    }
  });

  it.each([
    ['a missing session id', { sessionId: undefined }, ManifestRejection.BadSessionId],
    ['a non-UUID session id', { sessionId: 'session-1' }, ManifestRejection.BadSessionId],
    ['a missing version', { protocolVersion: undefined }, ManifestRejection.UnsupportedVersion],
    ['a missing timestamp', { createdAt: undefined }, ManifestRejection.MissingField],
    ['no entries', { entries: [] }, ManifestRejection.BadFileCount],
    ['a missing configuration', { configuration: undefined }, ManifestRejection.BadConfiguration],
  ])('rejects %s (§10.13)', (_label, change, expected) => {
    const result = manager.parseManifest({ ...wireForm, ...change }, passing);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.validation.rejections).toContain(expected);
    }
  });

  it('rejects malformed file metadata (§10.7.6)', () => {
    const result = manager.parseManifest(
      { ...wireForm, entries: [{ file: { id: FILE_A, name: '' }, packetCount: 1 }] },
      passing,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.validation.rejections).toContain(ManifestRejection.BadFileMetadata);
    }
  });

  it('rejects duplicate file ids (§10.15.5)', () => {
    const result = manager.parseManifest(
      { ...wireForm, entries: [wireForm.entries[0], wireForm.entries[0]] },
      passing,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.validation.rejections).toContain(ManifestRejection.DuplicateFileId);
    }
  });

  it.each([null, undefined, 42, 'a string', []])('rejects %p rather than throwing', (value) => {
    const result = manager.parseManifest(value, passing);

    expect(result.ok).toBe(false);
  });

  it("applies the receiver's expectations to a parsed manifest", () => {
    const result = manager.parseManifest(wireForm, {
      ...passing,
      expectedSessionId: OTHER_SESSION,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.validation.rejections).toContain(ManifestRejection.ForeignSession);
    }
  });
});

describe('retention and lookup (§10.9, §10.14)', () => {
  it('retains an accepted manifest for its session', () => {
    const manager = createManifestManager();
    const manifest = manager.createManifest(baseInput);

    expect(manager.accept(manifest)).toBe(true);
    expect(manager.getManifest(SESSION)).toEqual(manifest);
    expect(manager.hasManifest(SESSION)).toBe(true);
  });

  it('refuses to replace an accepted manifest (§10.9, §10.14)', () => {
    const manager = createManifestManager();
    const first = manager.createManifest(baseInput);
    const second = manager.createManifest({ ...baseInput, files: [fileA] });

    manager.accept(first);

    // The manifest SHALL NOT be regenerated during an active session.
    expect(manager.accept(second)).toBe(false);
    expect(manager.getManifest(SESSION)).toEqual(first);
  });

  it('keeps sessions independent (§10.11, §8.12)', () => {
    const manager = createManifestManager();
    manager.accept(manager.createManifest(baseInput));
    manager.accept(manager.createManifest({ ...baseInput, sessionId: OTHER_SESSION }));

    expect(manager.getManifest(SESSION)?.sessionId).toBe(SESSION);
    expect(manager.getManifest(OTHER_SESSION)?.sessionId).toBe(OTHER_SESSION);
  });

  it('returns undefined for a session with no manifest', () => {
    const manager = createManifestManager();

    expect(manager.getManifest(SESSION)).toBeUndefined();
    expect(manager.hasManifest(SESSION)).toBe(false);
  });

  it('releases a manifest when its session ends', () => {
    const manager = createManifestManager();
    manager.accept(manager.createManifest(baseInput));

    expect(manager.release(SESSION)).toBe(true);
    expect(manager.getManifest(SESSION)).toBeUndefined();
    expect(manager.release(SESSION)).toBe(false);
  });
});

describe('lookup within a manifest (§10.6)', () => {
  const manager = createManifestManager();
  const manifest = manager.createManifest(baseInput);

  it('finds an entry by file id', () => {
    expect(manager.getEntry(manifest, FILE_B)?.file.name).toBe('b.pdf');
  });

  it('returns undefined for a file the manifest does not describe', () => {
    expect(
      manager.getEntry(manifest, fileId('f1000000-0000-4000-8000-00000000000e')),
    ).toBeUndefined();
  });

  it('reports the packets expected for a file', () => {
    expect(manager.expectedPacketCount(manifest, FILE_A)).toBe(2);
    expect(manager.expectedPacketCount(manifest, FILE_B)).toBe(1);
  });

  it('reports undefined packets for an unknown file, distinct from zero', () => {
    expect(
      manager.expectedPacketCount(manifest, fileId('f1000000-0000-4000-8000-00000000000e')),
    ).toBeUndefined();
  });

  it('lists file ids in transmission order', () => {
    expect(manager.fileIds(manifest)).toEqual([FILE_A, FILE_B]);
  });
});
