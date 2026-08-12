/**
 * Optical frame and container (F2) — ADR-0008.
 *
 * The frame is what makes a preamble unnecessary, so the property under test
 * is that a single frame is enough to begin: everything a receiver needs is in
 * every frame, and anything that is not a frame is refused rather than
 * misread.
 */
import {
  CONTAINER_HEADER_BYTES,
  ContainerRejection,
  FRAME_HEADER_BYTES,
  FRAME_MAGIC,
  FRAME_VERSION,
  FrameRejection,
  decodeFrame,
  encodeFrame,
  matchesChecksum,
  packContainer,
  safeFileName,
  streamIdentity,
  unpackContainer,
  type FrameHeader,
} from '@core/fountain/index';
import { crc32 } from '@core/packet/crc32';
import { sha256 } from '@security/sha256';

const HEADER: FrameHeader = Object.freeze({
  sessionSeed: 0x1234,
  seq: 77,
  k: 8,
  blockLength: 256,
  totalLength: 2000,
  payloadCrc: 0xdeadbeef,
});

function blockOf(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_unused, index) => (index * 13) & 0xff);
}

describe('one frame is enough to begin (ADR-0008)', () => {
  it('round-trips every header field', () => {
    // A receiver joining mid-stream has only this. Any field that did not
    // survive would have to come from a preamble, which is the thing this
    // design removes.
    const frame = encodeFrame(HEADER, blockOf(HEADER.blockLength));
    const result = decodeFrame(frame);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.header).toEqual(HEADER);
    }
  });

  it('returns the coded block unchanged', () => {
    const block = blockOf(HEADER.blockLength);
    const result = decodeFrame(encodeFrame(HEADER, block));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.from(result.block)).toEqual(Array.from(block));
    }
  });

  it('costs twenty bytes of header', () => {
    // Paid on every frame: at 512-byte blocks this is the difference between
    // 4% and 10% of the channel against the packet engine's 54.
    expect(encodeFrame(HEADER, blockOf(100))).toHaveLength(FRAME_HEADER_BYTES + 100);
  });
});

describe('a frame refuses what it cannot read', () => {
  it('refuses another application’s QR rather than misparsing it', () => {
    // A receiver is pointed at whatever is in front of it, so this is the
    // ordinary case, not an exceptional one.
    const foreign = Uint8Array.from([0xd1, 0x0d, ...blockOf(60)]);

    expect(decodeFrame(foreign)).toEqual({ ok: false, reason: FrameRejection.NotAFrame });
  });

  it('refuses a newer format version instead of misreading it', () => {
    // The failure mode worth engineering for: a silently misparsed frame
    // collects garbage and only surfaces at the digest check, after the whole
    // transfer has run.
    const frame = encodeFrame(HEADER, blockOf(HEADER.blockLength));
    frame[1] = FRAME_VERSION + 1;

    expect(decodeFrame(frame)).toEqual({
      ok: false,
      reason: FrameRejection.UnsupportedVersion,
    });
  });

  it('refuses a frame shorter than its own header', () => {
    expect(decodeFrame(Uint8Array.from([FRAME_MAGIC, FRAME_VERSION, 0, 0]))).toEqual({
      ok: false,
      reason: FrameRejection.Truncated,
    });
  });

  it('refuses a block count that disagrees with the payload length', () => {
    // k, blockLength and totalLength are not independent. A decoder built from
    // an inconsistent set would never complete, and would never say why.
    const frame = encodeFrame({ ...HEADER, k: 99 }, blockOf(HEADER.blockLength));

    expect(decodeFrame(frame)).toEqual({ ok: false, reason: FrameRejection.InvalidField });
  });

  it('refuses a frame whose length contradicts its declared block length', () => {
    const frame = encodeFrame(HEADER, blockOf(HEADER.blockLength - 4));

    expect(decodeFrame(frame)).toEqual({ ok: false, reason: FrameRejection.LengthMismatch });
  });

  it.each([
    ['k', { k: 0 }],
    ['blockLength', { blockLength: 0 }],
    ['totalLength', { totalLength: 0 }],
  ])('refuses a zero %s', (_field, override) => {
    const header = { ...HEADER, ...override };
    const frame = encodeFrame(header, blockOf(header.blockLength || 8));

    expect(decodeFrame(frame).ok).toBe(false);
  });
});

describe('stream identity guards against a collision (ADR-0008)', () => {
  it('ignores the sequence number, which is what varies within a stream', () => {
    expect(streamIdentity({ ...HEADER, seq: 1 })).toBe(streamIdentity({ ...HEADER, seq: 9999 }));
  });

  it.each([
    ['session', { sessionSeed: 0x9999 }],
    ['block count', { k: 9 }],
    ['block length', { blockLength: 512 }],
    ['payload length', { totalLength: 4096 }],
    ['checksum', { payloadCrc: 1 }],
  ])('changes when the %s changes', (_what, override) => {
    // The session is sixteen bits, so a collision across a restart is unlikely
    // but real. A frame from a different transfer fed into an existing decoder
    // corrupts it silently — the XOR is meaningless and nothing detects it
    // until the digest fails, after the whole transfer.
    expect(streamIdentity({ ...HEADER, ...override })).not.toBe(streamIdentity(HEADER));
  });
});

describe('completion is checked against what the stream promised', () => {
  it('accepts the payload the checksum describes', () => {
    const payload = blockOf(500);
    const header = { ...HEADER, payloadCrc: crc32(payload) };

    expect(matchesChecksum(header, payload)).toBe(true);
  });

  it('rejects a payload one byte different', () => {
    const payload = blockOf(500);
    const header = { ...HEADER, payloadCrc: crc32(payload) };
    const corrupted = Uint8Array.from(payload);
    corrupted[123] = (corrupted[123] ?? 0) ^ 0x01;

    expect(matchesChecksum(header, corrupted)).toBe(false);
  });
});

describe('the container carries the metadata inside the payload (ADR-0008)', () => {
  const file = {
    name: 'holiday.jpg',
    mediaType: 'image/jpeg',
    content: blockOf(1200),
  };

  it('round-trips name, media type and content', () => {
    // Inside the payload, not in front of it: this is what removes the
    // manifest preamble a receiver could otherwise miss.
    const packed = packContainer(file, sha256(file.content));
    const result = unpackContainer(packed);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.name).toBe(file.name);
      expect(result.file.mediaType).toBe(file.mediaType);
      expect(Array.from(result.file.content)).toEqual(Array.from(file.content));
    }
  });

  it('carries a digest over the content, so it survives a later compression', () => {
    const digest = sha256(file.content);
    const result = unpackContainer(packContainer(file, digest));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.from(result.file.digest)).toEqual(Array.from(digest));
    }
  });

  it('refuses a payload that is not a container', () => {
    expect(unpackContainer(blockOf(200))).toEqual({
      ok: false,
      reason: ContainerRejection.NotAContainer,
    });
  });

  it('refuses a container shorter than its header', () => {
    expect(unpackContainer(blockOf(CONTAINER_HEADER_BYTES - 1))).toEqual({
      ok: false,
      reason: ContainerRejection.Truncated,
    });
  });

  it('refuses lengths that do not sum to the payload', () => {
    // Every field here arrived over the optical channel, so a declared length
    // is a claim rather than a fact.
    const packed = packContainer(file, sha256(file.content));
    const view = new DataView(packed.buffer);
    view.setUint32(9, file.content.byteLength + 10, true);

    expect(unpackContainer(packed)).toEqual({
      ok: false,
      reason: ContainerRejection.LengthMismatch,
    });
  });

  it('refuses a flag it does not implement rather than ignoring it', () => {
    // Ignoring the compression bit would hand the user a gzip stream named as
    // their file.
    const packed = packContainer(file, sha256(file.content));
    packed[4] = 1;

    expect(unpackContainer(packed)).toEqual({
      ok: false,
      reason: ContainerRejection.UnsupportedFlags,
    });
  });
});

describe('a received name never reaches a filesystem unsanitised', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['C:\\Windows\\system32\\bad.dll', 'bad.dll'],
    ['..', 'received.bin'],
    ['.', 'received.bin'],
    ['', 'received.bin'],
    ['   ', 'received.bin'],
  ])('reduces %p to %p', (input, expected) => {
    expect(safeFileName(input)).toBe(expected);
  });

  it('strips control characters a filesystem would not want', () => {
    expect(safeFileName('re\u0000port\u001f.pdf')).toBe('report.pdf');
  });

  it('sanitises on the way out, not only on the way in', () => {
    // The sender doing it is a convenience. The receiver doing it is the part
    // that protects anything, because the name is whatever the other screen
    // chose to send.
    const packed = packContainer(
      { name: 'safe.txt', mediaType: 'text/plain', content: blockOf(10) },
      sha256(blockOf(10)),
    );

    // Overwrite the stored name with a traversal, as a hostile sender would.
    const hostile = Uint8Array.from(packed);
    hostile.set(new TextEncoder().encode('../evil'), CONTAINER_HEADER_BYTES);
    const view = new DataView(hostile.buffer);
    view.setUint16(5, 7, true);

    const result = unpackContainer(hostile.subarray(0, packed.byteLength + 7 - 8));

    if (result.ok) {
      expect(result.file.name).not.toContain('..');
      expect(result.file.name).not.toContain('/');
    }
  });
});
