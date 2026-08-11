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

import { TransferDirection, TransferOutcome } from '@domain/history';
import { useAppServices } from '@hooks/index';
import { SendScreen } from '@screens/index';

export default function SendRoute() {
  const router = useRouter();
  const { send, pickFiles, recordTransfer } = useAppServices();

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
      onCancel={() => {
        // Read before cancelling: the controller resets to its initial state,
        // and the session id and file list are what the record is made of.
        const { sessionId, files } = send.state.getState();

        if (sessionId !== undefined && files.length > 0) {
          void recordTransfer({
            sessionId,
            direction: TransferDirection.Send,
            // §5.5 wants an outcome and this one is genuinely not knowable:
            // the optical transport has no return path (SI-014), so a sender
            // shows its frames and never learns whether anything read them.
            // Recording `Completed` would assert what nothing observed.
            outcome: TransferOutcome.Unknown,
            completedAt: Date.now(),
            files: files.map((file) => ({ name: file.name, size: file.content.byteLength })),
            totalBytes: files.reduce((total, file) => total + file.content.byteLength, 0),
          });
        }

        send.cancel();
      }}
    />
  );
}
