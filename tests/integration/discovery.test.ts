/**
 * Receiver discovery (Stage 1.3) — PROTOCOL_SPEC §7.4–§7.6.
 *
 * The step that turns a camera pointed at nothing into a session. Until now a
 * receiver was handed a session id by a caller in the same process, which works
 * in a test and is meaningless between two phones.
 *
 * These drive the **real** sender through the **real** optical path: frames are
 * encoded, rasterised and decoded exactly as the harness does elsewhere. Only
 * discovery is under test — packet validation, reconstruction and the session
 * FSM belong to their own suites and are not repeated.
 */
import { DiscoveryStage } from '@services/discoveryService';

import { captureOf, createHarness } from '../support/opticalHarness';

const PACKET_SIZE = 128;
const FILE = {
  name: 'greeting.txt',
  content: Uint8Array.from({ length: 300 }, (_u, i) => i & 0xff),
};

/** Prepares a real transfer and returns its frames, without transmitting. */
function preparedFrames(idPrefix: string) {
  const harness = createHarness({ packetSize: PACKET_SIZE, idPrefix });

  harness.graph.send.addFiles([FILE]);
  harness.graph.send.prepare();

  return { harness, prepared: harness.graph.send.prepared()! };
}

describe('receiver discovery (§7.4–§7.6)', () => {
  it('learns the session from the frames alone, having been told nothing', async () => {
    // The whole point: no session id is passed in anywhere below.
    const { harness, prepared } = preparedFrames('0a100000');
    const seen: string[] = [];

    const listener = harness.graph.discovery.listen((sessionId) => seen.push(sessionId));

    await harness.camera.start();
    for (const frame of prepared.frames) {
      harness.camera.push(captureOf(frame));
    }
    harness.camera.emitAll();

    const state = listener.state();

    expect(state.stage).toBe(DiscoveryStage.Ready);
    expect(state.sessionId).toBe(prepared.sessionId);
    expect(seen).toEqual([prepared.sessionId]);
    listener.stop();
  });

  it('reads the sender’s announcement before the manifest (§7.5 then §7.6)', async () => {
    const { harness, prepared } = preparedFrames('0a200000');
    const listener = harness.graph.discovery.listen(() => undefined);

    await harness.camera.start();

    // Only the first frame: the handshake announcement.
    harness.camera.push(captureOf(prepared.frames.at(0)!));
    harness.camera.emitNext();

    const announced = listener.state();

    expect(announced.stage).toBe(DiscoveryStage.Announced);
    expect(announced.announcement?.protocolVersion).toBe(1);
    // Announced, not agreed — nothing was sent back (SI-014).
    expect(announced.sessionId).toBeUndefined();

    harness.camera.push(captureOf(prepared.frames.at(1)!));
    harness.camera.emitNext();

    expect(listener.state().stage).toBe(DiscoveryStage.Ready);
    listener.stop();
  });

  it('recovers the manifest’s file list across the optical path', async () => {
    // The manifest survived encoding, rasterising and decoding — which is what
    // was impossible before the wire format existed.
    const { harness, prepared } = preparedFrames('0a300000');
    const listener = harness.graph.discovery.listen(() => undefined);

    await harness.camera.start();
    harness.camera.push(captureOf(prepared.frames.at(0)!));
    harness.camera.push(captureOf(prepared.frames.at(1)!));
    harness.camera.emitAll();

    const manifest = listener.state().manifest;

    expect(manifest?.entries.map((entry) => entry.file.name)).toEqual([FILE.name]);
    expect(manifest?.entries[0]?.file.size).toBe(FILE.content.byteLength);
    expect(manifest?.configuration.packetSize).toBe(PACKET_SIZE);
    listener.stop();
  });

  it('stays searching while it sees only data packets', async () => {
    // A receiver joining mid-transfer must not act on packets it cannot place.
    // §11.11's looping is what eventually brings the preamble round again.
    const { harness, prepared } = preparedFrames('0a400000');
    const listener = harness.graph.discovery.listen(() => undefined);

    await harness.camera.start();
    for (const frame of [...prepared.frames].slice(2)) {
      harness.camera.push(captureOf(frame));
    }
    harness.camera.emitAll();

    expect(listener.state().stage).toBe(DiscoveryStage.Searching);
    expect(listener.state().sessionId).toBeUndefined();
    listener.stop();
  });

  it('reports only once when the sender loops (§11.11)', async () => {
    // The preamble arrives on every pass. Re-adopting would discard packets
    // already collected, so discovery must settle after the first manifest.
    const { harness, prepared } = preparedFrames('0a500000');
    let calls = 0;

    const listener = harness.graph.discovery.listen(() => {
      calls += 1;
    });

    await harness.camera.start();
    for (let pass = 0; pass < 3; pass += 1) {
      for (const frame of prepared.frames) {
        harness.camera.push(captureOf(frame));
      }
    }
    harness.camera.emitAll();

    expect(calls).toBe(1);
    listener.stop();
  });

  it('stops consuming frames once stopped', async () => {
    const { harness, prepared } = preparedFrames('0a600000');
    const listener = harness.graph.discovery.listen(() => undefined);

    await harness.camera.start();
    listener.stop();

    for (const frame of prepared.frames) {
      harness.camera.push(captureOf(frame));
    }
    harness.camera.emitAll();

    expect(listener.state().framesSeen).toBe(0);
    expect(listener.state().stage).toBe(DiscoveryStage.Searching);
  });
});
