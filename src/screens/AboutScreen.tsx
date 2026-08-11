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

/**
 * One line of the §29.13 compliance checklist.
 *
 * Declared structurally rather than imported so the screen states what it
 * renders — the composition root's `ComplianceDeclaration` satisfies it.
 */
export interface ComplianceLine {
  readonly requirement: string;
  readonly status: string;
  readonly note?: string;
}

export interface AboutScreenProps {
  readonly appVersion: string;
  readonly protocolVersion: number;
  readonly onBack: () => void;
  /**
   * The §29.14 compliance declaration.
   *
   * §29.14 says the declaration SHOULD be available through documentation *or
   * implementation metadata*. Showing it here is the second: a user can see
   * what this build does and does not do without reading a specification.
   */
  readonly complianceNote?: string;
  readonly checklist?: readonly ComplianceLine[];
  readonly integrityAlgorithms?: readonly string[];
  /**
   * What the platform actually provided.
   *
   * On a device this is the fastest way to tell whether the native camera and
   * file picker linked — a placeholder preview alone cannot distinguish
   * "no device camera" from "the module failed to load".
   */
  readonly diagnostics?: readonly { readonly name: string; readonly status: string }[];
}

/** Third-party libraries shipped in the application binary. */
export const LICENSES: readonly { name: string; license: string; purpose: string }[] =
  Object.freeze([
    { name: 'qrcode', license: 'MIT', purpose: 'QR encoding (ADR-0002)' },
    { name: 'jsQR', license: 'Apache-2.0', purpose: 'QR decoding (ADR-0003)' },
    { name: 'React Native', license: 'MIT', purpose: 'Application runtime' },
    { name: 'Expo', license: 'MIT', purpose: 'Application runtime' },
  ]);

/** Turns a status constant into something a person reads. */
function statusLabel(status: string): string {
  switch (status) {
    case 'IMPLEMENTED':
      return 'Yes';
    case 'DEVICE_VALIDATION_REQUIRED':
      return 'Needs a device';
    case 'BLOCKED':
      return 'Blocked';
    default:
      return 'No';
  }
}

export function AboutScreen({
  appVersion,
  protocolVersion,
  onBack,
  complianceNote,
  checklist = [],
  integrityAlgorithms = [],
  diagnostics = [],
}: AboutScreenProps) {
  return (
    <Screen title="About" subtitle="Offline optical file transfer">
      <Card>
        <ListItem title="Application version" trailing={appVersion} />
        <ListItem title="Protocol version" trailing={`OSP/${protocolVersion}`} />
      </Card>

      {checklist.length === 0 ? null : (
        <Card>
          <Text variant="heading">Protocol compliance</Text>
          {complianceNote === undefined ? null : (
            <Text variant="caption" tone="muted">
              {complianceNote}
            </Text>
          )}
          {checklist.map((line) => (
            <ListItem
              key={line.requirement}
              title={line.requirement}
              {...(line.note === undefined ? {} : { subtitle: line.note })}
              trailing={statusLabel(line.status)}
            />
          ))}
          {integrityAlgorithms.length === 0 ? null : (
            <ListItem title="Integrity algorithms" trailing={integrityAlgorithms.join(', ')} />
          )}
        </Card>
      )}

      {diagnostics.length === 0 ? null : (
        <Card>
          <Text variant="heading">Platform</Text>
          {diagnostics.map((entry) => (
            <ListItem key={entry.name} title={entry.name} subtitle={entry.status} />
          ))}
        </Card>
      )}

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
