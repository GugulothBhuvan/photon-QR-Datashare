/**
 * Manifest model (MOD-003) — PROTOCOL_SPEC §3.7, §10.
 */
import { createFileMetadata } from '@domain/fileMetadata';
import { fileId, protocolVersion, sessionId, transferId } from '@domain/ids';
import {
  createManifest,
  createManifestEntry,
  findEntry,
  manifestEquals,
  NONE,
  type ManifestConfiguration,
} from '@domain/manifest';
import { AppError } from '@utils/errors';

const configuration: ManifestConfiguration = {
  packetSize: 512,
  recoveryMethod: NONE,
  integrityAlgorithm: 'SHA-256',
  transportCapabilities: ['QR'],
};

const fileA = createFileMetadata({
  id: fileId('f-1'),
  name: 'a.jpg',
  size: 1000,
  hash: 'hash-a',
});

const fileB = createFileMetadata({
  id: fileId('f-2'),
  name: 'b.pdf',
  size: 2500,
  hash: 'hash-b',
});

const baseInput = {
  sessionId: sessionId('s-1'),
  protocolVersion: protocolVersion(1),
  createdAt: 1_700_000_000_000,
  configuration,
  entries: [
    { file: fileA, packetCount: 2 },
    { file: fileB, packetCount: 5 },
  ],
};

describe('createManifestEntry', () => {
  it('defaults compression and encryption to NONE', () => {
    const entry = createManifestEntry({ file: fileA, packetCount: 2 });

    expect(entry.compression).toBe(NONE);
    expect(entry.encryption).toBe(NONE);
  });

  it('is frozen', () => {
    const entry = createManifestEntry({ file: fileA, packetCount: 2 });

    expect(Object.isFrozen(entry)).toBe(true);
    (entry as { packetCount: number }).packetCount = 99;
    expect(entry.packetCount).toBe(2);
  });

  it('accepts a zero packet count for an empty file', () => {
    expect(createManifestEntry({ file: fileA, packetCount: 0 }).packetCount).toBe(0);
  });

  it.each([-1, 1.5])('rejects a packet count of %p', (packetCount) => {
    expect(() => createManifestEntry({ file: fileA, packetCount })).toThrow(AppError);
  });
});

describe('createManifest', () => {
  it('derives the totals from its entries rather than trusting them', () => {
    const manifest = createManifest(baseInput);

    expect(manifest.fileCount).toBe(2);
    expect(manifest.totalSize).toBe(3500);
    expect(manifest.totalPacketCount).toBe(7);
  });

  it('gives every file exactly one entry (§10.15.3)', () => {
    const manifest = createManifest(baseInput);

    expect(manifest.entries).toHaveLength(2);
    expect(manifest.entries.map((entry) => entry.file.id)).toEqual([fileA.id, fileB.id]);
  });

  it('rejects duplicate file ids (§10.15.5)', () => {
    expect(() =>
      createManifest({
        ...baseInput,
        entries: [
          { file: fileA, packetCount: 1 },
          { file: fileA, packetCount: 1 },
        ],
      }),
    ).toThrow(AppError);
  });

  it('rejects a manifest describing no files', () => {
    expect(() => createManifest({ ...baseInput, entries: [] })).toThrow(AppError);
  });

  it.each([0, -1, 1.5])('rejects a packet size of %p', (packetSize) => {
    expect(() =>
      createManifest({ ...baseInput, configuration: { ...configuration, packetSize } }),
    ).toThrow(AppError);
  });

  it('is immutable once created (§10.9)', () => {
    const manifest = createManifest(baseInput);

    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.entries)).toBe(true);
    expect(Object.isFrozen(manifest.configuration)).toBe(true);

    (manifest as { totalPacketCount: number }).totalPacketCount = 0;
    expect(manifest.totalPacketCount).toBe(7);
  });

  it('copies transport capabilities so the caller cannot alter them afterwards', () => {
    const capabilities = ['QR'];
    const manifest = createManifest({
      ...baseInput,
      configuration: { ...configuration, transportCapabilities: capabilities },
    });

    capabilities.push('LED');

    expect(manifest.configuration.transportCapabilities).toEqual(['QR']);
  });

  it('treats transferId and name as optional (§10.5)', () => {
    const manifest = createManifest(baseInput);

    expect(manifest.transferId).toBeUndefined();
    expect(manifest.name).toBeUndefined();

    const named = createManifest({
      ...baseInput,
      transferId: transferId('t-1'),
      name: 'Holiday photos',
    });

    expect(named.transferId).toBe('t-1');
    expect(named.name).toBe('Holiday photos');
  });

  it('carries no payload data (§10.1) — entries describe files only', () => {
    const manifest = createManifest(baseInput);
    const serialized = JSON.stringify(manifest);

    expect(serialized).toContain('hash-a');
    expect(serialized).not.toContain('payload');
  });

  it('is deterministic', () => {
    expect(manifestEquals(createManifest(baseInput), createManifest(baseInput))).toBe(true);
  });
});

describe('findEntry', () => {
  it('finds an entry by file id', () => {
    expect(findEntry(createManifest(baseInput), fileB.id)?.packetCount).toBe(5);
  });

  it('returns undefined for an unknown file', () => {
    expect(findEntry(createManifest(baseInput), fileId('nope'))).toBeUndefined();
  });
});

describe('manifestEquals', () => {
  it.each([
    ['sessionId', { sessionId: sessionId('s-2') }],
    ['protocolVersion', { protocolVersion: protocolVersion(2) }],
    ['createdAt', { createdAt: 1 }],
    ['name', { name: 'other' }],
  ])('detects a difference in %s', (_label, change) => {
    expect(
      manifestEquals(createManifest(baseInput), createManifest({ ...baseInput, ...change })),
    ).toBe(false);
  });

  it('detects a difference in entries', () => {
    expect(
      manifestEquals(
        createManifest(baseInput),
        createManifest({
          ...baseInput,
          entries: [
            { file: fileA, packetCount: 3 },
            { file: fileB, packetCount: 5 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('detects a difference in configuration', () => {
    expect(
      manifestEquals(
        createManifest(baseInput),
        createManifest({
          ...baseInput,
          configuration: { ...configuration, integrityAlgorithm: 'SHA-512' },
        }),
      ),
    ).toBe(false);
  });
});
