/**
 * Root route layout (UI-001) — UI_SPEC §4.
 *
 * Declares navigation structure and provides the application graph and theme to
 * every screen. No protocol, storage or business logic appears here
 * (planning/DEPENDENCIES.md §4).
 *
 * The graph is built once, at the root, and passed down through context —
 * §18.10: the UI remains replaceable without affecting protocol behaviour, and
 * a UI that constructed protocol objects per screen would not be.
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@components/ThemeProvider';
import { createAppGraph } from '@config/appComposition';
import { AppServicesProvider } from '@hooks/useAppServices';
import { useStore } from '@hooks/useStore';

/**
 * Reads the theme preference and applies it.
 *
 * Separate from the root so it can subscribe to settings without the graph
 * being rebuilt whenever the theme changes.
 */
function Themed({ services }: { readonly services: ReturnType<typeof createAppGraph> }) {
  const settings = useStore(services.settings.state);

  return (
    <ThemeProvider setting={settings.settings.theme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Built once for the lifetime of the app: every controller holds state that
  // must survive navigation.
  const services = useMemo(() => createAppGraph(), []);

  return (
    <SafeAreaProvider>
      <AppServicesProvider services={services}>
        <Themed services={services} />
      </AppServicesProvider>
    </SafeAreaProvider>
  );
}
