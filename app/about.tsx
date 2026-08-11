/**
 * About route (UI-007) — UI_SPEC §5.7.
 */
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

import { COMPLIANCE_DECLARATION } from '@config/compliance';
import { PROTOCOL_VERSION } from '@config/appComposition';
import { useAppServices } from '@hooks/index';
import { AboutScreen } from '@screens/index';

export default function AboutRoute() {
  const router = useRouter();
  const { diagnostics } = useAppServices();

  return (
    <AboutScreen
      appVersion={Constants.expoConfig?.version ?? '0.1.0'}
      protocolVersion={PROTOCOL_VERSION}
      complianceNote={COMPLIANCE_DECLARATION.complianceNote}
      checklist={COMPLIANCE_DECLARATION.checklist}
      integrityAlgorithms={COMPLIANCE_DECLARATION.integrityAlgorithms}
      {...(diagnostics === undefined ? {} : { diagnostics })}
      onBack={() => router.back()}
    />
  );
}
