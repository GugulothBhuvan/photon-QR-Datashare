/**
 * Home (UI-002) — UI_SPEC §5.1.
 *
 * §5.1 requires a header, hero actions, recent transfers and a status
 * indicator, with four primary actions: send, receive, history, settings.
 *
 * The screen dispatches navigation and renders state. It reaches nothing below
 * the controller layer — §18.4: the UI remains independent of protocol logic.
 */
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, ListItem, Screen, Text } from '@components/index';
import { Spacing } from '@constants/tokens';

export interface RecentTransfer {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly when: string;
}

export interface HomeScreenProps {
  readonly onSend: () => void;
  readonly onReceive: () => void;
  readonly onHistory: () => void;
  readonly onSettings: () => void;
  /** Most recent transfers (§5.1). Empty renders the §15 empty state. */
  readonly recent?: readonly RecentTransfer[];
  /** §5.1 status indicator: what the app is currently doing. */
  readonly status?: string;
}

export function HomeScreen({
  onSend,
  onReceive,
  onHistory,
  onSettings,
  recent = [],
  status = 'Ready',
}: HomeScreenProps) {
  return (
    <Screen title="photon" subtitle="Offline file transfer, no network required">
      {/* §5.1 status indicator */}
      <Card>
        <View style={styles.status}>
          <Text variant="label" tone="muted">
            Status
          </Text>
          <Text variant="body">{status}</Text>
        </View>
      </Card>

      {/* §5.1 hero actions */}
      <View style={styles.hero}>
        <Button label="Send files" icon="→" onPress={onSend} fullWidth />
        <Button label="Receive files" icon="←" variant="secondary" onPress={onReceive} fullWidth />
      </View>

      <Card>
        <Text variant="heading">Recent transfers</Text>
        {recent.length === 0 ? (
          <EmptyState
            title="No transfers yet"
            description="Your completed transfers will appear here."
          />
        ) : (
          <View>
            {recent.map((transfer) => (
              <ListItem
                key={transfer.id}
                title={transfer.name}
                subtitle={transfer.detail}
                trailing={transfer.when}
                onPress={onHistory}
              />
            ))}
          </View>
        )}
      </Card>

      <View style={styles.secondary}>
        <Button label="History" variant="ghost" onPress={onHistory} />
        <Button label="Settings" variant="ghost" onPress={onSettings} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: Spacing.sm,
  },
  secondary: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  status: {
    gap: Spacing.xs,
  },
});
