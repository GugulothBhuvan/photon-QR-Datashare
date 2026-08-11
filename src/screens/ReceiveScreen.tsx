/**
 * Receive (UI-004) — UI_SPEC §5.3.
 *
 * §5.3 requires a camera preview, a scan overlay, a progress indicator, a
 * missing packet counter and a transfer status.
 *
 * The camera preview is **live on a device** and a placeholder elsewhere. The
 * composition root resolves the platform's camera and hands this screen an
 * opaque preview component (ADR-0005), so the screen renders a real camera
 * without importing the adapter layer — which the layer boundary forbids.
 * Under Node and on the web there is no camera, and the placeholder says so
 * rather than pretending to be one.
 */
import { useEffect } from 'react';
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
  const { receive, cameraPreview: CameraPreview, cameraUnavailableReason } = useAppServices();
  const state = useStore(receive.state);
  const { colors } = useTheme();

  // §7.4: a receiver watches for a sender rather than being told about one.
  // Started once permission exists and nothing is running yet — a receive
  // screen that required a button would be asking the user to do the one thing
  // they cannot know how to do.
  useEffect(() => {
    if (state.stage === ReceiveStage.Stopped) {
      void receive.listen();
    }
  }, [receive, state.stage]);

  // §14: a clear title, an explanation, and a recovery action.
  //
  // This comes before the permission gate deliberately. If the camera module
  // itself failed to load, asking for permission is pointless — the user would
  // grant it and still see nothing. Saying so is the difference between a bug
  // report that takes minutes and one that takes three device sessions.
  if (CameraPreview === undefined && cameraUnavailableReason !== undefined) {
    return (
      <Screen title="Receive">
        <ErrorState
          title="Camera unavailable on this device"
          description={`The camera could not be started: ${cameraUnavailableReason}`}
          actionLabel="Back"
          onAction={onBack}
        />
      </Screen>
    );
  }

  // §14 again for permission. The stage says this rather than the raw
  // permission value — camera vocabulary belongs to the adapter, and the
  // controller has already translated it.
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
        {/*
          The live camera on a device, the placeholder everywhere else. The
          component arrives through the composition root already bound to the
          adapter, so this screen renders a real camera without importing one —
          the layer boundary forbids a screen reaching into `@camera` (ADR-0005).
        */}
        {CameraPreview === undefined ? null : <CameraPreview />}
        <View style={[styles.overlay, { borderColor: colors.primary }]} />
        <Text variant="caption" tone="muted" style={styles.previewText}>
          {CameraPreview === undefined
            ? 'Camera preview unavailable on this platform'
            : 'Point at the sending device'}
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
              ? 'Receiving…'
              : state.stage === ReceiveStage.Searching
                ? 'Looking for a sender…'
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
