/**
 * Packet model (MOD-002) — PROTOCOL_SPEC §3.10–§3.15.
 *
 * Domain only: nothing here concerns binary layout, which is PACKET_SPEC.md
 * and Phase 3.
 */
import { fileId, sessionId } from '@domain/ids';
import {
  copyPayload,
  createPacket,
  isSamePosition,
  packetEquals,
  PacketType,
} from '@domain/packet';
import { AppError } from '@core/errors';

const session = sessionId('11111111-1111-4111-8111-111111111111');
const file = fileId('f1000000-0000-4000-8000-000000000001');

const baseInput = {
  sessionId: session,
  fileId: file,
  index: 0,
  payload: new Uint8Array([1, 2, 3]),
};

describe('createPacket', () => {
  it('defaults to a data packet', () => {
    expect(createPacket(baseInput).type).toBe(PacketType.Data);
  });

  it('records the payload size', () => {
    expect(createPacket(baseInput).size).toBe(3);
  });

  it('belongs to exactly one session (§3.10)', () => {
    expect(createPacket(baseInput).sessionId).toBe(session);
  });

  it('is frozen', () => {
    const packet = createPacket(baseInput);

    expect(Object.isFrozen(packet)).toBe(true);
    (packet as { index: number }).index = 99;
    expect(packet.index).toBe(0);
  });

  it('copies the payload so a reused sender buffer cannot alter it (§3.12)', () => {
    const buffer = new Uint8Array([1, 2, 3]);
    const packet = createPacket({ ...baseInput, payload: buffer });

    buffer[0] = 255;

    expect(packet.payload[0]).toBe(1);
  });

  it('accepts an empty payload', () => {
    const packet = createPacket({ ...baseInput, payload: new Uint8Array() });

    expect(packet.size).toBe(0);
  });

  it('accepts index zero — indices are zero-based (§3.13)', () => {
    expect(createPacket({ ...baseInput, index: 0 }).index).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN])('rejects an index of %p', (index) => {
    expect(() => createPacket({ ...baseInput, index })).toThrow(AppError);
  });

  describe('packet types', () => {
    it('requires a data packet to reference a file (§3.13)', () => {
      expect(() =>
        createPacket({
          sessionId: session,
          index: 0,
          payload: new Uint8Array([1]),
          type: PacketType.Data,
        }),
      ).toThrow(AppError);
    });

    it('allows a manifest packet with no file, since it describes the transfer', () => {
      const packet = createPacket({
        sessionId: session,
        index: 0,
        payload: new Uint8Array([1]),
        type: PacketType.Manifest,
      });

      expect(packet.fileId).toBeUndefined();
      expect(packet.type).toBe(PacketType.Manifest);
    });

    it('allows a recovery packet', () => {
      expect(createPacket({ ...baseInput, type: PacketType.Recovery }).type).toBe(
        PacketType.Recovery,
      );
    });
  });
});

describe('copyPayload', () => {
  it('returns a buffer the caller may safely mutate', () => {
    const packet = createPacket(baseInput);
    const copy = copyPayload(packet);

    copy[0] = 255;

    expect(packet.payload[0]).toBe(1);
    expect(copy).not.toBe(packet.payload);
  });
});

describe('isSamePosition', () => {
  it('identifies a duplicate by position, not contents (§3.25)', () => {
    const first = createPacket(baseInput);
    const second = createPacket({ ...baseInput, payload: new Uint8Array([9, 9, 9]) });

    expect(isSamePosition(first, second)).toBe(true);
    expect(packetEquals(first, second)).toBe(false);
  });

  it.each([
    ['session', { sessionId: sessionId('22222222-2222-4222-8222-222222222222') }],
    ['file', { fileId: fileId('f1000000-0000-4000-8000-000000000002') }],
    ['index', { index: 1 }],
    ['type', { type: PacketType.Recovery }],
  ])('treats a different %s as a different position', (_label, change) => {
    expect(isSamePosition(createPacket(baseInput), createPacket({ ...baseInput, ...change }))).toBe(
      false,
    );
  });
});

describe('packetEquals', () => {
  it('compares payload bytes', () => {
    expect(packetEquals(createPacket(baseInput), createPacket(baseInput))).toBe(true);
  });

  it('detects a differing byte', () => {
    expect(
      packetEquals(
        createPacket(baseInput),
        createPacket({ ...baseInput, payload: new Uint8Array([1, 2, 4]) }),
      ),
    ).toBe(false);
  });

  it('detects a differing length', () => {
    expect(
      packetEquals(
        createPacket(baseInput),
        createPacket({ ...baseInput, payload: new Uint8Array([1, 2]) }),
      ),
    ).toBe(false);
  });
});
