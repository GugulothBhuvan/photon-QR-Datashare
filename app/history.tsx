/**
 * History route (UI-006) — UI_SPEC §5.5; ADR-0007.
 *
 * Loads stored transfers and maps them to what the screen displays. The
 * mapping lives here rather than in the screen because a screen renders what
 * it is given; and it does not live in the repository because a stored record
 * holds more than a list row shows.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';

import { describeRecord, isFullyVerified, type TransferRecord } from '@domain/history';
import { useAppServices } from '@hooks/index';
import { HistoryScreen, type HistoryEntry } from '@screens/index';

/** One stored record, as a History row. */
function toEntry(record: TransferRecord): HistoryEntry {
  return {
    id: record.sessionId,
    name: describeRecord(record),
    fileCount: record.files.length,
    totalBytes: record.totalBytes,
    completedAt: record.completedAt,
    direction: record.direction,
    verified: isFullyVerified(record),
  };
}

export default function HistoryRoute() {
  const router = useRouter();
  const { recentTransfers } = useAppServices();
  const [entries, setEntries] = useState<readonly HistoryEntry[]>([]);

  const load = useCallback(() => {
    let current = true;

    void (async () => {
      const records = await recentTransfers();

      // Guarded: the screen can be left while the read is in flight, and
      // setting state on an unmounted tree is a leak React warns about.
      if (current) {
        setEntries(records.map(toEntry));
      }
    })();

    return () => {
      current = false;
    };
  }, [recentTransfers]);

  // Loaded on mount, which is when this route appears: History is pushed onto
  // the stack and unmounted on the way back, so a transfer that finishes later
  // is read the next time the screen is opened.
  //
  // Deliberately not `useFocusEffect`, which needs a navigation context —
  // the route-sweep test renders every route bare, and a route that cannot be
  // rendered on its own is one this application cannot prove it can show.
  useEffect(load, [load]);

  return <HistoryScreen entries={entries} onBack={() => router.back()} />;
}
