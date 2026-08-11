/**
 * Receive route (UI-004) — UI_SPEC §5.3; ADR-0007.
 *
 * Saving a received file is a platform capability, supplied here rather than by
 * the screen, for the same reason the picker is on the send side.
 *
 * §3.24 requires integrity verification before a file is reported as received,
 * so only files whose digest matched are written to disk. A file that failed
 * verification is discarded rather than saved with a warning — §20.14 forbids
 * silently repairing or presenting a file that did not verify. It is still
 * *reported*, because a user whose file failed needs to know that rather than
 * find it missing.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';

import { TransferDirection, TransferOutcome, type HistoryFile } from '@domain/history';
import { useAppServices } from '@hooks/index';
import { ReceiveScreen, type ReceivedFile } from '@screens/index';

export default function ReceiveRoute() {
  const router = useRouter();
  const { receive, saveFile, recordTransfer, settings } = useAppServices();
  const [received, setReceived] = useState<readonly ReceivedFile[]>([]);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  return (
    <ReceiveScreen
      onBack={() => router.back()}
      {...(received.length === 0 ? {} : { received })}
      {...(saveError === undefined ? {} : { saveError })}
      onComplete={() => {
        void (async () => {
          const destination = settings.state.getState().settings.storage.downloadDirectory;
          const summaries: ReceivedFile[] = [];
          const stored: HistoryFile[] = [];
          let totalBytes = 0;

          try {
            for (const file of receive.finish()) {
              const verified = file.integrity.verified;
              totalBytes += file.stream.byteLength;

              // §20.14: only a verified file reaches the filesystem. §5.6's
              // download folder decides where; it is read once, above, so a
              // preference changed mid-save cannot split one transfer across
              // two directories.
              const savedTo = verified
                ? await saveFile(file.name, file.stream, destination)
                : undefined;

              summaries.push({
                name: file.name,
                size: file.stream.byteLength,
                verified,
                ...(savedTo === undefined ? {} : { savedTo }),
              });

              stored.push({
                name: file.name,
                size: file.stream.byteLength,
                verified,
                ...(savedTo === undefined ? {} : { savedTo }),
              });
            }

            setReceived(summaries);
            setSaveError(undefined);

            const sessionId = receive.state.getState().sessionId;

            // A12-03. Recorded only with a session id: the id is the record's
            // identity, and inventing one would create a history entry that
            // matches no transfer.
            if (sessionId !== undefined) {
              await recordTransfer({
                sessionId,
                direction: TransferDirection.Receive,
                outcome: stored.every((file) => file.verified === true)
                  ? TransferOutcome.Completed
                  : TransferOutcome.Failed,
                completedAt: Date.now(),
                files: stored,
                totalBytes,
              });
            }
          } catch (error: unknown) {
            // Writing can fail for reasons the protocol knows nothing about —
            // a full disk, a revoked permission. Reporting beats a button that
            // appears to do nothing.
            setReceived(summaries);
            setSaveError(error instanceof Error ? error.message : String(error));
          }
        })();
      }}
    />
  );
}
