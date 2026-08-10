/**
 * Home route (UI-002) — UI_SPEC §5.1.
 *
 * A route binds a screen to navigation and nothing else. The screen itself
 * holds no navigator, so it can be rendered in a test without one.
 */
import { useRouter } from 'expo-router';

import { HomeScreen } from '@screens/index';
import { Route } from '@navigation/routes';

export default function HomeRoute() {
  const router = useRouter();

  return (
    <HomeScreen
      onSend={() => router.push(Route.Send)}
      onReceive={() => router.push(Route.Receive)}
      onHistory={() => router.push(Route.History)}
      onSettings={() => router.push(Route.Settings)}
    />
  );
}
