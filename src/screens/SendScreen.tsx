/**
 * Send (UI-003) — UI_SPEC §5.2.
 *
 * §5.2 requires a file picker, a selected files list, a QR speed control,
 * encryption and compression toggles, and a start button.
 *
 * The encryption and compression toggles are rendered **disabled**, with the
 * reason shown. Both are optional protocol features that §24.6 permits only
 * after capability negotiation, and neither is implemented — a toggle that
 * silently did nothing would be worse than one that explains itself.
 */
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListItem,
  LoadingState,
  ProgressBar,
  QrDisplay,
  Screen,
  Text,
} from '@components/index';
import { Spacing } from '@constants/tokens';
import { SendStage } from '@controllers/sendController';
import { useAppServices, useFrameDriver, useStore } from '@hooks/index';
import { QRSpeedPreference } from '@domain/settings';

export interface SendScreenProps {
  /** Opens the platform file picker. Injected: a screen owns no platform API. */
  readonly onPickFiles: () => void;
  readonly onBack: () => void;
  /** Rendering width for the QR frame, in points. */
  readonly frameSize?: number;
  /**
   * Ends the transfer, replacing the default `cancel`.
   *
   * Injected so the route can record the transfer before the controller
   * resets — cancelling clears the session id and the file list, which is
   * exactly what a history record is made of. The screen still has one Cancel
   * button; what happens behind it is the route's business.
   */
  readonly onCancel?: () => void;
}

/**
 * §5.2's speed control, in the user's vocabulary.
 *
 * The screen offers a preference; how many milliseconds that becomes is the
 * transport's decision, made in the controller.
 */
const SPEEDS: readonly { readonly value: QRSpeedPreference; readonly label: string }[] =
  Object.freeze([
    { value: QRSpeedPreference.Slow, label: 'Slow' },
    { value: QRSpeedPreference.Balanced, label: 'Balanced' },
    { value: QRSpeedPreference.Fast, label: 'Fast' },
  ]);

export function SendScreen({ onPickFiles, onBack, frameSize = 280, onCancel }: SendScreenProps) {
  const { send } = useAppServices();
  const state = useStore(send.state);

  // §8: frames are displayed sequentially. Called before any early return —
  // a hook may not be conditional.
  useFrameDriver(send, state.stage);

  if (state.stage === SendStage.Preparing) {
    // §16: a loading indicator for QR generation.
    return (
      <Screen title="Send">
        <LoadingState message="Preparing frames…" />
      </Screen>
    );
  }

  if (state.stage === SendStage.Failed) {
    // §14: title, explanation, recovery action.
    return (
      <Screen title="Send">
        <ErrorState
          title="Could not prepare the transfer"
          description={state.errorMessage ?? 'Something went wrong.'}
          actionLabel="Try again"
          onAction={send.prepare}
        />
      </Screen>
    );
  }

  const transmitting = state.stage === SendStage.Sending || state.stage === SendStage.Paused;

  if (transmitting) {
    const frame = send.currentFrame(frameSize);
    const { position } = state;

    return (
      <Screen title={state.stage === SendStage.Paused ? 'Paused' : 'Sending'} scrollable={false}>
        <QrDisplay
          frame={frame}
          size={frameSize}
          caption={
            position === undefined
              ? undefined
              : `Frame ${position.index + 1} of ${position.frameCount} · ${position.durationMs} ms` +
                (position.loops > 0 ? ` · pass ${position.loops + 1}` : '')
          }
        />

        {/*
          Controls sit directly beneath the code, above everything else, and the
          screen does not scroll while transmitting. On a device the previous
          layout put Pause and Cancel below the fold behind a code that was
          redrawing five times a second, and they could not be reached.
        */}
        <View style={styles.row}>
          <Button
            label={state.stage === SendStage.Paused ? 'Resume' : 'Pause'}
            variant="secondary"
            onPress={state.stage === SendStage.Paused ? send.start : send.pause}
          />
          <Button label="Restart" variant="ghost" onPress={send.restart} />
          <Button label="Cancel" variant="danger" onPress={onCancel ?? send.cancel} />
        </View>

        <Card>
          {/*
            §10 permits adapting timing mid-transfer, and this is the moment a
            user knows they need to: the other device is in front of them and
            failing to read. Offering the control only before transmission asked
            them to guess.
          */}
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

          <ProgressBar
            value={position === undefined ? 0 : (position.index + 1) / position.frameCount}
            label="Frames displayed"
          />
          <Text variant="caption" tone="muted">
            Point the other device at this screen. The sequence repeats until you stop it.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Send" subtitle="Choose files, then show the codes to the other device">
      <Card>
        <Text variant="heading">Files</Text>

        {state.files.length === 0 ? (
          <EmptyState
            title="No files selected"
            description="Pick one or more files to send."
            actionLabel="Choose files"
            onAction={onPickFiles}
          />
        ) : (
          <View>
            {state.files.map((file) => (
              <ListItem
                key={file.name}
                title={file.name}
                subtitle={`${file.content.byteLength} bytes`}
                trailing="Remove"
                accessibilityHint="Removes this file from the transfer"
                onPress={() => send.removeFile(file.name)}
              />
            ))}
            <View style={styles.spaced}>
              <Button label="Add more" variant="ghost" onPress={onPickFiles} />
            </View>
          </View>
        )}
      </Card>

      <Card>
        <Text variant="heading">Speed</Text>
        <Text variant="caption" tone="muted">
          Slower codes are easier for the other camera to read.
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
      </Card>

      <Card>
        <Text variant="heading">Protection</Text>
        <View style={styles.spaced}>
          <ListItem title="Encryption" subtitle="Not available in this version" trailing="Off" />
          <ListItem title="Compression" subtitle="Not available in this version" trailing="Off" />
        </View>
      </Card>

      <Button
        label="Start transfer"
        onPress={send.beginTransfer}
        disabled={state.files.length === 0}
        fullWidth
      />
      <Button label="Back" variant="ghost" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  spaced: {
    marginTop: Spacing.sm,
  },
});
