/**
 * Receive, rateless engine (F8) — ADR-0008.
 *
 * Separate from `ReceiveScreen` for the same reason the send screen is: this
 * one has **no missing-packet counter**, because there is no such thing as a
 * frame that had to arrive. Progress is blocks solved out of blocks needed, and
 * every code read moves it whether or not that particular code was ever shown
 * before.
 *
 * It keeps the diagnostics that took four device sessions to learn were
 * necessary: frames seen against frames decoded, said in words, so a camera
 * delivering nothing and a camera delivering unreadable frames are told apart
 * at a glance.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ErrorState,
  ListItem,
  LoadingState,
  ProgressRing,
  ScanTracker,
  Screen,
  Text,
} from '@components/index';
import { Radius, Spacing } from '@constants/tokens';
import { FountainReceiveStage } from '@controllers/fountainReceiveController';
import { useAppServices, useScanTracker, useStore, useTransferDisplay } from '@hooks/index';
import { useTheme } from '@components/ThemeProvider';

export interface FountainReceiveScreenProps {
  readonly onBack: () => void;
  /** Saves the received file. Injected: a screen owns no platform API. */
  readonly onSave?: () => void;
  /** Where the file was written, once it has been. */
  readonly savedTo?: string;
}

/** Why a completed transfer was refused, in words a user can act on. */
function describeRejection(outcome: string): string {
  switch (outcome) {
    case 'INTEGRITY_FAILED':
      return 'The file arrived complete but did not match its checksum. It was not saved.';
    case 'UNREADABLE':
      return 'The other device sent something this app cannot read.';
    default:
      return 'The file did not survive the journey. Try again, more slowly.';
  }
}

export function FountainReceiveScreen({ onBack, onSave, savedTo }: FountainReceiveScreenProps) {
  const { fountain, cameraPreview: CameraPreview, cameraUnavailableReason } = useAppServices();
  const receive = fountain.receiveController;
  const state = useStore(receive.state);
  const { colors } = useTheme();
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | undefined>(
    undefined,
  );

  const active =
    state.stage === FountainReceiveStage.Watching ||
    state.stage === FountainReceiveStage.Collecting;

  // §11 applies to a receiver too: a phone held still and pointed at a screen
  // is exactly what the system reads as idle.
  useTransferDisplay(active);

  // The rateless receiver had a plain square and no lock indicator at all —
  // nothing on screen said whether a code had been seen.
  const tracker = useScanTracker(active);

  useEffect(() => {
    if (state.stage === FountainReceiveStage.Stopped) {
      void receive.listen();
    }
  }, [receive, state.stage]);

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

  if (state.stage === FountainReceiveStage.NeedsPermission) {
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

  if (state.stage === FountainReceiveStage.Starting) {
    return (
      <Screen title="Receive">
        <LoadingState message="Starting camera…" />
      </Screen>
    );
  }

  if (state.stage === FountainReceiveStage.Failed) {
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

  const ratio = state.k === 0 ? 0 : state.blocksSolved / state.k;

  return (
    <Screen title="Receive" scrollable={false}>
      <View
        style={[styles.preview, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
        accessibilityLabel="Camera preview"
        onLayout={(event) => {
          setPreviewSize(event.nativeEvent.layout);
        }}
      >
        {CameraPreview === undefined ? null : <CameraPreview />}
        <ScanTracker
          locked={tracker.locked}
          {...(tracker.quad === undefined ? {} : { quad: tracker.quad })}
          {...(tracker.frame === undefined ? {} : { frame: tracker.frame })}
          {...(previewSize === undefined ? {} : { preview: previewSize })}
        />
        <Text variant="caption" tone="muted" style={styles.previewText}>
          {CameraPreview === undefined
            ? 'Camera preview unavailable on this platform'
            : 'Point at the sending device'}
        </Text>
      </View>

      <Card>
        <ProgressRing value={ratio} label="Blocks recovered" />

        <View style={styles.stats}>
          <Stat label="Recovered" value={`${String(state.blocksSolved)} / ${String(state.k)}`} />
          <Stat label="Codes read" value={String(state.framesAccepted)} />
          <Stat
            label="Frames"
            value={`${String(state.framesDecoded)} / ${String(state.framesSeen)}`}
          />
        </View>

        <Text
          variant="label"
          tone={state.stage === FountainReceiveStage.Complete ? 'success' : 'muted'}
        >
          {state.stage === FountainReceiveStage.Complete
            ? 'File received and verified'
            : state.stage === FountainReceiveStage.Rejected
              ? 'Transfer refused'
              : state.stage === FountainReceiveStage.Collecting
                ? 'Receiving…'
                : 'Looking for a sender…'}
        </Text>

        {/*
          The three failures that look identical from outside. Kept from the
          packet receiver because they were learned the hard way.
        */}
        {state.stage !== FountainReceiveStage.Watching ? null : (
          <Text variant="caption" tone="muted">
            {state.framesSeen === 0
              ? 'No frames from the camera yet.'
              : state.framesDecoded === 0
                ? `Camera working (${String(state.framesSeen)} frames), but no code read yet.`
                : `Reading codes (${String(state.framesDecoded)} of ${String(state.framesSeen)} frames).`}
          </Text>
        )}

        {state.framesForeign === 0 ? null : (
          <Text variant="caption" tone="muted">
            {`${String(state.framesForeign)} codes from a different transfer were ignored.`}
          </Text>
        )}

        {state.rejection === undefined ? null : (
          <Text variant="caption" tone="danger">
            {describeRejection(state.rejection)}
          </Text>
        )}
      </Card>

      {state.stage === FountainReceiveStage.Complete && state.file !== undefined ? (
        <Card>
          <Text variant="heading">Received</Text>
          <ListItem
            title={state.file.name}
            subtitle={savedTo ?? `${String(state.file.content.byteLength)} bytes`}
            trailing="Verified"
          />
          {savedTo === undefined && onSave !== undefined ? (
            <Button label="Save file" onPress={onSave} fullWidth />
          ) : null}
        </Card>
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
  preview: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
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
