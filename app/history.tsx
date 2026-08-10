/**
 * History route (UI-006) — UI_SPEC §5.5.
 *
 * No history repository exists yet, so the screen renders its §15 empty state.
 * Recorded as A12-03.
 */
import { useRouter } from 'expo-router';

import { HistoryScreen } from '@screens/index';

export default function HistoryRoute() {
  const router = useRouter();

  return <HistoryScreen onBack={() => router.back()} />;
}
