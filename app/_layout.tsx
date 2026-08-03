/**
 * Root route layout.
 *
 * UI layer. Declares navigation structure only — no protocol, storage or
 * business logic may appear here (see planning/DEPENDENCIES.md §4).
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
