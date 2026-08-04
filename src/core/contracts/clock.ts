/**
 * Clock — the protocol engine's only source of time.
 *
 * PROTOCOL_SPEC §2.4 requires deterministic behaviour, and §22.14 makes the
 * protocol independent of any particular device clock. Reading `Date.now()`
 * inside a manager would break both: two runs of the same inputs would differ,
 * and the engine would depend on a platform API.
 *
 * Time enters the engine here and nowhere else.
 */
export interface Clock {
  /** The current time in epoch milliseconds. */
  now(): number;
}
