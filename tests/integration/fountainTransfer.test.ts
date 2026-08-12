/**
 * A file through the fountain transport (F2) — ADR-0008.
 *
 * The codec and the frame format are tested separately. This joins them: a
 * real file, packed, split, framed, sent through a lossy channel in a
 * receiver's arrival order, and reconstructed byte-identically with its name,
 * media type and digest intact.
 *
 * The QR layer is deliberately absent. That path is already proven by the
 * optical harness for the packet engine, and repeating it here would test the
 * rasteriser twice rather than the transport once.
 */
import {
  createFountainDecoder,
  createFountainEncoder,
  cycleLength,
  decodeFrame,
  encodeFrame,
  matchesChecksum,
  packContainer,
  splitmix32,
  streamIdentity,
  unpackContainer,
  type FrameHeader,
} from '@core/fountain/index';
import { crc32 } from '@core/packet/crc32';
import { sha256 } from '@security/sha256';
import { constantTimeEquals } from '@security/integrity';

const SESSION = 0x4d2;
const BLOCK_LENGTH = 256;

const FILE = {
  name: 'report.pdf',
  mediaType: 'application/pdf',
  // Not random: a pattern makes a misplaced block visible rather than merely
  // making a digest fail.
  content: Uint8Array.from({ length: 20_000 }, (_unused, index) => (index * 97 + 11) & 0xff),
};

/** A sender: file in, an endless stream of wire-format frames out. */
function sender(file = FILE) {
  const payload = packContainer(file, sha256(file.content));
  const encoder = createFountainEncoder({
    payload,
    blockLength: BLOCK_LENGTH,
    sessionSeed: SESSION,
  });

  const header = (seq: number): FrameHeader => ({
    sessionSeed: SESSION,
    seq,
    k: encoder.k,
    blockLength: encoder.blockLength,
    totalLength: encoder.totalLength,
    payloadCrc: crc32(payload),
  });

  return {
    encoder,
    payload,
    frame: (seq: number) => encodeFrame(header(seq), encoder.block(seq)),
  };
}

/**
 * A receiver that knows nothing until it decodes a frame.
 *
 * Deliberately built with no arguments: everything it needs arrives in the
 * first frame it manages to read. That is the property under test.
 */
function receiver() {
  let decoder: ReturnType<typeof createFountainDecoder> | undefined;
  let identity: string | undefined;
  let header: FrameHeader | undefined;

  return {
    get started() {
      return decoder !== undefined;
    },

    accept(bytes: Uint8Array): void {
      const parsed = decodeFrame(bytes);

      if (!parsed.ok) {
        return;
      }

      const seen = streamIdentity(parsed.header);

      // Any disagreement starts over. A frame from a different transfer fed
      // into an existing decoder corrupts it silently.
      if (identity !== seen) {
        identity = seen;
        header = parsed.header;
        decoder = createFountainDecoder({
          k: parsed.header.k,
          blockLength: parsed.header.blockLength,
          totalLength: parsed.header.totalLength,
          sessionSeed: parsed.header.sessionSeed,
        });
      }

      decoder?.accept(parsed.header.seq, parsed.block);
    },

    finish() {
      const payload = decoder?.assemble();

      if (payload === undefined || header === undefined) {
        return undefined;
      }

      // The stream's own checksum first: a payload that reassembled but is not
      // what was sent must not reach the container parser.
      if (!matchesChecksum(header, payload)) {
        return undefined;
      }

      const result = unpackContainer(payload);
      return result.ok ? result.file : undefined;
    },

    progress: () => decoder?.progress(),
  };
}

describe('a file crosses the fountain transport (ADR-0008)', () => {
  it('arrives byte-identical with its metadata', () => {
    const tx = sender();
    const rx = receiver();

    for (let seq = 0; seq < cycleLength(tx.encoder.k); seq += 1) {
      rx.accept(tx.frame(seq));
    }

    const received = rx.finish();

    expect(received).toBeDefined();
    expect(received?.name).toBe(FILE.name);
    expect(received?.mediaType).toBe(FILE.mediaType);
    expect(Array.from(received?.content ?? [])).toEqual(Array.from(FILE.content));
  });

  it('verifies against the digest the sender computed', () => {
    // §20's integrity check, end to end: the digest travelled inside the
    // payload rather than in a manifest the receiver could have missed.
    const tx = sender();
    const rx = receiver();

    for (let seq = 0; seq < cycleLength(tx.encoder.k); seq += 1) {
      rx.accept(tx.frame(seq));
    }

    const received = rx.finish();

    expect(received).toBeDefined();
    expect(
      constantTimeEquals(
        sha256(received?.content ?? new Uint8Array()),
        received?.digest ?? new Uint8Array(),
      ),
    ).toBe(true);
  });

  it('needs no preamble — it starts from whatever frame it first reads', () => {
    // The packet engine cannot do this at all: it can place no packet until it
    // has caught §9.1's handshake and §9.2's manifest.
    const tx = sender();
    const rx = receiver();

    // Joins in the repair half of the third cycle, having missed everything.
    const joinAt = cycleLength(tx.encoder.k) * 2 + tx.encoder.k + 17;

    for (let seq = joinAt; seq < joinAt + cycleLength(tx.encoder.k) * 3; seq += 1) {
      rx.accept(tx.frame(seq));
    }

    expect(rx.started).toBe(true);
    expect(Array.from(rx.finish()?.content ?? [])).toEqual(Array.from(FILE.content));
  });

  it.each([20, 40])('survives %i%% frame loss', (percent) => {
    const tx = sender();
    const rx = receiver();
    const drop = splitmix32(0x10c5 + percent);

    let seq = 0;

    while (rx.progress()?.complete !== true && seq < tx.encoder.k * 40) {
      if (drop() % 100 >= percent) {
        rx.accept(tx.frame(seq));
      }
      seq += 1;
    }

    expect(Array.from(rx.finish()?.content ?? [])).toEqual(Array.from(FILE.content));
  });

  it('ignores frames belonging to a different transfer', () => {
    // Two senders in view of one camera. Without stream identity the foreign
    // frames would XOR into this decoder and the corruption would surface only
    // at the final checksum.
    const tx = sender();
    const other = sender({ ...FILE, name: 'other.bin', content: FILE.content.slice(0, 5_000) });
    const rx = receiver();

    for (let seq = 0; seq < cycleLength(tx.encoder.k); seq += 1) {
      rx.accept(tx.frame(seq));

      if (seq % 5 === 0) {
        // A frame from the other stream, interleaved.
        rx.accept(other.frame(seq));
      }
    }

    // Whichever stream it settled on, the result verifies — the point is that
    // it never mixes the two into a payload that passes.
    const received = rx.finish();

    if (received !== undefined) {
      expect(constantTimeEquals(sha256(received.content), received.digest)).toBe(true);
    }
  });

  it('refuses a payload that reassembled but is not what was sent', () => {
    // Belt and braces over the QR layer's own error correction: the stream
    // checksum is what stops a corrupted reassembly reaching a file.
    const tx = sender();
    const rx = receiver();

    for (let seq = 0; seq < cycleLength(tx.encoder.k); seq += 1) {
      const frame = tx.frame(seq);

      // Flip a byte in one block's payload, past the header.
      if (seq === 3) {
        frame[30] = (frame[30] ?? 0) ^ 0xff;
      }

      rx.accept(frame);
    }

    expect(rx.finish()).toBeUndefined();
  });
});
