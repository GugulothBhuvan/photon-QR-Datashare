/**
 * Send, rateless engine (F8) — ADR-0008.
 *
 * A separate screen from `SendScreen` rather than a branch inside it. The two
 * transports present differently enough that one screen would spend most of
 * its body deciding which it was: this one has no file list because it carries
 * one file, no progress bar because there is nothing to progress towards, and
 * a pass counter instead of a frame count because the stream does not end.
 *
 * What it does share is the parts that are about *light* rather than about the
 * protocol — a code that fills the screen, a fullscreen tap, and the display
 * held awake and bright (§11).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button, Card, EmptyState, ErrorState, QrDisplay, Screen, Text } from '@components/index';
import { Spacing } from '@constants/tokens';
import { FountainSendStage } from '@controllers/fountainSendController';
import { QRSpeedPreference } from '@domain/settings';
import { useAppServices, useFountainFrameDriver, useStore, useTransferDisplay } from '@hooks/index';

export interface FountainSendScreenProps {
  /** Opens the platform file picker. Injected: a screen owns no platform API. */
  readonly onPickFile: () => void;
  readonly onBack: () => void;
  readonly frameSize?: number;
}

const SPEEDS: readonly { readonly value: QRSpeedPreference; readonly label: string }[] =
  Object.freeze([
    { value: QRSpeedPreference.Slow, label: 'Slow' },
    { value: QRSpeedPreference.Balanced, label: 'Balanced' },
    { value: QRSpeedPreference.Fast, label: 'Fast' },
  ]);

/** Payload bytes per code, before the 20-byte frame header. */
const BLOCK_LENGTHS: readonly number[] = Object.freeze([256, 512, 1024, 1500, 2048]);

export function FountainSendScreen({ onPickFile, onBack, frameSize }: FountainSendScreenProps) {
  const { fountain } = useAppServices();
  const send = fountain.sendController;
  const state = useStore(send.state);
  const { width, height } = useWindowDimensions();
  const [fullscreen, setFullscreen] = useState(false);

  const displaySize = frameSize ?? Math.floor(Math.min(width, height) * (fullscreen ? 0.99 : 0.92));

  const transmitting =
    state.stage === FountainSendStage.Sending || state.stage === FountainSendStage.Paused;

  useFountainFrameDriver(send, state.stage);
  // §11: bright, awake and unrotated for exactly as long as codes are shown.
  useTransferDisplay(transmitting);

  if (state.stage === FountainSendStage.Failed) {
    return (
      <Screen title="Send">
        <ErrorState
          title="Could not start the transfer"
          description={state.errorMessage ?? 'Something went wrong.'}
          actionLabel="Back"
          onAction={onBack}
        />
      </Screen>
    );
  }

  if (transmitting) {
    const code = (
      <Pressable
        onPress={() => setFullscreen((on) => !on)}
        accessibilityRole="button"
        accessibilityLabel={fullscreen ? 'Exit full screen' : 'Show the code full screen'}
        accessibilityHint="A larger code is easier for the other device to read"
      >
        <QrDisplay
          frame={send.currentFrame(displaySize)}
          size={displaySize}
          caption={
            fullscreen || state.position === undefined
              ? undefined
              : `${state.position.systematic ? 'Sweep' : 'Repair'} · pass ${String(state.position.pass + 1)}`
          }
        />
      </Pressable>
    );

    if (fullscreen) {
      return (
        <Screen scrollable={false} style={styles.fullscreen}>
          {code}
        </Screen>
      );
    }

    return (
      <Screen
        title={state.stage === FountainSendStage.Paused ? 'Paused' : 'Sending'}
        scrollable={false}
      >
        {code}

        <View style={styles.row}>
          <Button
            label={state.stage === FountainSendStage.Paused ? 'Resume' : 'Pause'}
            variant="secondary"
            onPress={state.stage === FountainSendStage.Paused ? send.resume : send.pause}
          />
          <Button label="Restart" variant="ghost" onPress={send.restart} />
          <Button label="Stop" variant="danger" onPress={send.cancel} />
        </View>

        <Card>
          <Text variant="label" tone="muted">
            Speed — slow down if the other device is struggling
          </Text>
          <View style={styles.row}>
            {SPEEDS.map((speed) => (
              <Button
                key={speed.value}
                label={speed.label}
                variant={state.speed === speed.value ? 'primary' : 'secondary'}
                onPress={() => send.setSpeed(speed.value)}
              />
            ))}
          </View>

          {/*
            No progress bar. There is nothing to progress towards: the sender
            does not know when the receiver has enough, and a bar that filled
            and then kept going would be a lie. The pass counter says what is
            true — how many times the whole file has been offered.
          */}
          <Text variant="caption" tone="muted">
            {`${String(state.k)} blocks · ${String(state.blockLength)} bytes per code`}
          </Text>
          <Text variant="caption" tone="muted">
            Keep showing this until the other device says it has the file. Any codes it misses are
            made up by later ones.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Send" subtitle="One file, shown as a repeating stream of codes">
      <Card>
        <Text variant="heading">File</Text>

        {state.file === undefined ? (
          <EmptyState
            title="No file selected"
            description="This engine sends one file at a time."
            actionLabel="Choose a file"
            onAction={onPickFile}
          />
        ) : (
          <View style={styles.spaced}>
            <Text variant="body">{state.file.name}</Text>
            <Text variant="caption" tone="muted">
              {`${String(state.file.content.byteLength)} bytes · ${state.file.mediaType}`}
            </Text>
            <View style={styles.spaced}>
              <Button label="Choose another" variant="ghost" onPress={onPickFile} />
            </View>
          </View>
        )}
      </Card>

      <Card>
        <Text variant="heading">Bytes per code</Text>
        <Text variant="caption" tone="muted">
          More bytes means fewer codes to show. Fewer bytes means a simpler code the other camera
          can read from further away.
        </Text>
        <View style={styles.row}>
          {BLOCK_LENGTHS.map((bytes) => (
            <Button
              key={bytes}
              label={String(bytes)}
              variant={state.blockLength === bytes ? 'primary' : 'secondary'}
              onPress={() => send.setBlockLength(bytes)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Text variant="heading">Speed</Text>
        <View style={styles.row}>
          {SPEEDS.map((speed) => (
            <Button
              key={speed.value}
              label={speed.label}
              variant={state.speed === speed.value ? 'primary' : 'secondary'}
              onPress={() => send.setSpeed(speed.value)}
            />
          ))}
        </View>
      </Card>

      <Button
        label="Start transfer"
        onPress={send.start}
        disabled={state.file === undefined}
        fullWidth
      />
      <Button label="Back" variant="ghost" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  spaced: {
    marginTop: Spacing.sm,
  },
});
