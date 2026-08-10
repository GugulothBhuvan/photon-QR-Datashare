/**
 * Receive (UI-004) — UI_SPEC §5.3.
 *
 * §5.3 requires a camera preview, a scan overlay, a progress indicator, a
 * missing packet counter and a transfer status.
 *
 * **The camera preview is a placeholder.** No device camera adapter exists yet
 * — streaming frames to JavaScript needs a native module and a development
 * build. The `CameraAdapter` contract is what the controller talks to, so the
 * screen is complete and the pipeline runs; only the preview surface is
 * missing. Recorded as A12-01.
 */
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ErrorState,
  LoadingState,
  ProgressRing,
  Screen,
  Text,
} from '@components/index';
import { Radius, Spacing } from '@constants/tokens';
import { ReceiveStage } from '@controllers/receiveController';
import { useAppServices, useStore } from '@hooks/index';
import { useTheme } from '@components/ThemeProvider';

export interface ReceiveScreenProps {
  readonly onBack: () => void;
  readonly onComplete?: () => void;
}

export function ReceiveScreen({ onBack, onComplete }: ReceiveScreenProps) {
  const { receive } = useAppServices();
  const state = useStore(receive.state);
  const { colors } = useTheme();

  // §14: a clear title, an explanation, and a recovery action. The stage says
  // this rather than the raw permission value — camera vocabulary belongs to
  // the adapter, and the controller has already translated it.
  if (state.stage === ReceiveStage.NeedsPermission) {
    return (
      <Screen title="Receive">
        <ErrorState
          title="Camera access required"
          description="Allow camera permission to receive files."
          actionLabel="Grant permission"
          onAction={() => {
            void receive.requestPermission();
          }}
        />
        <Button label="Back" variant="ghost" onPress={onBack} />
      </Screen>
    );
  }

  if (state.stage === ReceiveStage.Starting) {
    // §16: a loading indicator for camera initialization.
    return (
      <Screen title="Receive">
        <LoadingState message="Starting camera…" />
      </Screen>
    );
  }

  if (state.stage === ReceiveStage.Failed) {
    return (
      <Screen title="Receive">
        <ErrorState
          title="Camera unavailable"
          description={state.errorMessage ?? 'The camera could not be started.'}
          actionLabel="Back"
          onAction={onBack}
        />
      </Screen>
    );
  }

  const ratio = state.totalPackets === 0 ? 0 : state.collectedPackets / state.totalPackets;

  return (
    <Screen title="Receive" scrollable={false}>
      {/* §5.3 camera preview and scan overlay */}
      <View
        style={[styles.preview, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
        accessibilityLabel="Camera preview"
      >
        <View style={[styles.overlay, { borderColor: colors.primary }]} />
        <Text variant="caption" tone="muted" style={styles.previewText}>
          Point at the sending device
        </Text>
      </View>

      <Card>
        {/* §5.3 progress indicator */}
        <ProgressRing value={ratio} label="Packets collected" />

        <View style={styles.stats}>
          <Stat label="Collected" value={`${state.collectedPackets} / ${state.totalPackets}`} />
          {/* §5.3 missing packet counter */}
          <Stat label="Missing" value={String(state.missingPackets)} />
          <Stat label="Frames read" value={`${state.framesDecoded} / ${state.framesSeen}`} />
        </View>

        {/* §5.3 transfer status */}
        <Text variant="label" tone={state.stage === ReceiveStage.Complete ? 'success' : 'muted'}>
          {state.stage === ReceiveStage.Complete
            ? 'All packets received'
            : state.stage === ReceiveStage.Scanning
              ? 'Scanning…'
              : 'Stopped'}
        </Text>
      </Card>

      {state.stage === ReceiveStage.Complete && onComplete !== undefined ? (
        <Button label="Save files" onPress={onComplete} fullWidth />
      ) : null}

      <Button
        label="Stop"
        variant="secondary"
        onPress={() => {
          void receive.stop();
        }}
      />
      <Button label="Back" variant="ghost" onPress={onBack} />
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
  overlay: {
    borderRadius: Radius.md,
    borderWidth: 2,
    height: '70%',
    position: 'absolute',
    width: '70%',
  },
  preview: {
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 220,
  },
  previewText: {
    bottom: Spacing.md,
    position: 'absolute',
  },
  stat: {
    gap: 2,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.lg,
    justifyContent: 'space-between',
    marginVertical: Spacing.md,
  },
});
