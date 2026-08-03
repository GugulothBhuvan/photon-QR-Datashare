/**
 * Packet test vectors — PACKET_SPEC §5, §6, §10.
 *
 * These fixtures pin the wire format. A change to any offset, width or byte
 * order fails here loudly, which is the point: the specification and the
 * implementation are supposed to agree byte for byte, and a round-trip test
 * alone cannot catch a layout change that is symmetric.
 *
 * Vectors are generated, never hand-written. To regenerate after an
 * intentional format change:
 *
 * ```
 * UPDATE_PACKET_VECTORS=1 npm test -- packetVectors
 * ```
 *
 * Regenerating is an explicit act. If a vector changes without the protocol
 * specification changing first, the change is a defect (AGENTS.md §7).
 */
import fs from 'fs';
import path from 'path';

import { DIGEST_FOOTER, SHA256_SIZE } from '@core/packet/footer';
import { createPacketHeader, noFlags, PacketTypeId } from '@core/packet/header';
import { serializePacket, type SerializeOptions } from '@core/packet/serializer';
import { deserializePacket } from '@core/packet/deserializer';
import type { PacketHeader } from '@core/packet/header';

const VECTOR_DIR = path.resolve(__dirname, '..', '..', 'test_vectors', 'packets');
const UPDATE = process.env['UPDATE_PACKET_VECTORS'] === '1';

const SESSION = '0f9e8d7c-6b5a-4938-8271-605f4e3d2c1b';
const FILE = '11111111-2222-3333-4444-555555555555';

interface Vector {
  readonly name: string;
  readonly description: string;
  readonly header: PacketHeader;
  readonly payload: Uint8Array;
  readonly options: SerializeOptions;
}

const sequential = (length: number): Uint8Array =>
  Uint8Array.from({ length }, (_unused, index) => index & 0xff);

const VECTORS: readonly Vector[] = [
  {
    name: 'data-minimal',
    description: 'Data packet, empty payload, CRC-only footer.',
    header: createPacketHeader({
      protocolVersion: 1,
      packetType: PacketTypeId.Data,
      sessionId: SESSION,
      fileId: FILE,
      packetIndex: 0,
      totalPackets: 1,
      payloadLength: 0,
    }),
    payload: new Uint8Array(),
    options: {},
  },
  {
    name: 'data-typical',
    description: 'Data packet, 256-byte payload covering every byte value.',
    header: createPacketHeader({
      protocolVersion: 1,
      packetType: PacketTypeId.Data,
      sessionId: SESSION,
      fileId: FILE,
      packetIndex: 41,
      totalPackets: 100,
      payloadLength: 256,
    }),
    payload: sequential(256),
    options: {},
  },
  {
    name: 'data-final-compressed',
    description: 'Final data packet with the compression and final-packet flags set.',
    header: createPacketHeader({
      protocolVersion: 1,
      packetType: PacketTypeId.Data,
      sessionId: SESSION,
      fileId: FILE,
      packetIndex: 99,
      totalPackets: 100,
      payloadLength: 8,
      flags: { ...noFlags, compressionEnabled: true, finalPacket: true },
    }),
    payload: sequential(8),
    options: {},
  },
  {
    name: 'manifest-nil-file',
    description: 'Manifest packet: belongs to no single file, so the file id is the nil UUID.',
    header: createPacketHeader({
      protocolVersion: 1,
      packetType: PacketTypeId.Manifest,
      sessionId: SESSION,
      packetIndex: 0,
      totalPackets: 1,
      payloadLength: 16,
    }),
    payload: sequential(16),
    options: {},
  },
  {
    name: 'data-with-digest',
    description: 'Data packet with the optional 32-byte SHA-256 footer field present.',
    header: createPacketHeader({
      protocolVersion: 1,
      packetType: PacketTypeId.Data,
      sessionId: SESSION,
      fileId: FILE,
      packetIndex: 1,
      totalPackets: 4,
      payloadLength: 4,
    }),
    payload: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    options: {
      footerLayout: DIGEST_FOOTER,
      digest: new Uint8Array(SHA256_SIZE).fill(0xa5),
    },
  },
  {
    name: 'field-boundaries',
    description: 'Maximum values for the one-byte version and four-byte counter fields.',
    header: createPacketHeader({
      protocolVersion: 255,
      packetType: PacketTypeId.Recovery,
      sessionId: SESSION,
      fileId: FILE,
      packetIndex: 0xfffffffe,
      totalPackets: 0xffffffff,
      payloadLength: 2,
    }),
    payload: new Uint8Array([0xff, 0x00]),
    options: {},
  },
];

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const fileFor = (name: string): string => path.join(VECTOR_DIR, `${name}.json`);

beforeAll(() => {
  if (UPDATE) {
    fs.mkdirSync(VECTOR_DIR, { recursive: true });
  }
});

describe('packet test vectors', () => {
  it.each(VECTORS.map((vector) => [vector.name, vector] as const))(
    '%s matches its recorded bytes',
    (name, vector) => {
      const bytes = serializePacket(vector.header, vector.payload, vector.options);
      const record = {
        name: vector.name,
        description: vector.description,
        specification: 'docs/PACKET_SPEC.md §5, §6, §10',
        protocolVersion: vector.header.protocolVersion,
        packetType: vector.header.packetType,
        byteLength: bytes.byteLength,
        hex: toHex(bytes),
      };

      if (UPDATE) {
        fs.writeFileSync(fileFor(name), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
      }

      const raw = fs.readFileSync(fileFor(name), 'utf8');
      const expected = JSON.parse(raw) as typeof record;

      expect(record.byteLength).toBe(expected.byteLength);
      expect(record.hex).toBe(expected.hex);
    },
  );

  it.each(VECTORS.map((vector) => [vector.name, vector] as const))(
    '%s parses back to the packet it came from',
    (_name, vector) => {
      const bytes = serializePacket(vector.header, vector.payload, vector.options);
      const result = deserializePacket(bytes, {
        ...(vector.options.footerLayout === undefined
          ? {}
          : { footerLayout: vector.options.footerLayout }),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.validation.valid).toBe(true);
      expect(result.packet.header).toEqual(vector.header);
      expect(Array.from(result.packet.payload)).toEqual(Array.from(vector.payload));
    },
  );

  it('covers each packet type the domain model produces', () => {
    const types = new Set(VECTORS.map((vector) => vector.header.packetType));

    expect(types.has(PacketTypeId.Data)).toBe(true);
    expect(types.has(PacketTypeId.Manifest)).toBe(true);
    expect(types.has(PacketTypeId.Recovery)).toBe(true);
  });
});
