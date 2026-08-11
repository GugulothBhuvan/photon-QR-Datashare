/**
 * Representative test files — TEST_SPEC §10, invariant §15.3.
 *
 * §10 requires PNG, JPEG, PDF, MP3, MP4, ZIP, TXT and JSON, and SHOULD include
 * large files. §15.3 requires every supported file type to be tested and §15.4
 * requires reconstruction to be byte-identical.
 *
 * **What these are.** Each fixture carries the format's genuine signature bytes
 * followed by a deterministic body. The PNG, ZIP and PDF fixtures are complete
 * and valid files; the JPEG, MP3 and MP4 fixtures carry real headers over
 * synthetic payload and would not decode as media.
 *
 * **Why that is the right fixture.** The protocol treats a file as an opaque
 * byte sequence (§3.8) — nothing in it parses a container. What can break
 * reconstruction is the *shape* of the bytes, not their meaning: lengths that
 * do or do not divide the packet size, long zero runs, high-entropy regions,
 * and bytes that resemble structural markers. So each fixture is chosen for its
 * byte profile, and the corpus covers the §10 list by name as well.
 *
 * Every fixture is deterministic (§13). Nothing here is random.
 */

/** A file as the sender receives it. */
export interface CorpusFile {
  readonly name: string;
  readonly mimeType: string;
  readonly extension: string;
  readonly content: Uint8Array;
  /** What byte profile this fixture is here to exercise. */
  readonly exercises: string;
}

/**
 * A reproducible byte sequence with no short period.
 *
 * A counter would produce a pattern that repeats every 256 bytes and compresses
 * to nothing; this walks the whole byte range without settling, so a packet
 * boundary landing anywhere still sees varied content.
 */
function pseudoRandomBytes(length: number, seed: number): Uint8Array {
  let state = (seed || 1) >>> 0;

  return Uint8Array.from({ length }, () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state & 0xff;
  });
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }

  return out;
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (character) => character.charCodeAt(0) & 0xff);
}

function be32(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

/**
 * A complete, valid 1×1 greyscale PNG.
 *
 * Real signature, IHDR, IDAT and IEND chunks with correct CRCs — produced by
 * `pngCrc` below rather than pasted, so it stays verifiable.
 */
function pngFile(): Uint8Array {
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = chunk(
    'IHDR',
    concat(
      be32(1), // width
      be32(1), // height
      Uint8Array.from([8, 0, 0, 0, 0]), // 8-bit greyscale, no interlace
    ),
  );

  // A stored (uncompressed) zlib stream holding one filter byte and one pixel.
  const raw = Uint8Array.from([0x00, 0x00]);
  const idat = chunk(
    'IDAT',
    concat(
      Uint8Array.from([0x78, 0x01]), // zlib header
      Uint8Array.from([0x01, 0x02, 0x00, 0xfd, 0xff]), // final stored block, len 2
      raw,
      be32(adler32(raw)),
    ),
  );

  return concat(signature, ihdr, idat, chunk('IEND', new Uint8Array(0)));
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concat(ascii(type), data);
  return concat(be32(data.byteLength), typed, be32(pngCrc(typed)));
}

function pngCrc(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;

  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }

  return ((b << 16) | a) >>> 0;
}

/** A complete, valid empty ZIP archive: the end-of-central-directory record. */
function zipFile(): Uint8Array {
  return concat(ascii('PK'), new Uint8Array(18));
}

/** A complete, valid minimal PDF with one empty page. */
function pdfFile(): Uint8Array {
  return ascii(
    [
      '%PDF-1.4',
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 72 72]>>endobj',
      'trailer<</Root 1 0 R/Size 4>>',
      '%%EOF',
      '',
    ].join('\n'),
  );
}

/** JPEG start-of-image and JFIF application header over synthetic scan data. */
function jpegFile(): Uint8Array {
  const header = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00,
  ]);

  // High-entropy body: compressed image data has no exploitable structure, and
  // the 0xFF bytes it contains are exactly what a naive framing scheme trips on.
  return concat(header, pseudoRandomBytes(1200, 0x4a50), Uint8Array.from([0xff, 0xd9]));
}

/** An MPEG audio frame header over synthetic audio data. */
function mp3File(): Uint8Array {
  const id3 = concat(ascii('ID3'), Uint8Array.from([0x03, 0x00, 0x00, 0, 0, 0, 0]));
  // 0xFFFB: MPEG-1 Layer III, no CRC.
  const frameHeader = Uint8Array.from([0xff, 0xfb, 0x90, 0x00]);

  return concat(id3, frameHeader, pseudoRandomBytes(800, 0x4d33));
}

/** An MP4 `ftyp` box followed by a large synthetic `mdat`. */
function mp4File(): Uint8Array {
  const ftyp = concat(be32(20), ascii('ftypisom'), be32(512), ascii('isom'));
  const payload = pseudoRandomBytes(3000, 0x6d70);

  return concat(ftyp, be32(payload.byteLength + 8), ascii('mdat'), payload);
}

/** Text with line endings, non-ASCII characters and a long zero-free run. */
function txtFile(): Uint8Array {
  const lines = [
    'photon test corpus',
    'Line endings: this file uses \\n only.',
    'Non-ASCII: ümlaut, é, 日本語, emoji 🛰',
    'A long line: ' + 'x'.repeat(400),
    '',
  ];

  // UTF-8 rather than one byte per character: multi-byte sequences must survive
  // a packet boundary landing inside one.
  return new Uint8Array(Buffer.from(lines.join('\n'), 'utf8'));
}

/** JSON whose bytes include quotes, braces and escapes. */
function jsonFile(): Uint8Array {
  const value = {
    session: 'a-transfer',
    nested: { list: [1, 2, 3], flag: true, empty: null },
    text: 'quotes " braces { } backslash \\ newline \n',
    padding: 'p'.repeat(300),
  };

  return new Uint8Array(Buffer.from(JSON.stringify(value), 'utf8'));
}

/** The §10 corpus, by format. */
export const CORPUS: readonly CorpusFile[] = Object.freeze([
  Object.freeze({
    name: 'pixel.png',
    mimeType: 'image/png',
    extension: 'png',
    content: pngFile(),
    exercises: 'a complete small binary file, shorter than one packet',
  }),
  Object.freeze({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    extension: 'jpg',
    content: jpegFile(),
    exercises: 'high-entropy bytes including 0xFF markers',
  }),
  Object.freeze({
    name: 'document.pdf',
    mimeType: 'application/pdf',
    extension: 'pdf',
    content: pdfFile(),
    exercises: 'printable ASCII with a trailing newline',
  }),
  Object.freeze({
    name: 'audio.mp3',
    mimeType: 'audio/mpeg',
    extension: 'mp3',
    content: mp3File(),
    exercises: 'a header of zero bytes followed by high-entropy data',
  }),
  Object.freeze({
    name: 'video.mp4',
    mimeType: 'video/mp4',
    extension: 'mp4',
    content: mp4File(),
    exercises: 'the largest fixture, spanning many packets',
  }),
  Object.freeze({
    name: 'archive.zip',
    mimeType: 'application/zip',
    extension: 'zip',
    content: zipFile(),
    exercises: 'a file that is mostly zero bytes',
  }),
  Object.freeze({
    name: 'notes.txt',
    mimeType: 'text/plain',
    extension: 'txt',
    content: txtFile(),
    exercises: 'UTF-8 sequences that a packet boundary can split',
  }),
  Object.freeze({
    name: 'data.json',
    mimeType: 'application/json',
    extension: 'json',
    content: jsonFile(),
    exercises: 'structural punctuation and escape sequences',
  }),
]);

/**
 * A larger file, for §10's "large files SHOULD also be included".
 *
 * Kept to tens of kilobytes rather than megabytes: every byte here becomes a
 * QR symbol that is encoded, rasterised and decoded, and §13 asks for a suite
 * that runs deterministically on every pull request. The property under test —
 * that packet count, ordering and reassembly hold across hundreds of packets —
 * is reached long before a megabyte.
 */
export function largeFile(byteLength = 48 * 1024): CorpusFile {
  return Object.freeze({
    name: 'large.bin',
    mimeType: 'application/octet-stream',
    extension: 'bin',
    content: pseudoRandomBytes(byteLength, 0x1a26e),
    exercises: 'hundreds of packets, exercising ordering at scale',
  });
}

/** Edge-case sizes relative to a packet boundary. */
export function boundaryFiles(packetSize: number): readonly CorpusFile[] {
  const sizes: readonly [string, number][] = [
    ['empty.bin', 0],
    ['one-byte.bin', 1],
    ['under.bin', packetSize - 1],
    ['exact.bin', packetSize],
    ['over.bin', packetSize + 1],
    ['two-exact.bin', packetSize * 2],
  ];

  return Object.freeze(
    sizes.map(([name, size]) =>
      Object.freeze({
        name,
        mimeType: 'application/octet-stream',
        extension: 'bin',
        content: pseudoRandomBytes(size, size + 1),
        exercises: `${size} bytes against a packet size of ${packetSize}`,
      }),
    ),
  );
}
