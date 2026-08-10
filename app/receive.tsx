/**
 * Receive route (UI-004) — UI_SPEC §5.3.
 */
import { useRouter } from 'expo-router';

import { ReceiveScreen } from '@screens/index';

export default function ReceiveRoute() {
  const router = useRouter();

  return <ReceiveScreen onBack={() => router.back()} />;
}
