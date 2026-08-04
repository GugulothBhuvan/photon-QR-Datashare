/**
 * packet/ — Binary packet layer (Phase 3, PKT-001…PKT-005)
 *
 * Implements docs/PACKET_SPEC.md: the 50-byte common header (§5), the footer
 * (§6), the packet registry (§7), flags (§8), and the serialization (§10),
 * parsing (§11) and validation (§12) rules.
 *
 * This layer *wraps* the Phase 2 domain model. `toWirePacket` transforms a
 * domain `Packet` into wire form; the domain model itself is unchanged.
 */

export {
  bytesToUuid,
  ByteReader,
  ByteWidth,
  ByteWriter,
  isUuid,
  NIL_UUID,
  UINT16_MAX,
  UINT32_MAX,
  UINT8_MAX,
  uuidToBytes,
} from './bytes';

export { crc32 } from './crc32';

export {
  createPacketFooter,
  CRC32_SIZE,
  DIGEST_FOOTER,
  footerEquals,
  footerSize,
  FOOTER_SIZE_MINIMAL,
  FOOTER_SIZE_WITH_DIGEST,
  layoutOf,
  MINIMAL_FOOTER,
  SHA256_SIZE,
  type FooterLayout,
  type PacketFooter,
} from './footer';

export {
  bitsToFlags,
  createPacketHeader,
  DEFINED_FLAGS_MASK,
  FlagBit,
  flagsToBits,
  hasFile,
  hasReservedBitsSet,
  headerEquals,
  HeaderOffset,
  HEADER_SIZE,
  isKnownPacketType,
  MAGIC_NUMBER,
  noFlags,
  PacketTypeId,
  type PacketFlags,
  type PacketHeader,
  type PacketHeaderInput,
} from './header';

export {
  packetSize,
  packetTypeIdOf,
  serializePacket,
  serializeWirePacket,
  toWirePacket,
  type SerializeOptions,
  type ToWireOptions,
  type WirePacket,
} from './serializer';

export {
  deserializePacket,
  tryDeserializePacket,
  type DeserializeFailure,
  type DeserializeOptions,
  type DeserializeResult,
  type DeserializeSuccess,
} from './deserializer';

export {
  mergeResults,
  PacketRejection,
  validateChecksum,
  validateFlagBits,
  validateHeader,
  type HeaderValidationOptions,
  type ValidationResult,
} from './validator';

export {
  AcceptOutcome,
  createPacketManager,
  PacketProtocolRejection,
  type AcceptResult,
  type PacketExpectations,
  type PacketizeInput,
  type PacketManager,
  type PacketManagerOptions,
  type PacketValidationResult,
} from './packetManager';
