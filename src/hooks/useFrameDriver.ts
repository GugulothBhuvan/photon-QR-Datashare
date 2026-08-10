/**
 * Drives frame advancement (UI-003) — QR_SPEC §8, §9.
 *
 * The scheduler is a pure state machine that owns no timer: `advance()` moves
 * to the next frame and the scheduler says how long the current one should be
 * shown. Something outside must call it, and a React effect is the natural
 * place — a timer is a platform capability, and the UI layer is where platform
 * capabilities live.
 *
 * The interval is re-read from the controller after every tick rather than
 * fixed at mount, so a speed change mid-transfer takes effect on the next
 * frame (§10) instead of the next transfer.
 */
import { useEffect } from 'react';

import { SendStage, type SendController } from '@controllers/sendController';

/**
 * Advances the send controller's frame while a transfer is transmitting.
 *
 * Does nothing while paused, preparing or selecting: §14.5 requires a pause to
 * preserve state, and a display that kept moving would not be paused.
 *
 * @param send The send controller.
 * @param stage The current stage. Passed rather than read so the effect
 *   re-subscribes when the stage changes.
 * @param enabled Set `false` to suspend driving — a screen that is not
 *   showing the code has no reason to burn frames.
 */
export function useFrameDriver(send: SendController, stage: SendStage, enabled = true): void {
  useEffect(() => {
    if (!enabled || stage !== SendStage.Sending) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    function tick(): void {
      if (cancelled) {
        return;
      }

      send.advance();

      // Re-read each time: the duration is the scheduler's to decide, and it
      // may have changed since the last frame.
      const durationMs = send.state.getState().position?.durationMs;

      if (durationMs !== undefined) {
        timer = setTimeout(tick, durationMs);
      }
    }

    const initial = send.state.getState().position?.durationMs;

    if (initial !== undefined) {
      timer = setTimeout(tick, initial);
    }

    return () => {
      cancelled = true;

      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [send, stage, enabled]);
}
