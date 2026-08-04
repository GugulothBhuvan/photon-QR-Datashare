/**
 * File builder (REC-004) — PROTOCOL_SPEC §13.11, §13.12, §11.18.
 *
 * Reassembles a file's binary stream from its validated packets.
 *
 * §13.12 is unusually emphatic, and the emphasis is the design: reconstruction
 * SHALL occur strictly in ascending Packet Index order, and no implementation
 * SHALL reconstruct using arrival timestamp, decode order, transport frame
 * order or storage order. So this module **sorts by index itself** rather than
 * trusting the order it is handed. A caller passing packets in arrival order
 * gets the same file as one passing them sorted, because the ordering
 * guarantee cannot be delegated to a caller who might not honour it.
 *
 * §13.11 makes a file eligible for reconstruction only when every expected
 * packet is present, so building refuses to run on an incomplete set rather
 * than producing a file with a hole in it.
 */
import { AppError, ErrorCode } from '@core/errors';

import type { Packet } from '@domain/packet';

/** Why a file could not be built. */
export const BuildFailure = {
  /** §13.11: not every expected packet has been validated. */
  Incomplete: 'INCOMPLETE',
  /** Two packets claim the same index with different contents (§13.17). */
  ConflictingIndex: 'CONFLICTING_INDEX',
  /** A packet's index lies outside the declared range (§13.17). */
  IndexOutOfRange: 'INDEX_OUT_OF_RANGE',
  /** Packets from more than one file were supplied (§13.13). */
  MixedFiles: 'MIXED_FILES',
  /** Packets from more than one session were supplied (§8.11). */
  MixedSessions: 'MIXED_SESSIONS',
} as const;

export type BuildFailure = (typeof BuildFailure)[keyof typeof BuildFailure];

export interface BuildSuccess {
  readonly ok: true;
  /** The reconstructed binary stream (§3.9). */
  readonly stream: Uint8Array;
  readonly packetCount: number;
}

export interface BuildRejected {
  readonly ok: false;
  readonly reason: BuildFailure;
  /** Indices still required, when the reason is `Incomplete`. */
  readonly missing?: readonly number[];
}

export type BuildResult = BuildSuccess | BuildRejected;

export interface BuildOptions {
  /** Packets the manifest declares for this file (§10.5). */
  readonly expectedPackets: number;
}

/**
 * Reassembles a file from its packets.
 *
 * @param packets Validated packets for one file, in any order.
 * @param options The manifest's expectation for the file.
 */
export function buildFile(packets: readonly Packet[], options: BuildOptions): BuildResult {
  const { expectedPackets } = options;

  if (!Number.isInteger(expectedPackets) || expectedPackets < 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'Expected packet count must be a non-negative integer.',
      { details: { expectedPackets } },
    );
  }

  // §13.13: indices are unique within a *file*. Packets from two files share
  // an index space, so mixing them would silently interleave two streams.
  const files = new Set(packets.map((packet) => packet.fileId));
  if (files.size > 1) {
    return { ok: false, reason: BuildFailure.MixedFiles };
  }

  // §8.11: cross-session mixing is a protocol violation.
  const sessions = new Set(packets.map((packet) => packet.sessionId));
  if (sessions.size > 1) {
    return { ok: false, reason: BuildFailure.MixedSessions };
  }

  const byIndex = new Map<number, Packet>();

  for (const packet of packets) {
    if (packet.index < 0 || packet.index >= expectedPackets) {
      return { ok: false, reason: BuildFailure.IndexOutOfRange };
    }

    const existing = byIndex.get(packet.index);

    if (existing === undefined) {
      byIndex.set(packet.index, packet);
      continue;
    }

    // §13.17: a duplicate index with an inconsistent payload is an ordering
    // error. Identical duplicates are expected and harmless (§11.13).
    if (!samePayload(existing, packet)) {
      return { ok: false, reason: BuildFailure.ConflictingIndex };
    }
  }

  // §13.11: eligible only when received packets equal expected packets.
  if (byIndex.size !== expectedPackets) {
    const missing: number[] = [];
    for (let index = 0; index < expectedPackets; index += 1) {
      if (!byIndex.has(index)) {
        missing.push(index);
      }
    }

    return { ok: false, reason: BuildFailure.Incomplete, missing };
  }

  let total = 0;
  for (const packet of byIndex.values()) {
    total += packet.size;
  }

  const stream = new Uint8Array(total);
  let offset = 0;

  // §13.12: strictly ascending index order, counted rather than iterated over
  // the map, so insertion order cannot influence the result.
  for (let index = 0; index < expectedPackets; index += 1) {
    const packet = byIndex.get(index) as Packet;
    stream.set(packet.payload, offset);
    offset += packet.size;
  }

  return { ok: true, stream, packetCount: expectedPackets };
}

/** Whether two packets carry identical bytes. */
function samePayload(left: Packet, right: Packet): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (let i = 0; i < left.size; i += 1) {
    if (left.payload[i] !== right.payload[i]) {
      return false;
    }
  }

  return true;
}
