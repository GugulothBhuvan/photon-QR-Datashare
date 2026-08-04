/**
 * Packet Map (REC-001, REC-002) — PROTOCOL_SPEC §13.16, §13.17.
 *
 * §13.16 requires every receiver to maintain a Packet Map recording, for every
 * packet index: Received, Missing, Corrupted, Recovered, Duplicate.
 *
 * Those five are not five values of one variable. An index that was received,
 * then saw two duplicates and one corrupted copy, is simultaneously *received*,
 * *duplicated* and *corrupted* — and §13.16's own example lists one label per
 * index only because each of its indices happens to have one story. So the map
 * holds a **primary state** (what the index is now) alongside **observation
 * counts** (what has been seen at it). Collapsing them would lose the fact that
 * a packet arrived corrupted three times before a good copy landed, which is
 * exactly the diagnostic §13.16 exists to provide.
 *
 * §13.16: "The Packet Map SHALL be updated only after successful packet
 * validation." Reflected in the API — `markReceived` and `markRecovered` are
 * the only calls that change a primary state, and §13.17's rejected packets
 * "SHALL NOT modify the Packet Map" is why `markRejected` does not exist.
 */
import { AppError, ErrorCode } from '@core/errors';

/** What an index *is*, per §13.16. */
export const PacketState = {
  /** Expected by the manifest, never validated (§11.14). */
  Missing: 'MISSING',
  /** A valid copy arrived normally. */
  Received: 'RECEIVED',
  /** A valid copy arrived through the Recovery Protocol (§15). */
  Recovered: 'RECOVERED',
} as const;

export type PacketState = (typeof PacketState)[keyof typeof PacketState];

/** Everything known about one index. */
export interface PacketMapEntry {
  readonly index: number;
  readonly state: PacketState;
  /** Valid copies seen after the first (§13.16 "Duplicate", §11.13). */
  readonly duplicates: number;
  /** Copies that failed validation at this index (§13.16 "Corrupted", §3.27). */
  readonly corrupted: number;
}

/** A whole-file summary. */
export interface PacketMapSnapshot {
  readonly expectedPackets: number;
  readonly received: number;
  readonly recovered: number;
  readonly missing: readonly number[];
  readonly duplicates: number;
  readonly corrupted: number;
  readonly complete: boolean;
}

export interface PacketMap {
  /** Packets the manifest declares for this file. */
  readonly expectedPackets: number;

  /** Records a validated packet arriving normally. Returns whether it was new. */
  markReceived(index: number): boolean;

  /** Records a validated packet obtained through recovery (§15). */
  markRecovered(index: number): boolean;

  /** Records a copy that failed validation (§3.27). Does not change the state. */
  markCorrupted(index: number): void;

  /** Everything known about one index. */
  entry(index: number): PacketMapEntry;

  /** Whether a valid copy is held at this index. */
  has(index: number): boolean;

  /** Indices still expected but never validated, ascending (§11.14). */
  missing(): readonly number[];

  /** Indices holding a valid copy, ascending (§13.12). */
  present(): readonly number[];

  /** Whether every declared packet has been validated (§13.11). */
  isComplete(): boolean;

  /** A whole-file summary. */
  snapshot(): PacketMapSnapshot;
}

/**
 * Creates a packet map for one file.
 *
 * @param expectedPackets Packets the manifest declares (§10.5). Zero is legal:
 *   an empty file is still a file (§3.8), and it is complete immediately.
 */
export function createPacketMap(expectedPackets: number): PacketMap {
  if (!Number.isInteger(expectedPackets) || expectedPackets < 0) {
    throw new AppError(
      ErrorCode.INVALID_CONFIGURATION,
      'Expected packet count must be a non-negative integer.',
      { details: { expectedPackets } },
    );
  }

  /** Primary state per index. Absent means Missing. */
  const states = new Map<number, PacketState>();
  const duplicates = new Map<number, number>();
  const corrupted = new Map<number, number>();

  function assertIndex(index: number): void {
    // §13.17: a negative index, or one beyond the manifest's count, is an
    // ordering error. Indices are zero-based (§13.4), so the last valid index
    // is expectedPackets - 1.
    if (!Number.isInteger(index) || index < 0 || index >= expectedPackets) {
      throw new AppError(ErrorCode.INVALID_PACKET, 'Packet index is outside the declared range.', {
        details: { index, expectedPackets },
      });
    }
  }

  function bump(counter: Map<number, number>, index: number): void {
    counter.set(index, (counter.get(index) ?? 0) + 1);
  }

  function mark(index: number, state: PacketState): boolean {
    assertIndex(index);

    if (states.has(index)) {
      // §11.13: a duplicate is ignored after the first valid copy, and never
      // overwrites it. The map records that it was seen.
      bump(duplicates, index);
      return false;
    }

    states.set(index, state);
    return true;
  }

  const map: PacketMap = {
    expectedPackets,

    markReceived(index) {
      return mark(index, PacketState.Received);
    },

    markRecovered(index) {
      return mark(index, PacketState.Recovered);
    },

    markCorrupted(index) {
      assertIndex(index);
      // Deliberately does not change the primary state: a corrupted copy
      // arriving after a good one does not un-receive the packet, and one
      // arriving before does not make the index anything other than missing.
      bump(corrupted, index);
    },

    entry(index) {
      assertIndex(index);

      return Object.freeze({
        index,
        state: states.get(index) ?? PacketState.Missing,
        duplicates: duplicates.get(index) ?? 0,
        corrupted: corrupted.get(index) ?? 0,
      });
    },

    has(index) {
      return states.has(index);
    },

    missing() {
      const result: number[] = [];

      for (let index = 0; index < expectedPackets; index += 1) {
        if (!states.has(index)) {
          result.push(index);
        }
      }

      return result;
    },

    present() {
      // Built by counting up rather than by sorting the map's keys, so the
      // result is ascending by construction (§13.12) and cannot depend on
      // insertion — that is, on arrival — order.
      const result: number[] = [];

      for (let index = 0; index < expectedPackets; index += 1) {
        if (states.has(index)) {
          result.push(index);
        }
      }

      return result;
    },

    isComplete() {
      return states.size === expectedPackets;
    },

    snapshot() {
      let received = 0;
      let recovered = 0;

      for (const state of states.values()) {
        if (state === PacketState.Recovered) {
          recovered += 1;
        } else {
          received += 1;
        }
      }

      const sum = (counter: Map<number, number>): number =>
        [...counter.values()].reduce((total, value) => total + value, 0);

      return Object.freeze({
        expectedPackets,
        received,
        recovered,
        missing: Object.freeze(map.missing()),
        duplicates: sum(duplicates),
        corrupted: sum(corrupted),
        complete: map.isComplete(),
      });
    },
  };

  return map;
}
