/**
 * About (UI-007) — UI_SPEC §5.7.
 *
 * §5.7 requires the application version, the protocol version, licences and
 * credits.
 *
 * Licences are listed for the two third-party libraries the application
 * actually ships, which are recorded in ADR-0002 and ADR-0003. Keeping the list
 * next to those decisions is what stops it going stale.
 */
import { Button, Card, ListItem, Screen, Text } from '@components/index';

export interface AboutScreenProps {
  readonly appVersion: string;
  readonly protocolVersion: number;
  readonly onBack: () => void;
}

/** Third-party libraries shipped in the application binary. */
export const LICENSES: readonly { name: string; license: string; purpose: string }[] =
  Object.freeze([
    { name: 'qrcode', license: 'MIT', purpose: 'QR encoding (ADR-0002)' },
    { name: 'jsQR', license: 'Apache-2.0', purpose: 'QR decoding (ADR-0003)' },
    { name: 'React Native', license: 'MIT', purpose: 'Application runtime' },
    { name: 'Expo', license: 'MIT', purpose: 'Application runtime' },
  ]);

export function AboutScreen({ appVersion, protocolVersion, onBack }: AboutScreenProps) {
  return (
    <Screen title="About" subtitle="Offline optical file transfer">
      <Card>
        <ListItem title="Application version" trailing={appVersion} />
        <ListItem title="Protocol version" trailing={`OSP/${protocolVersion}`} />
      </Card>

      <Card>
        <Text variant="heading">Licences</Text>
        {LICENSES.map((entry) => (
          <ListItem
            key={entry.name}
            title={entry.name}
            subtitle={entry.purpose}
            trailing={entry.license}
          />
        ))}
      </Card>

      <Card>
        <Text variant="heading">Credits</Text>
        <Text variant="body" tone="muted">
          photon transfers files between devices using nothing but a screen and a camera. No
          network, no pairing, no server.
        </Text>
      </Card>

      <Button label="Back" variant="ghost" onPress={onBack} />
    </Screen>
  );
}
