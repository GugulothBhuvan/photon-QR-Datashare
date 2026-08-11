/**
 * Optical loopback — Phase 6 exit criterion.
 *
 * `planning/IMPLEMENTATION_PLAN.md` P6 requires "receiver reconstructs packet".
 * This closes the whole optical loop in software:
 *
 * ```text
 * Packet → serialize → QR encode → rasterise → camera frame
 *        → detect → decode → payload bytes → parse → Packet
 * ```
 *
 * The only thing absent is the physical light path. Everything either side of
 * it is the production code: the Phase 3 serializer, the Phase 5 encoder and
 * rasteriser, the Phase 6 decoder, and the Phase 3 deserializer. A rasterised
 * frame is byte-for-byte what a camera delivers, so the receive path is
 * exercised exactly as it will run.
 *
 * QR_SPEC §14 requires decoded payloads to be forwarded to the packet layer
 * **unchanged**. That is what these tests actually check: not that a decode
 * happened, but that the bytes that arrive are the bytes that left.
 */
import { createQrDecoder, DecodeFailure } from '@camera/qrDecoder';
import { createMemoryCamera } from '@camera/memoryCamera';
import { PixelFormat, type CameraFrame } from '@camera/cameraPort';
import { downsample, toGrayscale } from '@camera/frameProcessor';
import { deserializePacket } from '@core/packet/deserializer';
import { createPacketHeader, PacketTypeId } from '@core/packet/header';
import { createPacketManager } from '@core/packet/packetManager';
import { serializePacket, toWirePacket } from '@core/packet/serializer';
import { fileId, sessionId } from '@domain/ids';
import { createQrEncoder, ErrorCorrectionLevel } from '@qr/qrEncoder';
import { rasterizeFrame } from '@qr/qrRenderer';

const SESSION = sessionId('11111111-1111-4111-8111-111111111111');
const FILE = fileId('f1000000-0000-4000-8000-000000000001');

const encoder = createQrEncoder();
const decoder = createQrDecoder();

/** A real serialized packet: 50-byte header, payload, CRC footer. */
function packetBytes(index: number, payloadSize = 96): Uint8Array {
  const payload = Uint8Array.from({ length: payloadSize }, (_u, i) => (i * 13 + index) & 0xff);
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

/** Turns packet bytes into the camera frame a receiver would capture. */
function captureOf(bytes: Uint8Array, scale = 3, timestamp = 1000): CameraFrame {
  const raster = rasterizeFrame(encoder.encode(bytes), scale);

  return {
    width: raster.width,
    height: raster.height,
    format: PixelFormat.Rgba,
    data: raster.data,
    timestamp,
  };
}

describe('receiver reconstructs a packet', () => {
  it('recovers the packet bytes exactly (§14)', () => {
    const sent = packetBytes(0);
    const result = decoder.decode(captureOf(sent));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    // Not "a decode happened" — the bytes that arrive are the bytes that left.
    expect(Array.from(result.payload)).toEqual(Array.from(sent));
  });

  it('parses the recovered bytes back into the packet that was sent', () => {
    const sent = packetBytes(5);
    const result = decoder.decode(captureOf(sent));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const parsed = deserializePacket(result.payload, { expectedSessionId: SESSION });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    // The CRC written by the sender validates against the bytes that survived
    // encoding, rasterising and decoding — end-to-end integrity.
    expect(parsed.validation.valid).toBe(true);
    expect(parsed.packet.header.packetIndex).toBe(5);
    expect(parsed.packet.header.sessionId).toBe(SESSION);
    expect(parsed.packet.payload).toHaveLength(96);
  });

  it('survives a payload containing every byte value', () => {
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
    const sent = serializePacket(header, payload);

    const result = decoder.decode(captureOf(sent, 3));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.from(result.payload)).toEqual(Array.from(sent));
    }
  });

  it.each([
    ErrorCorrectionLevel.Low,
    ErrorCorrectionLevel.Medium,
    ErrorCorrectionLevel.Quartile,
    ErrorCorrectionLevel.High,
  ])('round-trips at error correction level %s (§7)', (level) => {
    const sent = packetBytes(1);
    const raster = rasterizeFrame(encoder.encode(sent, { level }), 3);
    const result = decoder.decode({
      width: raster.width,
      height: raster.height,
      format: PixelFormat.Rgba,
      data: raster.data,
      timestamp: 0,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.from(result.payload)).toEqual(Array.from(sent));
    }
  });

  it('decodes a grayscale capture, which is what a camera usually delivers', () => {
    const sent = packetBytes(2);
    const result = decoder.decode(toGrayscale(captureOf(sent)));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.from(result.payload)).toEqual(Array.from(sent));
    }
  });

  it('decodes after downsampling, which §16 recommends for cost', () => {
    // Captured at 6 pixels per module, decoded at 3.
    const sent = packetBytes(4);
    const result = decoder.decode(downsample(captureOf(sent, 6), 2));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.from(result.payload)).toEqual(Array.from(sent));
    }
  });

  it('reports where the symbol was, for framing guidance', () => {
    const result = decoder.decode(captureOf(packetBytes(0)));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.location.topLeft.x).toBeGreaterThanOrEqual(0);
      expect(result.location.bottomRight.x).toBeGreaterThan(result.location.topLeft.x);
    }
  });

  it('carries the capture timestamp through', () => {
    const result = decoder.decode(captureOf(packetBytes(0), 3, 4242));

    expect(result.ok && result.timestamp).toBe(4242);
  });
});

describe('frames that yield nothing', () => {
  it('reports a blank frame as containing no symbol', () => {
    const result = decoder.decode({
      width: 64,
      height: 64,
      format: PixelFormat.Grayscale,
      data: new Uint8ClampedArray(64 * 64).fill(128),
      timestamp: 0,
    });

    expect(result).toEqual({ ok: false, reason: DecodeFailure.NoSymbol });
  });

  it('skips a frame captured with the lens covered (§12)', () => {
    const result = decoder.decode({
      width: 32,
      height: 32,
      format: PixelFormat.Grayscale,
      data: new Uint8ClampedArray(32 * 32).fill(2),
      timestamp: 0,
    });

    expect(result).toEqual({ ok: false, reason: DecodeFailure.PoorExposure });
  });

  it('reports a malformed frame rather than throwing', () => {
    const result = decoder.decode({
      width: 10,
      height: 10,
      format: PixelFormat.Grayscale,
      data: new Uint8ClampedArray(4),
      timestamp: 0,
    });

    expect(result).toEqual({ ok: false, reason: DecodeFailure.MalformedFrame });
  });

  it('attempts a dark frame when the exposure filter is off', () => {
    const permissive = createQrDecoder({ skipPoorExposure: false });
    const result = permissive.decode({
      width: 32,
      height: 32,
      format: PixelFormat.Grayscale,
      data: new Uint8ClampedArray(32 * 32).fill(2),
      timestamp: 0,
    });

    expect(result).toEqual({ ok: false, reason: DecodeFailure.NoSymbol });
  });
});

describe('a whole file through the loop', () => {
  it('collects every packet of a multi-packet file, byte-identically', () => {
    const content = Uint8Array.from({ length: 500 }, (_u, i) => (i * 3) & 0xff);
    const packets = createPacketManager().packetize({
      sessionId: SESSION,
      fileId: FILE,
      stream: content,
      packetSize: 96,
    });

    const receiver = createPacketManager();
    const camera = createMemoryCamera();

    // The sender's frames, as the receiver's camera would see them.
    for (const packet of packets) {
      const wire = toWirePacket(packet, { protocolVersion: 1, totalPackets: packets.length });
      camera.push(captureOf(serializePacket(wire.header, wire.payload)));
    }

    // The receive loop: decode each frame, parse it, offer it to the protocol.
    camera.onFrame((frame) => {
      const decoded = decoder.decode(frame);
      if (!decoded.ok) {
        return;
      }

      const parsed = deserializePacket(decoded.payload, { expectedSessionId: SESSION });
      if (!parsed.ok || !parsed.validation.valid) {
        return;
      }

      receiver.accept(
        {
          sessionId: SESSION,
          type: 'DATA',
          fileId: FILE,
          index: parsed.packet.header.packetIndex,
          payload: parsed.packet.payload,
          size: parsed.packet.payload.byteLength,
        },
        { sessionId: SESSION, integrityVerified: parsed.validation.valid },
      );
    });

    return camera.start().then(() => {
      camera.emitAll();

      expect(receiver.isFileComplete(SESSION, FILE, packets.length)).toBe(true);

      // Reassembled in index order, the file is byte-identical to the original.
      const ordered = receiver.orderedPackets(SESSION, FILE);
      const out = new Uint8Array(content.length);
      let offset = 0;
      for (const packet of ordered) {
        out.set(packet.payload, offset);
        offset += packet.size;
      }

      expect(Array.from(out)).toEqual(Array.from(content));
    });
  });
});

describe('tracked decoding — the receiver keeps up (§12)', () => {
  /*
   * Locating a symbol is most of a decode's cost, and it scales with the
   * pixels searched. Once a code has been found, searching the whole frame for
   * it again is work whose answer is known. These pin the behaviour that makes
   * the crop safe rather than the speed it buys, because a fast receiver that
   * loses a code is worse than a slow one that does not.
   */

  /**
   * A capture of fixed size with the code placed at `offset`.
   *
   * The frame size stays constant and the code moves inside it, which is what
   * a handheld receiver actually produces. The surround is mid-grey rather
   * than white: a capture that is overwhelmingly white is rejected by the §12
   * exposure filter before any of this is reached, which would make these
   * tests pass or fail for the wrong reason.
   */
  function insetCapture(bytes: Uint8Array, offset: number, timestamp: number): CameraFrame {
    const raster = rasterizeFrame(encoder.encode(bytes), 3);
    const width = raster.width + 200;
    const height = raster.height + 200;
    const data = new Uint8ClampedArray(width * height * 4).fill(128);

    for (let index = 3; index < data.length; index += 4) {
      data[index] = 255;
    }

    for (let row = 0; row < raster.height; row += 1) {
      const from = row * raster.width * 4;
      const to = ((row + offset) * width + offset) * 4;
      data.set(raster.data.subarray(from, from + raster.width * 4), to);
    }

    return { width, height, format: PixelFormat.Rgba, data, timestamp };
  }

  it('decodes the same code repeatedly once it has been located', () => {
    const tracking = createQrDecoder();
    const sent = Uint8Array.from({ length: 120 }, (_unused, i) => i & 0xff);

    for (let frame = 0; frame < 3; frame += 1) {
      const result = tracking.decode(insetCapture(sent, 40, 1000 + frame * 100));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.from(result.payload)).toEqual(Array.from(sent));
      }
    }
  });

  it('reports positions in frame coordinates, not crop coordinates', () => {
    // Everything above the decoder describes positions in the frame it handed
    // over. A crop's own coordinates leaking out would put the symbol tens of
    // pixels from where it is.
    const tracking = createQrDecoder();
    const sent = Uint8Array.from([1, 2, 3, 4]);
    const offset = 40;

    const first = tracking.decode(insetCapture(sent, offset, 1000));
    const second = tracking.decode(insetCapture(sent, offset, 1100));

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.location.topLeft.x).toBeCloseTo(first.location.topLeft.x, 0);
      expect(second.location.topLeft.y).toBeCloseTo(first.location.topLeft.y, 0);
      expect(second.location.topLeft.x).toBeGreaterThanOrEqual(offset - 1);
    }
  });

  it('finds a code that moved, rather than aiming where it was', () => {
    // The crop must not be able to trap the decoder at a stale position.
    const tracking = createQrDecoder();
    const sent = Uint8Array.from([9, 8, 7, 6]);

    expect(tracking.decode(insetCapture(sent, 10, 1000)).ok).toBe(true);

    const moved = tracking.decode(insetCapture(sent, 150, 1100));

    expect(moved.ok).toBe(true);
    if (moved.ok) {
      // Found at the new position, so the stale crop did not trap it.
      expect(moved.location.topLeft.x).toBeGreaterThan(100);
    }
  });

  it('forgets a position that has stopped producing decodes', () => {
    // A stale anchor costs a crop on every frame and suppresses the full scan
    // that would find the code again.
    const tracking = createQrDecoder({ trackTtlMs: 50 });
    const sent = Uint8Array.from([4, 5, 6]);

    expect(tracking.decode(insetCapture(sent, 30, 1000)).ok).toBe(true);
    // Well past the TTL: this must go through a full scan and still succeed.
    expect(tracking.decode(insetCapture(sent, 30, 9000)).ok).toBe(true);
  });

  it('decodes identically with tracking disabled', () => {
    // Tracking is an optimisation. It may not change what comes out.
    const sent = Uint8Array.from({ length: 200 }, (_unused, i) => (i * 7) & 0xff);
    const plain = createQrDecoder({ trackSymbols: false });
    const tracking = createQrDecoder();

    const a = plain.decode(insetCapture(sent, 25, 1000));
    tracking.decode(insetCapture(sent, 25, 1000));
    const b = tracking.decode(insetCapture(sent, 25, 1050));

    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(Array.from(b.payload)).toEqual(Array.from(a.payload));
    }
  });
});
