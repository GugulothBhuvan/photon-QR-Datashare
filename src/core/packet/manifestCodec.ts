/**
 * Manifest wire encoding — **Photon v0.1 provisional** (SI-015).
 *
 * ## What this is, and what it is not
 *
 * `PACKET_SPEC.md` §9.2 defines the manifest packet payload as two fields:
 *
 * | Field | Type |
 * | --- | --- |
 * | File Count | UInt16 |
 * | Metadata | **Variable** |
 *
 * and defers the rest to `PROTOCOL_SPEC.md`, which enumerates what a manifest
 * *contains* (§10.5) without giving a byte layout for any of it — no field
 * order, no string encoding, no length convention, no delimiter for a variable
 * number of files.
 *
 * So this module implements the two fields §9.2 **does** define, exactly as it
 * defines them, and fills the undefined "Metadata" region with a Photon-specific
 * encoding. It does not contradict the specification; it occupies the hole the
 * specification leaves.
 *
 * **This is not §9.2 compliance and must never be described as such.**
 *
 * | | |
 * | --- | --- |
 * | Photon v0.1 ↔ Photon v0.1 | Supported |
 * | Interoperability with other implementations | **Not claimed** |
 * | Future protocol compatibility | **Not claimed** |
 *
 * See ADR-0006 and SI-015. SI-015 stays open until §9.2 is completed.
 *
 * ## Design rules
 *
 * - **Length-prefixed, never delimited.** A delimiter cannot appear in a
 *   filename; a length always can be trusted. Every variable field carries a
 *   `UInt16` byte length before its bytes.
 * - **Fixed field order.** Nothing iterates an object, so encoding never
 *   depends on JavaScript property order and the same manifest always produces
 *   the same bytes.
 * - **Versioned separately from the protocol.** See `MANIFEST_ENCODING_VERSION`.
 * - **Derived values are not encoded.** `fileCount` is §9.2's own field;
 *   `totalSize` and `totalPacketCount` are recomputed from the entries on
 *   decode, because A2-08 makes an inconsistent manifest unconstructable and
 *   transmitting them would create a second source of truth.
 *
 * ## Layout
 *
 * ```text
 * UInt16  fileCount                     ← §9.2
 * ─── Metadata (Variable) — Photon v0.1 ───
 * UInt8   encodingVersion
 * 16      sessionId (UUID)
 * UInt8   protocolVersion
 * UInt32  createdAt high
 * UInt32  createdAt low                 ← epoch ms, split; JS has no UInt64
 * UInt8   flags   bit0 transferId, bit1 name
 * [16]    transferId                    if bit0
 * [str]   name                          if bit1
 * UInt32  packetSize
 * [str]   recoveryMethod
 * [str]   integrityAlgorithm
 * UInt16  transportCapabilityCount
 *   [str] capability                    × count
 * ─── entries × fileCount ───
 * 16      fileId (UUID)
 * [str]   name
 * [str]   extension                     may be empty
 * [str]   mimeType                      may be empty
 * UInt32  size high
 * UInt32  size low
 * [str]   hash
 * UInt32  packetCount
 * [str]   compression
 * [str]   encryption
 * ```
 *
 * `[str]` is `UInt16` byte length followed by that many UTF-8 bytes.
 */
import { createFileMetadata } from '@domain/fileMetadata';
import {
  fileId as toFileId,
  sessionId as toSessionId,
  transferId as toTransferId,
} from '@domain/ids';
import { createManifest, type Manifest, type ManifestEntryInput } from '@domain/manifest';

import { ByteReader, ByteWriter, UINT16_MAX } from './bytes';

/**
 * Version of **this encoding**, not of the protocol.
 *
 * They are separate concepts and must not be conflated:
 *
 * - **Protocol version** (`PROTOCOL_VERSION`, OSP/1.0) describes the packet
 *   header, the session rules and the transfer semantics. It travels in the
 *   packet header and is governed by PROTOCOL_SPEC §23.
 * - **Manifest encoding version** describes only the byte layout of this
 *   payload. It exists solely because §9.2 leaves that layout undefined, and it
 *   disappears the moment the specification supplies one.
 *
 * A future OSP/1.0 implementation could use a completely different manifest
 * encoding without changing the protocol version, which is precisely why a
 * receiver must check this separately and refuse what it cannot read.
 */
export const MANIFEST_ENCODING_VERSION = 1;

/** Why a manifest payload could not be decoded. */
export const ManifestDecodeFailure = {
  /** Fewer bytes than the layout requires. */
  Truncated: 'TRUNCATED',
  /** An encoding version this build cannot interpret. */
  UnsupportedEncodingVersion: 'UNSUPPORTED_ENCODING_VERSION',
  /** A declared length runs past the end of the payload. */
  BadLength: 'BAD_LENGTH',
  /** Entry count disagrees with §9.2's file count. */
  CountMismatch: 'COUNT_MISMATCH',
  /** A field held a value the domain model rejects. */
  InvalidField: 'INVALID_FIELD',
} as const;

export type ManifestDecodeFailure =
  (typeof ManifestDecodeFailure)[keyof typeof ManifestDecodeFailure];

export interface ManifestDecodeSuccess {
  readonly ok: true;
  readonly manifest: Manifest;
}

export interface ManifestDecodeRejection {
  readonly ok: false;
  readonly reason: ManifestDecodeFailure;
  /** The encoding version read, when one was readable. */
  readonly encodingVersion?: number;
}

export type ManifestDecodeResult = ManifestDecodeSuccess | ManifestDecodeRejection;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

/** Upper bound on any single variable field, imposed by its UInt16 length. */
export const MAX_FIELD_BYTES = UINT16_MAX;

function writeString(writer: ByteWriter, value: string): void {
  const bytes = encoder.encode(value);

  if (bytes.length > MAX_FIELD_BYTES) {
    throw new RangeError(`Manifest field exceeds ${MAX_FIELD_BYTES} bytes: ${bytes.length}.`);
  }

  writer.uint16(bytes.length).bytes(bytes);
}

/** Splits an epoch-millisecond or byte count into two 32-bit halves. */
function writeUint64(writer: ByteWriter, value: number): void {
  const high = Math.floor(value / 0x1_0000_0000);
  writer.uint32(high >>> 0).uint32((value - high * 0x1_0000_0000) >>> 0);
}

/** Bytes this manifest will occupy, so the writer allocates exactly once. */
function encodedLength(manifest: Manifest): number {
  const stringLength = (value: string): number => 2 + encoder.encode(value).length;

  let total = 2 + 1 + 16 + 1 + 8 + 1; // count, version, session, protocol, createdAt, flags

  if (manifest.transferId !== undefined) {
    total += 16;
  }
  if (manifest.name !== undefined) {
    total += stringLength(manifest.name);
  }

  total += 4;
  total += stringLength(manifest.configuration.recoveryMethod);
  total += stringLength(manifest.configuration.integrityAlgorithm);
  total += 2;

  for (const capability of manifest.configuration.transportCapabilities) {
    total += stringLength(capability);
  }

  for (const entry of manifest.entries) {
    total +=
      16 +
      stringLength(entry.file.name) +
      stringLength(entry.file.extension) +
      stringLength(entry.file.mimeType) +
      8 +
      stringLength(entry.file.hash) +
      4 +
      stringLength(entry.compression) +
      stringLength(entry.encryption);
  }

  return total;
}

/**
 * Encodes a manifest as the payload of a manifest packet.
 *
 * Deterministic: the same manifest always produces byte-identical output.
 *
 * @throws RangeError when a field exceeds what its length prefix can express,
 *   or when there are more files than §9.2's UInt16 count can hold. Both are
 *   programming errors rather than protocol conditions — a manifest that cannot
 *   be expressed must not be silently truncated into one that can.
 */
export function encodeManifest(manifest: Manifest): Uint8Array {
  if (manifest.entries.length > UINT16_MAX) {
    throw new RangeError(`A manifest may describe at most ${UINT16_MAX} files.`);
  }

  const buffer = new Uint8Array(encodedLength(manifest));
  const writer = new ByteWriter(buffer);

  // §9.2's own field, first, exactly as the specification orders it.
  writer.uint16(manifest.entries.length);

  // Everything below occupies §9.2's undefined "Metadata (Variable)" region.
  writer.uint8(MANIFEST_ENCODING_VERSION);
  writer.uuid(manifest.sessionId);
  writer.uint8(manifest.protocolVersion);
  writeUint64(writer, manifest.createdAt);

  const flags = (manifest.transferId === undefined ? 0 : 1) | (manifest.name === undefined ? 0 : 2);
  writer.uint8(flags);

  if (manifest.transferId !== undefined) {
    writer.uuid(manifest.transferId);
  }
  if (manifest.name !== undefined) {
    writeString(writer, manifest.name);
  }

  writer.uint32(manifest.configuration.packetSize);
  writeString(writer, manifest.configuration.recoveryMethod);
  writeString(writer, manifest.configuration.integrityAlgorithm);
  writer.uint16(manifest.configuration.transportCapabilities.length);

  for (const capability of manifest.configuration.transportCapabilities) {
    writeString(writer, capability);
  }

  for (const entry of manifest.entries) {
    writer.uuid(entry.file.id);
    writeString(writer, entry.file.name);
    writeString(writer, entry.file.extension);
    writeString(writer, entry.file.mimeType);
    writeUint64(writer, entry.file.size);
    writeString(writer, entry.file.hash);
    writer.uint32(entry.packetCount);
    writeString(writer, entry.compression);
    writeString(writer, entry.encryption);
  }

  return buffer;
}

/**
 * Decodes a manifest payload.
 *
 * Reports failure rather than throwing: a malformed manifest arrives from the
 * outside world over an unreliable optical link, so it is an expected input,
 * not an exceptional one. §10.13 requires a rejected manifest to initialize no
 * protocol state, which is why nothing is returned unless the whole payload
 * parsed.
 */
export function decodeManifest(payload: Uint8Array): ManifestDecodeResult {
  const reader = new ByteReader(payload);

  const rejection = (
    reason: ManifestDecodeFailure,
    encodingVersion?: number,
  ): ManifestDecodeRejection =>
    encodingVersion === undefined ? { ok: false, reason } : { ok: false, reason, encodingVersion };

  function readString(): string {
    const length = reader.uint16();

    if (length > reader.remaining) {
      throw new RangeError(ManifestDecodeFailure.BadLength);
    }

    return decoder.decode(reader.bytes(length));
  }

  function readUint64(): number {
    return reader.uint32() * 0x1_0000_0000 + reader.uint32();
  }

  try {
    const fileCount = reader.uint16();
    const encodingVersion = reader.uint8();

    // Checked before anything else is interpreted. A different layout read as
    // this one would produce plausible nonsense rather than an error.
    if (encodingVersion !== MANIFEST_ENCODING_VERSION) {
      return rejection(ManifestDecodeFailure.UnsupportedEncodingVersion, encodingVersion);
    }

    const sessionId = toSessionId(reader.uuid());
    const protocolVersion = reader.uint8();
    const createdAt = readUint64();
    const flags = reader.uint8();

    const transferId = (flags & 1) === 0 ? undefined : toTransferId(reader.uuid());
    const name = (flags & 2) === 0 ? undefined : readString();

    const packetSize = reader.uint32();
    const recoveryMethod = readString();
    const integrityAlgorithm = readString();

    const capabilityCount = reader.uint16();
    const transportCapabilities: string[] = [];

    for (let index = 0; index < capabilityCount; index += 1) {
      transportCapabilities.push(readString());
    }

    const entries: ManifestEntryInput[] = [];

    for (let index = 0; index < fileCount; index += 1) {
      const id = toFileId(reader.uuid());
      const fileName = readString();
      const extension = readString();
      const mimeType = readString();
      const size = readUint64();
      const hash = readString();
      const packetCount = reader.uint32();
      const compression = readString();
      const encryption = readString();

      entries.push({
        file: createFileMetadata({ id, name: fileName, size, hash, extension, mimeType }),
        packetCount,
        compression,
        encryption,
      });
    }

    // §9.2's count is authoritative; the entries must agree with it. They
    // cannot disagree here by construction, but a future layout change could
    // break that, and a silent mismatch would misreport the transfer's size.
    if (entries.length !== fileCount) {
      return rejection(ManifestDecodeFailure.CountMismatch);
    }

    const manifest = createManifest({
      sessionId,
      protocolVersion: protocolVersion as never,
      createdAt,
      entries,
      configuration: {
        packetSize,
        recoveryMethod,
        integrityAlgorithm,
        transportCapabilities,
      },
      ...(transferId === undefined ? {} : { transferId }),
      ...(name === undefined ? {} : { name }),
    });

    return { ok: true, manifest };
  } catch (error: unknown) {
    if (error instanceof RangeError && error.message === ManifestDecodeFailure.BadLength) {
      return rejection(ManifestDecodeFailure.BadLength);
    }

    // A reader that ran past the end, or a domain model that refused a value.
    // Both mean the payload was not a manifest this build can accept.
    return rejection(
      error instanceof RangeError
        ? ManifestDecodeFailure.Truncated
        : ManifestDecodeFailure.InvalidField,
    );
  }
}
