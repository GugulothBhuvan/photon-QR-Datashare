/**
 * Drives the rateless carousel (F8) — ADR-0008.
 *
 * The counterpart to `useFrameDriver`, and it differs in one way that matters:
 * **there is no end.** The packet driver stops when the scheduler runs out of
 * frames; this one keeps going until the user stops it, because the sender
 * cannot know when the receiver has enough and the carousel draws different
 * repair frames on every pass.
 *
 * The interval is re-read from the controller after each tick rather than
 * fixed at mount, so a speed change takes effect on the next frame instead of
 * the next transfer.
 */
import { useEffect } from 'react';

import {
  FountainSendStage,
  type FountainSendController,
} from '@controllers/fountainSendController';

/**
 * Advances the carousel while codes are on screen.
 *
 * Does nothing while paused or selecting: a paused display that kept moving
 * would not be paused.
 *
 * @param send The fountain send controller.
 * @param stage The current stage, passed so the effect re-subscribes when it
 *   changes.
 * @param enabled Set `false` to suspend driving — a screen not showing the
 *   code has no reason to burn frames.
 */
export function useFountainFrameDriver(
  send: FountainSendController,
  stage: FountainSendStage,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || stage !== FountainSendStage.Sending) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    function tick(): void {
      if (cancelled) {
        return;
      }

      send.advance();
      // Re-read: the user may have changed speed since the last frame.
      timer = setTimeout(tick, send.state.getState().durationMs);
    }

    timer = setTimeout(tick, send.state.getState().durationMs);

    return () => {
      cancelled = true;

      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [send, stage, enabled]);
}
