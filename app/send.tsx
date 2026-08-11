/**
 * Send route (UI-003) — UI_SPEC §5.2.
 *
 * File picking is a platform capability, so the route supplies it and the
 * screen stays free of platform APIs (planning/DEPENDENCIES.md §4: UI must not
 * depend on platform APIs directly).
 *
 * The picker arrives through the composition root as a plain function, which is
 * how the UI reaches a document picker without importing the storage adapter —
 * the layer boundary forbids that (A12-02).
 */
import { useRouter } from 'expo-router';

import { useAppServices } from '@hooks/index';
import { SendScreen } from '@screens/index';

export default function SendRoute() {
  const router = useRouter();
  const { send, pickFiles } = useAppServices();

  return (
    <SendScreen
      onPickFiles={() => {
        void pickFiles().then((files) => {
          if (files.length > 0) {
            send.addFiles(files);
          }
        });
      }}
      onBack={() => router.back()}
    />
  );
}
