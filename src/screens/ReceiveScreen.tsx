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
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ErrorState,
  ListItem,
  LoadingState,
  ProgressRing,
  Screen,
  Text,
} from '@components/index';
import { Radius, Spacing } from '@constants/tokens';
import { ReceiveStage } from '@controllers/receiveController';
// The advice names a value the sender actually offers, by construction.
import { RELIABLE_PACKET_SIZE } from '@controllers/sendController';
import { useAppServices, useStore, useTransferDisplay } from '@hooks/index';
import { useTheme } from '@components/ThemeProvider';
import { createStore } from '@state/store';

/** One file that arrived, as the receive screen reports it. */
export interface ReceivedFile {
  readonly name: string;
  readonly size: number;
  /** Whether its integrity check passed (§3.24). */
  readonly verified: boolean;
  /** Where it was written. Absent when it failed and was discarded. */
  readonly savedTo?: string;
}

export interface ReceiveScreenProps {
  readonly onBack: () => void;
  readonly onComplete?: () => void;
  /**
   * What arrived, once the user has saved (§5.3).
   *
   * Saving used to happen silently: files were written and nothing said so,
   * which left no way to tell a completed transfer from one that had failed to
   * write. A file that failed verification is listed too — a user whose file
   * did not verify needs to be told, not left to find it missing.
   */
  readonly received?: readonly ReceivedFile[];
  /** Why saving failed, when it did. */
  readonly saveError?: string;
}

/**
 * Stands in when the platform reports no camera errors.
 *
 * A hook may not be called conditionally, and `cameraErrors` is absent on a
 * platform with no device camera. Module scope keeps the identity stable, so
 * the subscription is not rebuilt on every render.
 */
const NO_CAMERA_ERRORS = createStore<string | undefined>(undefined);

/** The same stand-in, for a platform that counts no dropped frames. */
const NO_CAMERA_DROPS = createStore({ backpressure: 0, pipeline: 0 });

export function ReceiveScreen({
  onBack,
  onComplete,
  received = [],
  saveError,
}: ReceiveScreenProps) {
  const {
    receive,
    cameraPreview: CameraPreview,
    cameraUnavailableReason,
    cameraErrors,
    cameraDrops,
    decoderStats,
  } = useAppServices();
  const state = useStore(receive.state);
  const cameraError = useStore(cameraErrors ?? NO_CAMERA_ERRORS);
  const drops = useStore(cameraDrops ?? NO_CAMERA_DROPS);
  const { colors } = useTheme();

  /**
   * Live rates, sampled once a second.
   *
   * Cumulative counters say whether anything is happening; rates say whether
   * it is happening fast enough, and they are what makes a slow receiver
   * diagnosable. Three separate numbers because they fail separately: frames
   * arriving is the camera, frames decoding is the optics and the decoder, and
   * packets collected is the protocol.
   */
  const [rates, setRates] = useState({ seen: 0, decoded: 0, collected: 0 });
  const [decode, setDecode] = useState({ decodes: 0, meanMs: 0, trackedHits: 0 });
  const sample = useRef({ seen: 0, decoded: 0, collected: 0, at: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const previous = sample.current;
      const current = receive.state.getState();
      const seconds = previous.at === 0 ? 0 : (now - previous.at) / 1000;

      if (seconds > 0) {
        setRates({
          seen: (current.framesSeen - previous.seen) / seconds,
          decoded: (current.framesDecoded - previous.decoded) / seconds,
          collected: (current.collectedPackets - previous.collected) / seconds,
        });
      }

      setDecode(decoderStats?.() ?? { decodes: 0, meanMs: 0, trackedHits: 0 });

      sample.current = {
        seen: current.framesSeen,
        decoded: current.framesDecoded,
        collected: current.collectedPackets,
        at: now,
      };
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [receive, decoderStats]);

  /**
   * What the receiver is doing, rendered in **every** state.
   *
   * Four device sessions were spent on a receiver that reported nothing, and
   * the reason turned out to be structural rather than protocol: the counters
   * lived below a camera preview on a screen that does not scroll, and every
   * error state returned early before reaching them. A user could be stuck on
   * the permission gate, or looking at a dead camera, and the screen looked
   * the same either way.
   *
   * This is the first thing on the screen in every branch, so there is no
   * state in which the receiver is silent about what it is doing.
   */
  const status = (
    <Card>
      <Text variant="label">{`Stage: ${state.stage}`}</Text>
      <Text variant="caption" tone="muted">
        {`Camera permission: ${state.permission}`}
      </Text>
      <Text variant="caption" tone="muted">
        {CameraPreview === undefined ? 'Camera: unavailable' : 'Camera: device'}
      </Text>
      <Text variant="caption" tone="muted">
        {`Frames seen: ${String(state.framesSeen)} · decoded: ${String(state.framesDecoded)}`}
      </Text>
      <Text variant="caption" tone="muted">
        {`Rate: ${rates.seen.toFixed(1)} captured/s · ${rates.decoded.toFixed(1)} decoded/s · ${rates.collected.toFixed(1)} packets/s`}
      </Text>
      {/*
        Decode cost, which turns "slow" into a number that can be optimised,
        and the tracking hit rate, which says whether the crop path is earning
        its place on this device.
      */}
      <Text variant="caption" tone="muted">
        {`Decode: ${decode.meanMs.toFixed(0)} ms mean · ${String(decode.trackedHits)} of ${String(decode.decodes)} from a crop`}
      </Text>
      {/*
        Two drop counts, never summed. Backpressure drops are this application
        declining frames the decoder cannot keep up with — the healthy state
        above the decode rate, and a measure of what a faster decoder would
        buy. Pipeline drops are the camera failing to deliver, which is a
        different problem with a different fix.
      */}
      <Text variant="caption" tone="muted">
        {`Dropped: ${String(drops.backpressure)} waiting on decode · ${String(drops.pipeline)} by the camera`}
      </Text>
      {state.errorMessage === undefined ? null : (
        <Text variant="caption" tone="danger">
          {state.errorMessage}
        </Text>
      )}
      {state.refusalReason === undefined ? null : (
        <Text variant="caption" tone="danger">
          {state.refusalReason}
        </Text>
      )}
      {cameraError === undefined ? null : (
        <Text variant="caption" tone="danger">
          {`Camera error: ${cameraError}`}
        </Text>
      )}
    </Card>
  );

  /**
   * Whether a code was read in the last moment.
   *
   * Drives the corner brackets, so the lock means something: it lights when
   * symbols are actually being decoded and goes out when they stop. A static
   * frame that always looked the same told a user nothing about whether their
   * aim was working.
   */
  const [locked, setLocked] = useState(false);
  const lastDecoded = useRef(state.framesDecoded);

  useEffect(() => {
    if (state.framesDecoded === lastDecoded.current) {
      return;
    }

    lastDecoded.current = state.framesDecoded;
    setLocked(true);

    // Long enough to be seen at any frame rate, short enough that the light
    // goes out promptly when the code leaves the view.
    const timer = setTimeout(() => setLocked(false), 600);

    return () => {
      clearTimeout(timer);
    };
  }, [state.framesDecoded]);

  // §11 applies to a receiver too. A phone held still and pointed at another
  // screen is exactly what the system reads as idle, and a receiver that
  // sleeps mid-transfer loses everything collected so far.
  useTransferDisplay(
    state.stage === ReceiveStage.Searching || state.stage === ReceiveStage.Scanning,
  );

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
        {status}
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
        {status}
        <ErrorState
          title="Camera access required"
          description={
            state.permissionRefused
              ? 'Permission was refused. Android will not ask again - turn the camera on for photon in the system settings.'
              : 'Allow camera permission to receive files.'
          }
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
        {status}
        <LoadingState message="Starting camera…" />
      </Screen>
    );
  }

  if (state.stage === ReceiveStage.Failed) {
    return (
      <Screen title="Receive">
        {status}
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
    <Screen title="Receive">
      {status}
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
        {/*
          Four corner brackets rather than a rectangle. A QR symbol is square,
          so a square target is what a user should be filling; the old overlay
          inherited the preview's shape and asked them to aim a rectangle at a
          square. The brackets brighten while codes are being read, which is
          the only aiming feedback the receiver can honestly give.
        */}
        <View style={styles.reticle} pointerEvents="none">
          {CORNERS.map((corner) => (
            <View
              key={corner.key}
              style={[
                styles.corner,
                corner.style,
                { borderColor: locked ? colors.success : colors.border },
              ]}
            />
          ))}
        </View>
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

        {/*
          What the counters mean while searching, said plainly. Three failures
          look identical from outside — a camera delivering nothing, frames
          that will not decode, and a sender that has not started — and this is
          the difference between a bug report that takes a minute and one that
          takes four device sessions.
        */}
        {state.stage !== ReceiveStage.Searching ? null : (
          <Text variant="caption" tone="muted">
            {state.framesSeen === 0
              ? 'No frames from the camera yet.'
              : state.framesDecoded === 0
                ? `Camera working (${String(state.framesSeen)} frames), but no code read yet.`
                : `Reading codes (${String(state.framesDecoded)} of ${String(state.framesSeen)} frames).`}
          </Text>
        )}

        {/*
          The fixes, in the order that actually works, once the camera has been
          running a while with nothing to show for it. Most of them are on the
          *sending* device, which is the part nobody guesses.

          The threshold is frames rather than seconds: a camera that has
          delivered nothing has a different problem, and telling someone to
          move closer would be wrong advice confidently given.
        */}
        {state.stage === ReceiveStage.Searching &&
        state.framesDecoded === 0 &&
        state.framesSeen > NO_SIGNAL_FRAMES ? (
          <View style={styles.hint}>
            <Text variant="label">Nothing decoding?</Text>
            <Text variant="caption" tone="muted">
              1. On the sender, tap the code to make it full screen.
            </Text>
            <Text variant="caption" tone="muted">
              {`2. On the sender, drop bytes per frame to ${String(RELIABLE_PACKET_SIZE)}.`}
            </Text>
            <Text variant="caption" tone="muted">
              3. On the sender, choose Slow.
            </Text>
            <Text variant="caption" tone="muted">
              4. Fill this camera&apos;s view with the code, and rest the phone against something —
              a hunting autofocus is the usual culprit.
            </Text>
            <Text variant="caption" tone="muted">
              5. Turn the sending screen&apos;s brightness all the way up.
            </Text>
          </View>
        ) : null}
      </Card>

      {/*
        §5.3: what arrived, whether it verified, and where it went. Saving
        used to happen silently, which left a completed transfer and a failed
        write looking identical.
      */}
      {received.length === 0 ? null : (
        <Card>
          <Text variant="heading">Received</Text>
          {received.map((file) => (
            <ListItem
              key={file.name}
              title={file.name}
              subtitle={
                file.verified
                  ? (file.savedTo ?? `${String(file.size)} bytes`)
                  : 'Failed verification — discarded'
              }
              trailing={file.verified ? 'Verified' : 'Failed'}
            />
          ))}
        </Card>
      )}

      {saveError === undefined ? null : (
        <Text variant="caption" tone="danger">
          {`Could not save: ${saveError}`}
        </Text>
      )}

      {state.stage === ReceiveStage.Complete &&
      onComplete !== undefined &&
      received.length === 0 ? (
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

/**
 * Frames to see before offering advice.
 *
 * About ten seconds of a working camera. Long enough that a user pointing the
 * phone at a sender still starting up is not interrupted, short enough to
 * arrive while they are still holding it there.
 */
const NO_SIGNAL_FRAMES = 150;

/** Arm length of each corner bracket, in points. */
const CORNER_LENGTH = 28;

/** Thickness of the two borders that form each bracket. */
const CORNER_WEIGHT = 3;

/**
 * The four brackets that mark the scan target.
 *
 * Each is a box showing only the two borders that meet at its corner, which
 * draws an L without any path work.
 */
const CORNERS = [
  {
    key: 'tl',
    style: { borderLeftWidth: CORNER_WEIGHT, borderTopWidth: CORNER_WEIGHT, left: 0, top: 0 },
  },
  {
    key: 'tr',
    style: { borderRightWidth: CORNER_WEIGHT, borderTopWidth: CORNER_WEIGHT, right: 0, top: 0 },
  },
  {
    key: 'bl',
    style: { borderBottomWidth: CORNER_WEIGHT, borderLeftWidth: CORNER_WEIGHT, bottom: 0, left: 0 },
  },
  {
    key: 'br',
    style: {
      borderBottomWidth: CORNER_WEIGHT,
      borderRightWidth: CORNER_WEIGHT,
      bottom: 0,
      right: 0,
    },
  },
] as const;

const styles = StyleSheet.create({
  hint: {
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  corner: {
    borderColor: 'transparent',
    height: CORNER_LENGTH,
    position: 'absolute',
    width: CORNER_LENGTH,
  },
  preview: {
    alignItems: 'center',
    // Square, because a QR symbol is. A rectangular preview asks a user to
    // fill a rectangle with a square and leaves them guessing how close is
    // close enough.
    aspectRatio: 1,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  reticle: {
    aspectRatio: 1,
    position: 'absolute',
    width: '72%',
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
