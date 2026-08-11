/**
 * Display control during a transfer (QR_SPEC §11).
 *
 * §11 asks the sender to use maximum practical screen brightness, prevent
 * screen sleep, and maintain a fixed orientation. None of the three were
 * implemented: `qrRenderer.ts` correctly says they are device concerns
 * belonging to the UI layer, and the UI layer never picked them up.
 *
 * Screen sleep is the one that breaks a transfer outright. A sender displaying
 * codes receives no touches, so the system dims and sleeps it on schedule —
 * mid-transfer, with the receiver pointed at a black rectangle. Nothing in the
 * protocol can recover from that, because nothing is being transmitted.
 *
 * Loaded through guarded `require`s for the same reason the camera and file
 * picker are (ADR-0005): these need a native runtime, and importing them under
 * Node would break the suite on a machine with no device. Each is guarded
 * *separately* — a device missing one capability should still get the others,
 * and losing sleep prevention because brightness control is unavailable would
 * be a poor trade.
 */

/** What a screen showing QR codes needs from the platform. */
export interface PlatformDisplay {
  /**
   * Holds the screen awake and at full brightness, in a fixed orientation.
   *
   * Returns the function that undoes it. Undoing is the caller's
   * responsibility and must happen when the transfer ends — a device left at
   * maximum brightness with sleep disabled is a flat battery.
   */
  begin(): () => void;
  /** Which of §11's requirements this platform could actually meet. */
  readonly capabilities: readonly string[];
  /** Why any of them could not be met. */
  readonly unavailableReason?: string;
}

/** A tag for each §11 requirement, reported on the About screen. */
export const DisplayCapability = {
  KeepAwake: 'sleep prevented',
  Brightness: 'brightness raised',
  Orientation: 'orientation locked',
} as const;

/**
 * Resolves what this platform can do about §11.
 *
 * Never throws and never refuses: a transfer on a device that cannot raise its
 * brightness is worse than one that can, but it is much better than no
 * transfer. What was unavailable is reported rather than hidden.
 */
export function createPlatformDisplay(): PlatformDisplay {
  const capabilities: string[] = [];
  const failures: string[] = [];

  /** Loads one optional native module, recording it either way. */
  function load<T>(name: string, capability: string, loader: () => T): T | undefined {
    try {
      const module = loader();
      capabilities.push(capability);
      return module;
    } catch (error: unknown) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  const keepAwake = load('expo-keep-awake', DisplayCapability.KeepAwake, () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-keep-awake') as {
      activateKeepAwakeAsync(tag?: string): Promise<void>;
      deactivateKeepAwake(tag?: string): void;
    };
  });

  const brightness = load('expo-brightness', DisplayCapability.Brightness, () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-brightness') as {
      getBrightnessAsync(): Promise<number>;
      setBrightnessAsync(value: number): Promise<void>;
    };
  });

  const orientation = load('expo-screen-orientation', DisplayCapability.Orientation, () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-screen-orientation') as {
      lockAsync(lock: number): Promise<void>;
      unlockAsync(): Promise<void>;
      OrientationLock: { PORTRAIT_UP: number };
    };
  });

  /** The tag keeps this hold distinct from any other the app might take. */
  const TAG = 'photon-transfer';

  return {
    capabilities,
    ...(failures.length === 0 ? {} : { unavailableReason: failures.join('; ') }),

    begin() {
      // Captured before anything is changed, so the release below restores
      // what the user had rather than guessing at a default.
      let previousBrightness: number | undefined;

      void keepAwake?.activateKeepAwakeAsync(TAG);

      void (async () => {
        if (brightness === undefined) {
          return;
        }

        try {
          previousBrightness = await brightness.getBrightnessAsync();
          await brightness.setBrightnessAsync(1);
        } catch {
          // Android can refuse without the write-settings permission. §11 says
          // SHOULD, so a refusal is not a failed transfer.
        }
      })();

      // §11: a rotation mid-transfer resizes the code and interrupts the
      // sequence for as long as the animation lasts.
      void orientation?.lockAsync(orientation.OrientationLock.PORTRAIT_UP);

      return (): void => {
        keepAwake?.deactivateKeepAwake(TAG);
        void orientation?.unlockAsync();

        if (previousBrightness !== undefined) {
          void brightness?.setBrightnessAsync(previousBrightness);
        }
      };
    },
  };
}
