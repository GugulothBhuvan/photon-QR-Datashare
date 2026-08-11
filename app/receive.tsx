/**
 * Receive route (UI-004) — UI_SPEC §5.3.
 *
 * Saving a received file is a platform capability, supplied here rather than by
 * the screen, for the same reason the picker is on the send side.
 *
 * §3.24 requires integrity verification before a file is reported as received,
 * so only files whose digest matched are written to disk. A file that failed
 * verification is discarded rather than saved with a warning — §20.14 forbids
 * silently repairing or presenting a file that did not verify.
 */
import { useRouter } from 'expo-router';

import { useAppServices } from '@hooks/index';
import { ReceiveScreen } from '@screens/index';

export default function ReceiveRoute() {
  const router = useRouter();
  const { receive, saveFile } = useAppServices();

  return (
    <ReceiveScreen
      onBack={() => router.back()}
      onComplete={() => {
        void (async () => {
          for (const file of receive.finish()) {
            if (file.integrity.verified) {
              await saveFile(file.name, file.stream);
            }
          }
        })();
      }}
    />
  );
}
