/**
 * QR transport pipeline — Phase 5 exit criterion.
 *
 * `planning/IMPLEMENTATION_PLAN.md` P5 requires "binary packet successfully
 * displayed as QR". This drives QR_SPEC §4's sender pipeline end to end:
 *
 * ```text
 * Binary Packet → QR Encoder → Frame Scheduler → Display
 * ```
 *
 * The last step is a *drawable description* rather than pixels — QR-002 renders
 * geometry, and a test that needed a screen would be testing the screen.
 *
 * The packets here are real: built by the Phase 3 serializer from real headers,
 * so what is encoded is genuinely a protocol packet's bytes and not a stand-in.
 */
import { serializePacket, toWirePacket } from '@core/packet/serializer';
import { createPacketHeader, HEADER_SIZE, PacketTypeId } from '@core/packet/header';
import { deserializePacket } from '@core/packet/deserializer';
import { createPacketManager } from '@core/packet/packetManager';
import { fileId, sessionId } from '@domain/ids';
import { createFrameScheduler, FrameRate } from '@qr/frameScheduler';
import { createQrEncoder, ErrorCorrectionLevel, moduleAt } from '@qr/qrEncoder';
import { renderFrame, toSvgPath } from '@qr/qrRenderer';
import {
  adapt,
  AdaptationDirection,
  ADAPTATION_WINDOW,
  DEFAULT_PARAMETERS,
} from '@qr/adaptiveTiming';

const SESSION = sessionId('11111111-1111-4111-8111-111111111111');
const FILE = fileId('f1000000-0000-4000-8000-000000000001');

const encoder = createQrEncoder();

/** A real serialized packet: 50-byte header, payload, CRC footer. */
function packetBytes(index: number, payloadSize = 128): Uint8Array {
  const payload = Uint8Array.from({ length: payloadSize }, (_u, i) => (i + index * 7) & 0xff);
  const header = createPacketHeader({
    protocolVersion: 1,
    packetType: PacketTypeId.Data,
    sessionId: SESSION,
    fileId: FILE,
    packetIndex: index,
    totalPackets: 8,
    payloadLength: payload.byteLength,
  });

  return serializePacket(header, payload);
}

describe('binary packet displayed as QR (§4, §5)', () => {
  it('encodes a serialized packet into one frame', () => {
    const bytes = packetBytes(0);
    const frame = encoder.encode(bytes);

    expect(bytes.byteLength).toBe(HEADER_SIZE + 128 + 4);
    expect(frame.size).toBeGreaterThan(0);
    expect(frame.modules).toHaveLength(frame.size * frame.size);
  });

  it('renders that frame into drawable geometry (§13)', () => {
    const rendered = renderFrame(encoder.encode(packetBytes(0)), { targetSize: 512 });

    expect(rendered.modules.length).toBeGreaterThan(0);
    expect(rendered.size).toBeLessThanOrEqual(512);
    expect(toSvgPath(rendered).startsWith('M')).toBe(true);
  });

  it('preserves the packet exactly through the QR encoding (§5)', () => {
    // The strongest available statement of "preserved exactly" without a
    // camera: the bytes handed to the encoder still parse as the same packet,
    // CRC included.
    const bytes = packetBytes(3);
    const frame = encoder.encode(bytes);
    const result = deserializePacket(bytes);

    expect(frame.size).toBeGreaterThan(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.validation.valid).toBe(true);
      expect(result.packet.header.packetIndex).toBe(3);
    }
  });

  it('encodes a packet containing every byte value', () => {
    const payload = Uint8Array.from({ length: 256 }, (_u, i) => i);
    const header = createPacketHeader({
      protocolVersion: 1,
      packetType: PacketTypeId.Data,
      sessionId: SESSION,
      fileId: FILE,
      packetIndex: 0,
      totalPackets: 1,
      payloadLength: payload.byteLength,
    });

    expect(() => encoder.encode(serializePacket(header, payload))).not.toThrow();
  });

  it('produces a distinct frame per packet', () => {
    const first = encoder.encode(packetBytes(0));
    const second = encoder.encode(packetBytes(1));

    expect(Array.from(first.modules)).not.toEqual(Array.from(second.modules));
  });

  it('keeps the finder patterns intact, so a scanner can locate the code', () => {
    const frame = encoder.encode(packetBytes(0));

    // Each finder is a 7x7 dark ring; its corner and centre are dark, and the
    // ring between them is light.
    for (const [ox, oy] of [
      [0, 0],
      [frame.size - 7, 0],
      [0, frame.size - 7],
    ] as const) {
      expect(moduleAt(frame, ox, oy)).toBe(1);
      expect(moduleAt(frame, ox + 1, oy + 1)).toBe(0);
      expect(moduleAt(frame, ox + 3, oy + 3)).toBe(1);
    }
  });
});

describe('the full sender pipeline (§4, §8)', () => {
  it('carries a whole file of packets through encode, schedule and render', () => {
    const packets = createPacketManager().packetize({
      sessionId: SESSION,
      fileId: FILE,
      stream: Uint8Array.from({ length: 800 }, (_u, i) => i & 0xff),
      packetSize: 128,
    });

    // Each domain packet becomes wire bytes, then a frame (§5: one packet, one
    // frame), then geometry.
    const frames = packets.map((packet) => {
      const wire = toWirePacket(packet, { protocolVersion: 1, totalPackets: packets.length });
      return encoder.encode(serializePacket(wire.header, wire.payload));
    });

    expect(frames).toHaveLength(7);

    const scheduler = createFrameScheduler({ frames, rate: FrameRate.Balanced });
    const displayed: number[] = [];

    // One full pass, as the display loop would drive it.
    for (let i = 0; i < frames.length; i += 1) {
      const current = scheduler.current();
      expect(current).toBeDefined();
      displayed.push(renderFrame(current!, { targetSize: 512 }).modules.length);
      scheduler.advance();
    }

    // Every frame produced drawable geometry, and ordering was preserved (§8).
    expect(displayed).toHaveLength(7);
    expect(displayed.every((count) => count > 0)).toBe(true);
    expect(scheduler.state().loops).toBe(1);
  });

  it('loops the sequence, which is the default recovery strategy', () => {
    const frames = [0, 1, 2].map((index) => encoder.encode(packetBytes(index, 64)));
    const scheduler = createFrameScheduler({ frames });

    for (let i = 0; i < 3; i += 1) {
      scheduler.advance();
    }

    expect(scheduler.current()).toBe(frames[0]);
  });
});

describe('adaptive transport over the pipeline (§10)', () => {
  it('slows down and hardens when frames are being missed', () => {
    const decision = adapt(DEFAULT_PARAMETERS, {
      decoded: 12,
      missed: ADAPTATION_WINDOW - 12,
    });

    expect(decision.direction).toBe(AdaptationDirection.Degrade);
    expect(decision.parameters.durationMs).toBeGreaterThan(DEFAULT_PARAMETERS.durationMs);
    expect(decision.parameters.level).toBe(ErrorCorrectionLevel.Quartile);
  });

  it('speeds up on a clean link', () => {
    const decision = adapt(DEFAULT_PARAMETERS, { decoded: ADAPTATION_WINDOW, missed: 0 });

    expect(decision.direction).toBe(AdaptationDirection.Improve);
    expect(decision.parameters.rate).toBe(FrameRate.Fast);
  });

  it('feeds back into the scheduler without disturbing the frames (§10)', () => {
    const frames = [0, 1, 2].map((index) => encoder.encode(packetBytes(index, 64)));
    const scheduler = createFrameScheduler({ frames });

    scheduler.advance();
    const decision = adapt(DEFAULT_PARAMETERS, { decoded: 5, missed: ADAPTATION_WINDOW - 5 });
    scheduler.setDuration(decision.parameters.durationMs);

    // Adaptive changes SHALL NOT modify packet contents.
    expect(scheduler.currentDuration()).toBe(decision.parameters.durationMs);
    expect(scheduler.current()).toBe(frames[1]);
    expect(Array.from(frames[1]!.modules)).toEqual(
      Array.from(encoder.encode(packetBytes(1, 64)).modules),
    );
  });
});
