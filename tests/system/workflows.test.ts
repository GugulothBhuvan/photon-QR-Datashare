/**
 * System tests (TST-003) — TEST_SPEC §6, §10, §12, §15.
 *
 * §6 requires complete user workflows to be validated end to end: image, PDF,
 * video, multi-file, resume, and recovery after dropped frames. §10 supplies
 * the file types. §15.4 is the assertion that matters throughout —
 * reconstruction produces byte-identical output.
 *
 * These run through the real application graph over a simulated optical
 * channel; see `tests/support/opticalHarness.ts` for what is and is not
 * stubbed.
 */
import { SendStage } from '@controllers/sendController';
import { ReceiveStage } from '@controllers/receiveController';

import { boundaryFiles, CORPUS, largeFile, type CorpusFile } from '../support/fileCorpus';
import { bytesEqual, captureOf, createHarness } from '../support/opticalHarness';

/** Small enough that even a modest fixture spans many packets. */
const PACKET_SIZE = 128;

function selected(file: CorpusFile) {
  return {
    name: file.name,
    mimeType: file.mimeType,
    extension: file.extension,
    content: file.content,
  };
}

function corpusFile(name: string): CorpusFile {
  const file = CORPUS.find((candidate) => candidate.name === name);

  if (file === undefined) {
    throw new Error(`No corpus fixture named ${name}.`);
  }

  return file;
}

describe('complete workflows (§6)', () => {
  it.each(CORPUS.map((file) => [file.name, file] as const))(
    'transfers %s byte-identically (§15.4)',
    async (_name, file) => {
      const harness = createHarness({ packetSize: PACKET_SIZE });
      const outcome = await harness.run([selected(file)]);

      expect(outcome.files).toHaveLength(1);

      const received = outcome.files[0];
      expect(received?.name).toBe(file.name);

      // §15.4: byte-identical, not merely the same length or the same digest.
      expect(received === undefined ? false : bytesEqual(received.stream, file.content)).toBe(true);

      // §3.24: integrity verified before a transfer is complete.
      expect(received?.integrity.verified).toBe(true);
    },
  );

  it('transfers an image workflow end to end (§6)', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const image = corpusFile('pixel.png');
    const outcome = await harness.run([selected(image)]);

    expect(bytesEqual(outcome.files[0]!.stream, image.content)).toBe(true);
    expect(outcome.missingPackets).toBe(0);
  });

  it('transfers a PDF workflow end to end (§6)', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const pdf = corpusFile('document.pdf');
    const outcome = await harness.run([selected(pdf)]);

    expect(bytesEqual(outcome.files[0]!.stream, pdf.content)).toBe(true);
  });

  it('transfers a video workflow end to end (§6)', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const video = corpusFile('video.mp4');
    const outcome = await harness.run([selected(video)]);

    // The largest fixture: many packets, so ordering is genuinely exercised.
    expect(outcome.totalPackets).toBeGreaterThan(20);
    expect(bytesEqual(outcome.files[0]!.stream, video.content)).toBe(true);
  });

  it('transfers multiple files in one session (§6)', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const files = [corpusFile('notes.txt'), corpusFile('data.json'), corpusFile('pixel.png')];

    const outcome = await harness.run(files.map(selected));

    expect(outcome.files).toHaveLength(3);

    // §13.13: indices mean nothing across files, so each must be reassembled
    // from its own packet map. A cross-file mix-up would show up here.
    for (const original of files) {
      const received = outcome.files.find((candidate) => candidate.name === original.name);

      expect(received).toBeDefined();
      expect(bytesEqual(received!.stream, original.content)).toBe(true);
    }
  });

  it('transfers a large file across hundreds of packets (§10)', async () => {
    const harness = createHarness({ packetSize: 512 });
    const large = largeFile();

    const outcome = await harness.run([selected(large)]);

    expect(outcome.totalPackets).toBeGreaterThan(90);
    expect(bytesEqual(outcome.files[0]!.stream, large.content)).toBe(true);
  });

  it.each(boundaryFiles(PACKET_SIZE).map((file) => [file.name, file] as const))(
    'transfers %s, a packet-boundary edge case',
    async (_name, file) => {
      const harness = createHarness({ packetSize: PACKET_SIZE });
      const outcome = await harness.run([selected(file)]);

      expect(outcome.files).toHaveLength(1);
      expect(bytesEqual(outcome.files[0]!.stream, file.content)).toBe(true);
    },
  );
});

describe('recovery after dropped frames (§6, §11)', () => {
  it('recovers a lossy transfer through repetition (§15.6 Strategy 1)', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const file = corpusFile('notes.txt');

    // A fifth of frames never captured, but the sender loops — which §11.11
    // permits and §15.6 Strategy 1 makes the default recovery mechanism.
    const outcome = await harness.run([selected(file)], {
      seed: 0xd0e5,
      lossRate: 0.2,
      passes: 4,
    });

    expect(outcome.missingPackets).toBe(0);
    expect(bytesEqual(outcome.files[0]!.stream, file.content)).toBe(true);
  });

  it('recovers from corruption, loss and duplication together', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const file = corpusFile('data.json');

    const outcome = await harness.run([selected(file)], {
      seed: 0xbad0,
      lossRate: 0.15,
      corruptionRate: 0.15,
      duplicationRate: 0.2,
      passes: 5,
    });

    expect(outcome.missingPackets).toBe(0);
    expect(bytesEqual(outcome.files[0]!.stream, file.content)).toBe(true);
  });

  it('reports what is missing rather than producing a partial file', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const file = corpusFile('video.mp4');

    // One pass, heavy loss, no repetition: the transfer cannot complete.
    const outcome = await harness.run([selected(file)], {
      seed: 0x105,
      lossRate: 0.5,
      passes: 1,
    });

    expect(outcome.missingPackets).toBeGreaterThan(0);

    // §13.11: an incomplete file is omitted, never returned partially built.
    expect(outcome.files).toHaveLength(0);
  });
});

describe('resume (§6)', () => {
  it('preserves everything across a pause and continues (§14.5, §14.6)', async () => {
    const harness = createHarness({ packetSize: PACKET_SIZE });
    const file = corpusFile('audio.mp3');

    harness.graph.send.addFiles([selected(file)]);
    harness.graph.send.prepare();
    harness.graph.send.start();

    const prepared = harness.graph.send.prepared()!;
    await harness.graph.receive.start(prepared.sessionId);

    // Send the first half, then pause.
    const half = Math.floor(prepared.frames.length / 2);

    for (const frame of prepared.frames.slice(0, half)) {
      harness.camera.push(captureOf(frame));
    }
    harness.camera.emitAll();

    harness.graph.send.pause();
    const paused = harness.graph.receive.state.getState().collectedPackets;

    expect(paused).toBeGreaterThan(0);
    expect(harness.graph.send.state.getState().stage).toBe(SendStage.Paused);

    // §14.5: a pause preserves state. Resuming continues rather than restarting.
    harness.graph.send.start();
    expect(harness.graph.send.state.getState().stage).toBe(SendStage.Sending);

    for (const frame of prepared.frames.slice(half)) {
      harness.camera.push(captureOf(frame));
    }
    harness.camera.emitAll();

    expect(harness.graph.receive.state.getState().collectedPackets).toBeGreaterThan(paused);
    expect(harness.graph.receive.state.getState().stage).toBe(ReceiveStage.Complete);

    const received = harness.graph.receive.finish();
    expect(bytesEqual(received[0]!.stream, file.content)).toBe(true);
  });
});

describe('acceptance criteria (§12)', () => {
  it('produces no data corruption across the whole corpus', async () => {
    // §12: "No data corruption" and "File integrity verified", checked over
    // every §10 type in one session rather than one type at a time.
    const harness = createHarness({ packetSize: 256 });
    const outcome = await harness.run(CORPUS.map(selected));

    expect(outcome.files).toHaveLength(CORPUS.length);

    for (const original of CORPUS) {
      const received = outcome.files.find((candidate) => candidate.name === original.name);

      expect(received).toBeDefined();
      expect(bytesEqual(received!.stream, original.content)).toBe(true);
      expect(received!.integrity.verified).toBe(true);
    }
  });
});
