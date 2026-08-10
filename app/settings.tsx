/**
 * Settings route (UI-007) — UI_SPEC §5.6.
 */
import { useRouter } from 'expo-router';

import { SettingsScreen } from '@screens/index';
import { Route } from '@navigation/routes';

export default function SettingsRoute() {
  const router = useRouter();

  return <SettingsScreen onBack={() => router.back()} onAbout={() => router.push(Route.About)} />;
}
