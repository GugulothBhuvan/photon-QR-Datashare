/**
 * IdGenerator — the protocol engine's only source of new identifiers.
 *
 * PROTOCOL_SPEC §8.4 requires the sender to generate a unique Session ID, and
 * §8.17.2 requires it to be unique. Generating one needs randomness, which is
 * not deterministic, so the engine declares the need and the composition root
 * supplies the mechanism.
 *
 * Implementations SHALL return a canonical UUID: PACKET_SPEC §5 carries these
 * identifiers in 16 bytes. A generator that returns anything else is rejected
 * at the point of use.
 */
export interface IdGenerator {
  /** A new, globally unique identifier in canonical UUID form. */
  next(): string;
}
