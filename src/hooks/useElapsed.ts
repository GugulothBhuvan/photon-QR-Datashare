/**
 * Elapsed-time tick (UI-005) — UI_SPEC §5.4.
 *
 * §5.4 shows elapsed time, throughput and an estimate, all of which move while
 * nothing else changes. Something must re-render for them to advance, and a
 * timer is a platform capability — so it lives in the UI layer, not in a
 * controller and certainly not in the protocol.
 *
 * The clock is passed in rather than read: `Date.now()` inside a hook would be
 * one more place a test cannot control time.
 */
import { useEffect, useState } from 'react';

/**
 * Milliseconds since `since`, re-read on an interval.
 *
 * @param now Reads the current time. The application clock, injected.
 * @param since When the measured thing began, or `undefined` if it has not.
 * @param intervalMs How often to re-read. Half a second, so a display showing
 *   whole seconds never appears to skip one.
 * @returns Elapsed milliseconds, or `0` when there is nothing to measure.
 */
export function useElapsed(now: () => number, since: number | undefined, intervalMs = 500): number {
  // The interval only forces a re-render; the value is computed below. Storing
  // the elapsed time in state instead would mean writing state from an effect
  // just to show a number already derivable from `since`.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (since === undefined) {
      return;
    }

    const id = setInterval(() => {
      setTick((tick) => tick + 1);
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [since, intervalMs]);

  return since === undefined ? 0 : Math.max(0, now() - since);
}
