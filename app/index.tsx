/**
 * Index route.
 *
 * Placeholder shell that proves the Expo Router entry point builds. The real
 * Home experience is specified in docs/UI_SPEC.md and implemented in
 * Phase 8 (UI-002) as a screen under src/screens.
 */
import { StyleSheet, Text, View } from 'react-native';

export default function IndexRoute() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>photon</Text>
      <Text style={styles.subtitle}>Offline optical file transfer</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 15,
    marginTop: 8,
    opacity: 0.7,
  },
});
