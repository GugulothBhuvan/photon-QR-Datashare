/**
 * Transfer progress (UI-005) — UI_SPEC §5.4, §4.
 *
 * §5.4 requires a progress ring, a packet counter, throughput, an estimated
 * time, and pause and cancel buttons. §4 opens it as a full-screen flow.
 *
 * Throughput and estimated time are **derived here from values the protocol
 * already reports** — packets completed, elapsed time. The protocol engine
 * publishes no throughput of its own, and adding one would put a presentation
 * concern into the protocol layer.
 */
import { StyleSheet, View } from 'react-native';

import { Button, Card, ProgressRing, Screen, Text } from '@components/index';
import { Spacing } from '@constants/tokens';

export interface TransferProgressScreenProps {
  readonly title?: string;
  readonly completedPackets: number;
  readonly totalPackets: number;
  /** Milliseconds since the transfer began. */
  readonly elapsedMs: number;
  /** Bytes each packet carries, for the throughput estimate. */
  readonly packetSize: number;
  readonly paused?: boolean;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onCancel: () => void;
}

/** Formats a byte rate for display. */
export function formatThroughput(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return '—';
  }
  if (bytesPerSecond >= 1_000_000) {
    return `${(bytesPerSecond / 1_000_000).toFixed(1)} MB/s`;
  }
  if (bytesPerSecond >= 1000) {
    return `${(bytesPerSecond / 1000).toFixed(1)} kB/s`;
  }
  return `${Math.round(bytesPerSecond)} B/s`;
}

/** Formats a duration for display, in units a user reads at a glance. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '—';
  }

  const seconds = Math.round(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/**
 * Estimates the time remaining from observed progress.
 *
 * Returns `undefined` rather than a guess when there is not yet enough
 * evidence — an estimate from one packet is noise, and showing noise as a
 * countdown is worse than showing nothing.
 */
export function estimateRemainingMs(
  completed: number,
  total: number,
  elapsedMs: number,
): number | undefined {
  if (completed <= 0 || total <= completed || elapsedMs <= 0) {
    return undefined;
  }

  const perPacket = elapsedMs / completed;
  return Math.round(perPacket * (total - completed));
}

export function TransferProgressScreen({
  title = 'Transferring',
  completedPackets,
  totalPackets,
  elapsedMs,
  packetSize,
  paused = false,
  onPause,
  onResume,
  onCancel,
}: TransferProgressScreenProps) {
  const ratio = totalPackets === 0 ? 0 : completedPackets / totalPackets;
  const seconds = elapsedMs / 1000;
  const throughput = seconds > 0 ? (completedPackets * packetSize) / seconds : 0;
  const remaining = estimateRemainingMs(completedPackets, totalPackets, elapsedMs);

  return (
    <Screen title={paused ? 'Paused' : title}>
      <Card>
        <ProgressRing value={ratio} label="Transfer progress" />
      </Card>

      <Card>
        <View style={styles.stats}>
          <Stat label="Packets" value={`${completedPackets} / ${totalPackets}`} />
          <Stat label="Throughput" value={formatThroughput(throughput)} />
          <Stat
            label="Remaining"
            value={remaining === undefined ? 'Estimating…' : formatDuration(remaining)}
          />
        </View>
        <Text variant="caption" tone="muted">
          Elapsed {formatDuration(elapsedMs)}
        </Text>
      </Card>

      <View style={styles.actions}>
        <Button
          label={paused ? 'Resume' : 'Pause'}
          variant="secondary"
          onPress={paused ? onResume : onPause}
        />
        <Button label="Cancel" variant="danger" onPress={onCancel} />
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="heading">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  stat: {
    gap: 2,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
});
