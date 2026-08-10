/**
 * Send route (UI-003) — UI_SPEC §5.2.
 *
 * File picking is a platform capability, so the route supplies it and the
 * screen stays free of platform APIs (planning/DEPENDENCIES.md §4: UI must not
 * depend on platform APIs directly).
 *
 * No picker is wired yet — `expo-document-picker` is not installed, and
 * choosing it is a dependency review of its own. Recorded as A12-02.
 */
import { useRouter } from 'expo-router';

import { SendScreen } from '@screens/index';

export default function SendRoute() {
  const router = useRouter();

  return <SendScreen onPickFiles={() => undefined} onBack={() => router.back()} />;
}
