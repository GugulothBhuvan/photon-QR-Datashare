/**
 * The live position of the last code the decoder read.
 *
 * Polled rather than pushed. The decoder is behind the `QrDecoder` contract
 * and reports through `decoderStats`, and threading a per-frame callback from
 * it up through two services and a controller to a screen would couple four
 * layers to a detail only the overlay uses.
 *
 * A hundred milliseconds is ten updates a second: fast enough that the
 * brackets follow a code rather than jump to it, slow enough that it costs
 * nothing next to a decode.
 */
import { useEffect, useState } from 'react';

import { useAppServices } from './useAppServices';

/** How long a lock survives without a new decode, in milliseconds. */
const LOCK_TTL_MS = 700;

export interface ScanTrackerState {
  readonly locked: boolean;
  readonly quad:
    | {
        readonly topLeft: { readonly x: number; readonly y: number };
        readonly topRight: { readonly x: number; readonly y: number };
        readonly bottomLeft: { readonly x: number; readonly y: number };
        readonly bottomRight: { readonly x: number; readonly y: number };
      }
    | undefined;
  readonly frame: { readonly width: number; readonly height: number } | undefined;
}

const IDLE: ScanTrackerState = Object.freeze({
  locked: false,
  quad: undefined,
  frame: undefined,
});

/**
 * Tracks the last located symbol while `active`.
 *
 * The lock expires on its own: a code that leaves the view stops producing
 * decodes, and brackets frozen on where it used to be would be a lie.
 */
export function useScanTracker(active: boolean): ScanTrackerState {
  const { decoderStats } = useAppServices();
  const [tracked, setTracked] = useState<ScanTrackerState>(IDLE);

  useEffect(() => {
    if (!active || decoderStats === undefined) {
      setTracked(IDLE);
      return;
    }

    const timer = setInterval(() => {
      const symbol = decoderStats().lastSymbol;

      if (symbol === undefined) {
        setTracked(IDLE);
        return;
      }

      // The decoder stamps frame timestamps, which the device camera sets from
      // the JavaScript clock, so this comparison is against the same clock.
      const fresh = Date.now() - symbol.at < LOCK_TTL_MS;

      setTracked({
        locked: fresh,
        quad: symbol.location,
        frame: { width: symbol.frameWidth, height: symbol.frameHeight },
      });
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, [active, decoderStats]);

  return tracked;
}
