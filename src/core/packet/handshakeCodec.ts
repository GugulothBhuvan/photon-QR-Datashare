/**
 * Handshake announcement — PACKET_SPEC §9.1.
 *
 * ## An announcement, not a negotiation
 *
 * §9.1 defines the payload completely, and this implements it exactly:
 *
 * | Field | Type |
 * | --- | --- |
 * | Supported Version | UInt8 |
 * | Capability Bitmap | UInt32 |
 *
 * What this module does **not** do is negotiate. PROTOCOL_SPEC §7.5 describes
 * the handshake as a mutual exchange producing an *agreed* version and *agreed*
 * capabilities, with the receiver validated by the sender — and the packet
 * registry reserves `HandshakeResponse` (`0x02`) for the reply. All of that
 * needs the receiver to speak, and Photon's optical transport runs one way:
 * the sender displays codes, the receiver holds a camera.
 *
 * So the sender **announces** and the receiver **decides**. The vocabulary here
 * is deliberate throughout, because calling this a negotiation would be a claim
 * the transport cannot support:
 *
 * | Achieved | Not achieved |
 * | --- | --- |
 * | Sender's version announced | Version *negotiated* |
 * | Sender's capabilities announced | Capabilities *agreed* |
 * | Session id shared with the receiver | Receiver validated by the sender |
 * | Receiver refuses what it cannot support | Mutual handshake completion |
 *
 * `HandshakeResponse` is left untouched: its payload is not specified, and
 * inventing one would be inventing the return path SI-014 exists to record.
 *
 * SI-014 stays open until a return channel is specified and implemented.
 */
import { ByteReader, ByteWriter } from './bytes';

/**
 * Capability bits the sender advertises (§9.1's UInt32 bitmap).
 *
 * §9.1 gives the field's width but no bit assignments, and no read section
 * enumerates them. Only bits this build can actually justify are defined; the
 * rest stay reserved rather than guessed, so a future specification can assign
 * them without colliding with an invention of ours. Recorded as A15-01.
 */
export const Capability = {
  /** Transfers packets over QR codes. Every Photon build sets this. */
  QrTransport: 1 << 0,
  /** Can resume an interrupted session (§14, §26.4). */
  Resume: 1 << 1,
  /** Recovers loss by repetition (§15.6 Strategy 1). */
  NaturalRepetition: 1 << 2,
  /** Verifies files with SHA-256 (§20.7). */
  Sha256Integrity: 1 << 3,
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

/** What this build advertises. Derived from what is actually implemented. */
export const PHOTON_CAPABILITIES =
  Capability.QrTransport |
  Capability.Resume |
  Capability.NaturalRepetition |
  Capability.Sha256Integrity;

/** A decoded announcement. */
export interface HandshakeAnnouncement {
  /** The protocol version the sender speaks (§9.1 Supported Version). */
  readonly protocolVersion: number;
  /** The sender's capability bitmap (§9.1). */
  readonly capabilities: number;
}

/** Why an announcement was refused. */
export const HandshakeRejection = {
  /** Payload shorter than §9.1's five bytes. */
  Truncated: 'TRUNCATED',
  /** The sender speaks a version this build does not (§23). */
  UnsupportedVersion: 'UNSUPPORTED_VERSION',
  /** The sender requires something this build cannot do. */
  UnsupportedCapability: 'UNSUPPORTED_CAPABILITY',
} as const;

export type HandshakeRejection = (typeof HandshakeRejection)[keyof typeof HandshakeRejection];

export interface HandshakeAccepted {
  readonly ok: true;
  readonly announcement: HandshakeAnnouncement;
}

export interface HandshakeRefused {
  readonly ok: false;
  readonly reason: HandshakeRejection;
  /** What was read, when anything was. Lets a screen say *why* it refused. */
  readonly announcement?: HandshakeAnnouncement;
}

export type HandshakeResult = HandshakeAccepted | HandshakeRefused;

/** §9.1's payload is exactly five bytes. */
export const HANDSHAKE_PAYLOAD_BYTES = 5;

/** Encodes this build's announcement (§9.1). */
export function encodeHandshake(
  protocolVersion: number,
  capabilities: number = PHOTON_CAPABILITIES,
): Uint8Array {
  const buffer = new Uint8Array(HANDSHAKE_PAYLOAD_BYTES);

  new ByteWriter(buffer).uint8(protocolVersion).uint32(capabilities >>> 0);

  return buffer;
}

export interface HandshakeExpectations {
  /** Versions this build accepts. */
  readonly supportedVersions: readonly number[];
  /**
   * Capabilities this build can perform.
   *
   * An announcement advertising something outside this set is **not** refused:
   * §29.5 requires unsupported *optional* features not to prevent
   * communication when they are not required. Only a version mismatch refuses
   * outright, because §24 makes that the compatibility boundary.
   */
  readonly supportedCapabilities?: number;
}

/**
 * Reads an announcement and decides whether this receiver can proceed.
 *
 * The decision is unilateral — the sender is never told. That is the whole
 * shape of a one-way transport, and it is why this returns a verdict for the
 * *receiver's* use rather than something to transmit back.
 */
export function decodeHandshake(
  payload: Uint8Array,
  expectations: HandshakeExpectations,
): HandshakeResult {
  if (payload.length < HANDSHAKE_PAYLOAD_BYTES) {
    return { ok: false, reason: HandshakeRejection.Truncated };
  }

  const reader = new ByteReader(payload);
  const announcement: HandshakeAnnouncement = Object.freeze({
    protocolVersion: reader.uint8(),
    capabilities: reader.uint32(),
  });

  if (!expectations.supportedVersions.includes(announcement.protocolVersion)) {
    return { ok: false, reason: HandshakeRejection.UnsupportedVersion, announcement };
  }

  return { ok: true, announcement };
}

/** Whether an announcement advertises a capability. */
export function announces(announcement: HandshakeAnnouncement, capability: Capability): boolean {
  return (announcement.capabilities & capability) !== 0;
}
