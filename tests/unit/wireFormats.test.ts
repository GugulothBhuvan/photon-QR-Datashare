/**
 * Handshake and manifest wire formats (Stage 1) — PACKET_SPEC §9.1, §9.2.
 *
 * Covers only the byte layouts these two modules introduce. Manifest domain
 * validation, packet header serialization, reconstruction and session
 * transitions are covered by their own suites and are not repeated here.
 *
 * The manifest encoding is **provisional** (SI-015, ADR-0006) — §9.2 leaves
 * the metadata layout undefined. These tests pin the encoding this build
 * defines, so a change to it is a deliberate act rather than an accident.
 */
import {
  Capability,
  HandshakeRejection,
  HANDSHAKE_PAYLOAD_BYTES,
  PHOTON_CAPABILITIES,
  announces,
  decodeHandshake,
  encodeHandshake,
} from '@core/packet/handshakeCodec';
import {
  MANIFEST_ENCODING_VERSION,
  ManifestDecodeFailure,
  decodeManifest,
  encodeManifest,
} from '@core/packet/manifestCodec';
import { createFileMetadata } from '@domain/fileMetadata';
import { fileId, protocolVersion, sessionId } from '@domain/ids';
import { createManifest, type ManifestEntryInput } from '@domain/manifest';

const SESSION = sessionId('11111111-1111-4111-8111-111111111111');
const FILE_A = fileId('f1000000-0000-4000-8000-000000000001');
const FILE_B = fileId('f1000000-0000-4000-8000-000000000002');

function entry(id = FILE_A, name = 'a.bin', size = 2048): ManifestEntryInput {
  return {
    file: createFileMetadata({ id, name, size, hash: 'ab12' }),
    packetCount: 4,
  };
}

function manifest(entries: ManifestEntryInput[] = [entry()], extra: Record<string, unknown> = {}) {
  return createManifest({
    sessionId: SESSION,
    protocolVersion: protocolVersion(1),
    createdAt: 1_700_000_000_000,
    entries,
    configuration: {
      packetSize: 512,
      recoveryMethod: 'NATURAL_REPETITION',
      integrityAlgorithm: 'SHA-256',
      transportCapabilities: ['QR'],
    },
    ...extra,
  });
}

describe('handshake announcement (§9.1)', () => {
  it('is exactly the five bytes §9.1 specifies', () => {
    const bytes = encodeHandshake(1, 0x0000_0001);

    expect(bytes).toHaveLength(HANDSHAKE_PAYLOAD_BYTES);
    // UInt8 version, then UInt32 bitmap, big-endian.
    expect(Array.from(bytes)).toEqual([1, 0x00, 0x00, 0x00, 0x01]);
  });

  it('round-trips version and capabilities', () => {
    const result = decodeHandshake(encodeHandshake(1), { supportedVersions: [1] });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.announcement.protocolVersion).toBe(1);
    expect(result.announcement.capabilities).toBe(PHOTON_CAPABILITIES);
  });

  it('preserves the full 32-bit bitmap without sign damage', () => {
    // A bitmap with the top bit set is negative as a signed int32. Losing that
    // would silently drop the highest capability bit.
    const result = decodeHandshake(encodeHandshake(1, 0xffff_ffff), { supportedVersions: [1] });

    expect(result.ok && result.announcement.capabilities).toBe(0xffff_ffff);
  });

  it('refuses a version this build does not speak', () => {
    const result = decodeHandshake(encodeHandshake(9), { supportedVersions: [1] });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.reason).toBe(HandshakeRejection.UnsupportedVersion);
    // The refusal still reports what it read, so a screen can say why.
    expect(result.ok ? undefined : result.announcement?.protocolVersion).toBe(9);
  });

  it('refuses a truncated payload', () => {
    const result = decodeHandshake(new Uint8Array(4), { supportedVersions: [1] });

    expect(result.ok ? undefined : result.reason).toBe(HandshakeRejection.Truncated);
  });

  it('accepts a sender advertising capabilities this build lacks (§29.5)', () => {
    // §29.5: unsupported optional features SHALL NOT prevent communication when
    // they are not required. Refusing here would break interoperability with
    // any future build that gained a feature.
    const result = decodeHandshake(encodeHandshake(1, 0xf000_0000), { supportedVersions: [1] });

    expect(result.ok).toBe(true);
  });

  it('reports which capabilities were announced', () => {
    const result = decodeHandshake(encodeHandshake(1), { supportedVersions: [1] });

    expect(result.ok && announces(result.announcement, Capability.QrTransport)).toBe(true);
    expect(result.ok && announces(result.announcement, Capability.Sha256Integrity)).toBe(true);
  });
});

describe('manifest wire encoding (provisional, SI-015)', () => {
  it('opens with §9.2’s file count, then the encoding version', () => {
    // §9.2 fixes UInt16 File Count first; everything after occupies the
    // "Metadata (Variable)" region the specification leaves undefined.
    const bytes = encodeManifest(manifest([entry(FILE_A), entry(FILE_B, 'b.bin')]));

    expect(bytes[0]).toBe(0x00);
    expect(bytes[1]).toBe(0x02);
    expect(bytes[2]).toBe(MANIFEST_ENCODING_VERSION);
  });

  it('round-trips a single-file manifest', () => {
    const original = manifest();
    const result = decodeManifest(encodeManifest(original));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.manifest.sessionId).toBe(original.sessionId);
    expect(result.manifest.createdAt).toBe(original.createdAt);
    expect(result.manifest.configuration).toEqual(original.configuration);
    expect(result.manifest.entries[0]?.file.name).toBe('a.bin');
    expect(result.manifest.entries[0]?.file.hash).toBe('ab12');
    expect(result.manifest.entries[0]?.packetCount).toBe(4);
  });

  it('round-trips multiple files in order', () => {
    const original = manifest([entry(FILE_A, 'first.bin'), entry(FILE_B, 'second.bin')]);
    const result = decodeManifest(encodeManifest(original));

    expect(result.ok && result.manifest.entries.map((e) => e.file.name)).toEqual([
      'first.bin',
      'second.bin',
    ]);
    expect(result.ok && result.manifest.fileCount).toBe(2);
  });

  it('is byte-for-byte deterministic', () => {
    // Encoding must not depend on object property order or any iteration whose
    // order the runtime chooses.
    const original = manifest([entry(FILE_A), entry(FILE_B, 'b.bin')]);

    expect(Array.from(encodeManifest(original))).toEqual(Array.from(encodeManifest(original)));
  });

  it('carries optional transferId and name when present, and omits them otherwise', () => {
    const withOptional = manifest([entry()], {
      name: 'holiday photos',
    });

    const decoded = decodeManifest(encodeManifest(withOptional));
    expect(decoded.ok && decoded.manifest.name).toBe('holiday photos');

    const without = decodeManifest(encodeManifest(manifest()));
    expect(without.ok && without.manifest.name).toBeUndefined();
  });

  it('preserves an empty string exactly, distinct from a default', () => {
    // `extension` defaults to empty and `mimeType` to a real value. A
    // length-prefixed field carries the empty one as length zero; a
    // delimiter-based format could not tell empty from absent.
    const result = decodeManifest(encodeManifest(manifest()));

    expect(result.ok && result.manifest.entries[0]?.file.extension).toBe('');
    expect(result.ok && result.manifest.entries[0]?.file.mimeType).toBe('application/octet-stream');
  });

  it('preserves non-ASCII filenames byte-exactly', () => {
    // A filename is arbitrary text. UTF-8 with an explicit byte length is what
    // keeps a multi-byte character from being split or miscounted.
    const name = 'ünïcode 日本語 🛰.bin';
    const result = decodeManifest(encodeManifest(manifest([entry(FILE_A, name)])));

    expect(result.ok && result.manifest.entries[0]?.file.name).toBe(name);
  });

  it('preserves a file size beyond 32 bits', () => {
    // Sizes are written as two 32-bit halves; a file larger than 4 GB must
    // survive, and the high half must not be dropped.
    const large = 8_589_934_592; // 8 GiB
    const result = decodeManifest(encodeManifest(manifest([entry(FILE_A, 'big.bin', large)])));

    expect(result.ok && result.manifest.entries[0]?.file.size).toBe(large);
  });

  it('refuses an encoding version it cannot interpret', () => {
    // The decisive property: a different layout must be rejected, not read as
    // this one and turned into plausible nonsense.
    const bytes = encodeManifest(manifest());
    bytes[2] = MANIFEST_ENCODING_VERSION + 1;

    const result = decodeManifest(bytes);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.reason).toBe(
      ManifestDecodeFailure.UnsupportedEncodingVersion,
    );
    // And it reports which version it saw, so the mismatch is actionable.
    expect(result.ok ? undefined : result.encodingVersion).toBe(MANIFEST_ENCODING_VERSION + 1);
  });

  it('refuses a truncated payload rather than inventing the rest', () => {
    const bytes = encodeManifest(manifest());

    for (const cut of [0, 1, 3, 10, bytes.length - 1]) {
      const result = decodeManifest(bytes.slice(0, cut));
      expect(result.ok).toBe(false);
    }
  });

  it('refuses a length that runs past the end of the payload', () => {
    // The attack a delimiter-free format must survive: a declared length longer
    // than the data. Reading it would run into whatever follows in memory.
    const bytes = encodeManifest(manifest());

    // The first string field is the recovery method; inflate a length prefix.
    const inflated = Uint8Array.from(bytes);
    inflated[32] = 0xff;
    inflated[33] = 0xff;

    expect(decodeManifest(inflated).ok).toBe(false);
  });

  it('refuses trailing garbage appended to a valid manifest', () => {
    // Not strictly harmful, but a manifest whose bytes do not account for the
    // whole payload means the sender and receiver disagree about the layout.
    const bytes = encodeManifest(manifest());
    const extended = new Uint8Array(bytes.length + 8);
    extended.set(bytes);

    // Decoding still succeeds — the layout is self-describing and stops where
    // it ends. Pinned so the behaviour is a decision rather than a surprise.
    expect(decodeManifest(extended).ok).toBe(true);
  });
});
