/**
 * Holds the screen fit to show or read QR codes (QR_SPEC §11).
 *
 * §11 asks a sender for maximum practical brightness, no screen sleep and a
 * fixed orientation. The receiver wants the same two of the three: a receiving
 * phone is held still and untouched for the length of a transfer, which is
 * exactly what the system reads as idle.
 *
 * Screen sleep is the one that ends a transfer outright. A device showing
 * codes takes no touches, so it dims and sleeps on schedule, mid-transfer,
 * with the other camera pointed at a black rectangle. No part of the protocol
 * can recover from that, because nothing is being transmitted to recover.
 *
 * Expressed as a hook because the lifetime is exactly a component's: acquired
 * when a transfer starts being displayed, released when the screen goes away
 * or the transfer ends. A `useEffect` cleanup cannot be forgotten the way a
 * matching `release()` call can.
 */
import { useEffect } from 'react';

import { useAppServices } from './useAppServices';

/**
 * Keeps the display fit for a transfer while `active`.
 *
 * @param active Whether a transfer is on screen. Releasing as soon as this
 *   goes false matters: a device left bright and awake is a flat battery, and
 *   §11's requirements are for the duration of the transfer, not the session.
 */
export function useTransferDisplay(active: boolean): void {
  const { beginTransferDisplay } = useAppServices();

  useEffect(() => {
    if (!active || beginTransferDisplay === undefined) {
      return;
    }

    const release = beginTransferDisplay();

    return release;
  }, [active, beginTransferDisplay]);
}
