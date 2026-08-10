/**
 * Transfer progress route (UI-005) — UI_SPEC §5.4, §4.
 *
 * §4 opens Transfer Progress as a full-screen flow rather than a tab, so it is
 * a route of its own and not a primary destination (`isFullScreen` in
 * `src/navigation/routes.ts`).
 *
 * Everything shown is derived from what the send controller already publishes:
 * how far the frame sequence has reached, how large a packet is, and when
 * transmission began. The route computes no protocol state — it converts
 * controller state into the arguments the screen takes.
 */
import { useRouter } from 'expo-router';

import { SendStage } from '@controllers/sendController';
import { useAppServices, useElapsed, useStore } from '@hooks/index';
import { TransferProgressScreen } from '@screens/index';

export default function TransferRoute() {
  const router = useRouter();
  const { send, now } = useAppServices();
  const state = useStore(send.state);
  const elapsedMs = useElapsed(now, state.startedAt);

  const paused = state.stage === SendStage.Paused;

  return (
    <TransferProgressScreen
      // §8 preserves packet order, so the frame index is how many packets have
      // been shown. A looping schedule (§11.11) is still counted once: the
      // screen reports progress through the sequence, not frames emitted.
      completedPackets={state.position === undefined ? 0 : state.position.index + 1}
      totalPackets={state.totalPackets}
      elapsedMs={elapsedMs}
      packetSize={state.packetSize}
      paused={paused}
      onPause={send.pause}
      onResume={send.start}
      onCancel={() => {
        send.cancel();
        router.back();
      }}
    />
  );
}
