/**
 * PacketRegistry — storage for validated packets during a transfer.
 *
 * PROTOCOL_SPEC §11.5 identifies a packet's position by session, file and
 * zero-based index; §11.10 makes that index the only thing that determines
 * reconstruction order, never arrival order. So packets are held keyed by
 * (session, file, index) and read back sorted by index.
 *
 * Storage only. What counts as a duplicate (§11.13), what counts as missing
 * (§11.14), and when packets are discarded (§11.19) are the PacketManager's
 * questions. This module refuses to overwrite (§11.13: duplicates SHALL NOT
 * overwrite previously validated packets) because that is a storage
 * guarantee — a registry that silently replaced a stored packet could not be
 * used to implement the rule at all.
 *
 * In-memory only. Packet memory is released as soon as it is no longer
 * required (§11.19).
 */
import { NIL_UUID, type FileId, type SessionId } from '@domain/ids';
import type { Packet } from '@domain/packet';

/**
 * Key for packets belonging to no single file.
 *
 * A manifest packet describes the transfer rather than one file (§10.1), so it
 * has no file id. The nil UUID is the same sentinel the wire format uses for
 * that field.
 */
export const NO_FILE = NIL_UUID as FileId;

/** Packets held for one file of one session, indexed by packet index. */
type FileSlots = Map<number, Packet>;

/** Files held for one session. */
type SessionSlots = Map<FileId, FileSlots>;

export interface PacketRegistry {
  /**
   * Stores a packet at its position.
   *
   * @returns `true` when stored, `false` when a packet is already held at that
   *   position — which is how §11.13's "SHALL NOT overwrite" is guaranteed.
   */
  store(packet: Packet): boolean;

  /** The packet held at a position, or `undefined`. */
  get(session: SessionId, file: FileId, index: number): Packet | undefined;

  /** Whether a packet is held at a position. */
  has(session: SessionId, file: FileId, index: number): boolean;

  /** How many packets are held for a file. */
  count(session: SessionId, file: FileId): number;

  /** Indices held for a file, ascending. */
  indices(session: SessionId, file: FileId): readonly number[];

  /** Packets held for a file, ordered by index (§11.10), never by arrival. */
  ordered(session: SessionId, file: FileId): readonly Packet[];

  /** Files that hold at least one packet for a session. */
  files(session: SessionId): readonly FileId[];

  /** Sessions holding at least one packet. */
  sessions(): readonly SessionId[];

  /** Total packets held across every session. */
  size(): number;

  /** Discards every packet held for one file. Returns how many were released. */
  releaseFile(session: SessionId, file: FileId): number;

  /** Discards every packet held for a session (§11.19). Returns how many were released. */
  releaseSession(session: SessionId): number;

  /** Discards everything. */
  clear(): void;
}

/** Creates an empty packet registry. */
export function createPacketRegistry(): PacketRegistry {
  const sessions = new Map<SessionId, SessionSlots>();

  const slotsFor = (session: SessionId, file: FileId): FileSlots | undefined =>
    sessions.get(session)?.get(file);

  return {
    store(packet) {
      const file = packet.fileId ?? NO_FILE;

      let files = sessions.get(packet.sessionId);
      if (files === undefined) {
        files = new Map();
        sessions.set(packet.sessionId, files);
      }

      let slots = files.get(file);
      if (slots === undefined) {
        slots = new Map();
        files.set(file, slots);
      }

      // §11.13: a duplicate SHALL NOT overwrite a previously validated packet.
      if (slots.has(packet.index)) {
        return false;
      }

      slots.set(packet.index, packet);
      return true;
    },

    get(session, file, index) {
      return slotsFor(session, file)?.get(index);
    },

    has(session, file, index) {
      return slotsFor(session, file)?.has(index) ?? false;
    },

    count(session, file) {
      return slotsFor(session, file)?.size ?? 0;
    },

    indices(session, file) {
      const slots = slotsFor(session, file);
      return slots === undefined ? [] : [...slots.keys()].sort((left, right) => left - right);
    },

    ordered(session, file) {
      const slots = slotsFor(session, file);

      if (slots === undefined) {
        return [];
      }

      // Sorted by index, so arrival order cannot influence the result (§11.10).
      return [...slots.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, packet]) => packet);
    },

    files(session) {
      const files = sessions.get(session);
      return files === undefined ? [] : [...files.keys()];
    },

    sessions() {
      return [...sessions.keys()];
    },

    size() {
      let total = 0;
      for (const files of sessions.values()) {
        for (const slots of files.values()) {
          total += slots.size;
        }
      }
      return total;
    },

    releaseFile(session, file) {
      const files = sessions.get(session);
      const released = files?.get(file)?.size ?? 0;

      files?.delete(file);

      if (files !== undefined && files.size === 0) {
        sessions.delete(session);
      }

      return released;
    },

    releaseSession(session) {
      const files = sessions.get(session);

      if (files === undefined) {
        return 0;
      }

      let released = 0;
      for (const slots of files.values()) {
        released += slots.size;
      }

      sessions.delete(session);
      return released;
    },

    clear() {
      sessions.clear();
    },
  };
}
