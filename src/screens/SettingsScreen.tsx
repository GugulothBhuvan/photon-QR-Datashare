/**
 * Settings (UI-007) — UI_SPEC §5.6, §12.
 *
 * §5.6 requires six sections: appearance, QR settings, camera, storage,
 * security and developer.
 *
 * Every control writes through the settings controller, which validates and
 * persists. Nothing here holds a preference of its own — a screen that kept
 * local copies would drift from what was actually saved.
 */
import { StyleSheet, View } from 'react-native';

import { Button, Card, ListItem, Screen, Text } from '@components/index';
import { Spacing } from '@constants/tokens';
import { useAppServices, useStore } from '@hooks/index';
import { PerformanceMode, QRSpeedPreference, Theme } from '@domain/settings';

export interface SettingsScreenProps {
  readonly onBack: () => void;
  readonly onAbout: () => void;
  /** Protocol version, shown under Developer. */
  readonly protocolVersion?: number;
}

export function SettingsScreen({ onBack, onAbout, protocolVersion = 1 }: SettingsScreenProps) {
  const { settings } = useAppServices();
  const state = useStore(settings.state);
  const current = state.settings;

  return (
    <Screen title="Settings">
      {state.errorMessage === undefined ? null : (
        <Card>
          <Text variant="label" tone="danger">
            {state.errorMessage}
          </Text>
        </Card>
      )}

      <Section title="Appearance">
        <Choices
          options={[
            { value: Theme.System, label: 'System' },
            { value: Theme.Light, label: 'Light' },
            { value: Theme.Dark, label: 'Dark' },
          ]}
          selected={current.theme}
          onSelect={(theme) => {
            void settings.setTheme(theme);
          }}
        />
      </Section>

      <Section title="QR settings">
        <Text variant="caption" tone="muted">
          How quickly codes are shown. Slower is easier to read.
        </Text>
        <Choices
          options={[
            { value: QRSpeedPreference.Slow, label: 'Slow' },
            { value: QRSpeedPreference.Balanced, label: 'Balanced' },
            { value: QRSpeedPreference.Fast, label: 'Fast' },
          ]}
          selected={current.qrSpeed}
          onSelect={(qrSpeed) => {
            void settings.setQrSpeed(qrSpeed);
          }}
        />
      </Section>

      <Section title="Camera">
        <ListItem
          title="Camera permission"
          subtitle="Managed by the system"
          trailing="System settings"
        />
      </Section>

      <Section title="Storage">
        <ListItem
          title="Keep received files"
          subtitle="Files stay on this device after a transfer"
          trailing={current.storage.keepReceivedFiles ? 'On' : 'Off'}
          onPress={() => {
            void settings.setKeepReceivedFiles(!current.storage.keepReceivedFiles);
          }}
        />
        <ListItem
          title="Download folder"
          subtitle={current.storage.downloadDirectory ?? 'Platform default'}
        />
      </Section>

      <Section title="Security">
        <ListItem title="Encryption" subtitle="Not available in this version" trailing="Off" />
        <ListItem
          title="Integrity verification"
          subtitle="Every file is verified before it is saved"
          trailing="Always on"
        />
      </Section>

      <Section title="Developer">
        <Choices
          options={[
            { value: PerformanceMode.BatterySaver, label: 'Battery' },
            { value: PerformanceMode.Balanced, label: 'Balanced' },
            { value: PerformanceMode.Performance, label: 'Performance' },
          ]}
          selected={current.performanceMode}
          onSelect={(performanceMode) => {
            void settings.setPerformanceMode(performanceMode);
          }}
        />
        <ListItem title="Protocol version" trailing={String(protocolVersion)} />
        <ListItem title="About" trailing="Open" onPress={onAbout} />
      </Section>

      <Button
        label="Reset to defaults"
        variant="secondary"
        onPress={() => {
          void settings.reset();
        }}
      />
      <Button label="Back" variant="ghost" onPress={onBack} />
    </Screen>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Card>
      <Text variant="heading">{title}</Text>
      <View style={styles.body}>{children}</View>
    </Card>
  );
}

interface Choice<T> {
  readonly value: T;
  readonly label: string;
}

function Choices<T extends string>({
  options,
  selected,
  onSelect,
}: {
  readonly options: readonly Choice<T>[];
  readonly selected: T;
  readonly onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.choices}>
      {options.map((option) => (
        <Button
          key={option.value}
          label={option.label}
          variant={selected === option.value ? 'primary' : 'secondary'}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    marginTop: Spacing.sm,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
});
