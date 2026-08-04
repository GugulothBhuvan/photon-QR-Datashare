/**
 * PacketCodec — the seam between the Protocol layer and the Binary layer.
 *
 * ```text
 * Protocol   managers          what may be done with a packet
 *   ↓        (this contract)
 * Binary     @core/packet/*    how a packet is laid out in bytes
 * ```
 *
 * The protocol engine coordinates serialization without implementing it. A
 * manager holding this interface contains no offsets, no CRC and no
 * endianness, and works unchanged if the optical transport is one day replaced
 * by another (PROTOCOL_SPEC §2.2, §3.2).
 */
import type { Packet } from '@domain/packet';

/** A packet parsed from bytes, with the verdict the binary layer reached. */
export interface DecodedPacket {
  readonly packet: Packet;
  /**
   * Whether the packet's own integrity check passed (PACKET_SPEC §12).
   *
   * Carried alongside rather than folded into the packet, because
   * PROTOCOL_SPEC §11.12 has integrity verified before a packet is stored and
   * the protocol layer needs the verdict to make that decision.
   */
  readonly integrityVerified: boolean;
}

export interface PacketCodec {
  /** Encodes a packet to its wire form. */
  encode(packet: Packet): Uint8Array;

  /**
   * Parses a packet from bytes.
   *
   * @returns `undefined` when the bytes could not produce a packet at all.
   *   A packet that parsed but failed validation is returned with
   *   `integrityVerified: false`, so the protocol layer can count it.
   */
  decode(bytes: Uint8Array): DecodedPacket | undefined;
}
