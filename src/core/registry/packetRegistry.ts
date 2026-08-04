/**
 * PacketRegistry — storage for packets held during a transfer.
 *
 * **Placeholder.** The shape of this registry is determined by
 * PROTOCOL_SPEC §11 Packet Protocol and §13 Packet Ordering, neither of which
 * has been read at the time of writing. It is created here so that PRO-003
 * finds a registry to depend on rather than reaching for a `Map`, and it is
 * filled in by PRO-003 once §11 has been loaded.
 *
 * What is already known, from sections that have been read:
 *
 * - A packet belongs to exactly one session (§3.10) and sits at a zero-based
 *   index within one file's sequence (§3.13).
 * - Indices are unique within a file (§3.13), so a packet's position is
 *   identified by (session, file, index) — which is what
 *   `isSamePosition` in the domain model already compares.
 * - A duplicate is a packet whose index has already been received and
 *   validated (§3.25).
 *
 * In-memory only, like every registry here. Durable packet storage, if the
 * protocol needs it, belongs to the repository layer.
 */

export {};
