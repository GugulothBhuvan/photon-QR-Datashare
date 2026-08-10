/**
 * History (UI-006) — UI_SPEC §5.5, §15.
 *
 * §5.5 requires search, filter, a transfer list and a details sheet.
 *
 * Filtering is done here rather than by a controller because it is presentation
 * — the same records, shown differently. A controller filtering a list would be
 * doing the screen's job, and §6.14.2 keeps controllers to orchestration.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, EmptyState, ListItem, Screen, Text } from '@components/index';
import { Radius, Spacing } from '@constants/tokens';
import { useTheme } from '@components/ThemeProvider';

/** One completed transfer, as History displays it. */
export interface HistoryEntry {
  readonly id: string;
  readonly name: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly completedAt: number;
  readonly direction: 'SEND' | 'RECEIVE';
  readonly verified: boolean;
}

export type HistoryFilter = 'ALL' | 'SEND' | 'RECEIVE';

export interface HistoryScreenProps {
  readonly entries?: readonly HistoryEntry[];
  readonly onBack: () => void;
  readonly onSelect?: (entry: HistoryEntry) => void;
  /** Formats a timestamp. Injected so the screen holds no locale policy. */
  readonly formatDate?: (timestamp: number) => string;
}

/** Applies the search text and direction filter (§5.5). */
export function filterHistory(
  entries: readonly HistoryEntry[],
  search: string,
  filter: HistoryFilter,
): readonly HistoryEntry[] {
  const needle = search.trim().toLowerCase();

  return entries.filter((entry) => {
    const matchesDirection = filter === 'ALL' || entry.direction === filter;
    const matchesSearch = needle === '' || entry.name.toLowerCase().includes(needle);
    return matchesDirection && matchesSearch;
  });
}

export function HistoryScreen({
  entries = [],
  onBack,
  onSelect,
  formatDate = (timestamp) => new Date(timestamp).toLocaleDateString(),
}: HistoryScreenProps) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('ALL');

  const visible = useMemo(() => filterHistory(entries, search, filter), [entries, search, filter]);

  return (
    <Screen title="History">
      {entries.length === 0 ? (
        // §15's worked example, verbatim.
        <EmptyState
          title="No transfers yet"
          description="Your completed transfers will appear here."
          actionLabel="Back"
          onAction={onBack}
        />
      ) : (
        <>
          <TextInput
            accessibilityLabel="Search transfers"
            placeholder="Search"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={[
              styles.search,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />

          <View style={styles.filters}>
            {(['ALL', 'SEND', 'RECEIVE'] as const).map((option) => (
              <Button
                key={option}
                label={option === 'ALL' ? 'All' : option === 'SEND' ? 'Sent' : 'Received'}
                variant={filter === option ? 'primary' : 'secondary'}
                onPress={() => setFilter(option)}
              />
            ))}
          </View>

          <Card>
            {visible.length === 0 ? (
              <EmptyState title="Nothing matches" description="Try a different search or filter." />
            ) : (
              visible.map((entry) => (
                <ListItem
                  key={entry.id}
                  title={entry.name}
                  subtitle={`${entry.fileCount} file${entry.fileCount === 1 ? '' : 's'} · ${entry.totalBytes} bytes${entry.verified ? '' : ' · unverified'}`}
                  trailing={formatDate(entry.completedAt)}
                  accessibilityHint="Opens transfer details"
                  {...(onSelect === undefined ? {} : { onPress: () => onSelect(entry) })}
                />
              ))
            )}
          </Card>

          <Text variant="caption" tone="muted">
            Showing {visible.length} of {entries.length}
          </Text>
        </>
      )}

      <Button label="Back" variant="ghost" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  search: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    paddingHorizontal: Spacing.md,
  },
});
