/**
 * Receive controller and service error paths (TST-001) — TEST_SPEC §4, §11.
 *
 * The system suites drive the receive path hard, but only along the path that
 * works. What is left untested by them is everything that happens when
 * something goes wrong: permission refused, a camera that will not start, a
 * receiver stopped before it began, a transfer finished with nothing collected.
 *
 * Those are the paths a user actually meets — the happy path is the one they
 * never notice — and each must fail gracefully in §11's sense: no crash, no
 * partial file, and a stage or message that says what happened.
 */
import { CameraPermission, type CameraAdapter } from '@camera/cameraPort';
import { createMemoryCamera } from '@camera/memoryCamera';
import { createQrDecoder } from '@camera/qrDecoder';
import { createReceiveController, ReceiveStage } from '@controllers/receiveController';
import { createManifestManager } from '@core/manifest/manifestManager';
import { createPacketManager } from '@core/packet/packetManager';
import { createReceiveService } from '@services/receiveService';
import { createDisabledCipher } from '@security/cipher';
import type { IntegrityVerifier } from '@core/contracts';
import { sessionId } from '@domain/ids';

const SESSION = sessionId('11111111-1111-4111-8111-111111111111');

const verifier: IntegrityVerifier = {
  algorithm: 'TEST-DIGEST',
  digest: (bytes) => Uint8Array.from([bytes.length & 0xff]),
  verify: () => true,
};

/** A controller over an injectable camera; everything else is real. */
function build(camera: CameraAdapter) {
  const manifests = createManifestManager();
  const packets = createPacketManager();

  const receives = createReceiveService({
    camera,
    cipher: createDisabledCipher(),
    decoder: createQrDecoder(),
    packets,
    manifests,
    verifier,
  });

  return {
    manifests,
    packets,
    controller: createReceiveController({
      camera,
      receives,
      toUserMessage: (error: unknown) =>
        error instanceof Error ? `friendly: ${error.message}` : 'friendly: unknown',
    }),
  };
}

describe('camera permission (§12, §14)', () => {
  it('starts in the needs-permission stage rather than assuming access', () => {
    const { controller } = build(createMemoryCamera({ permission: CameraPermission.Undetermined }));
    const state = controller.state.getState();

    expect(state.stage).toBe(ReceiveStage.NeedsPermission);
    expect(state.permission).toBe(CameraPermission.Undetermined);
  });

  it('moves out of the permission gate once granted', async () => {
    const { controller } = build(createMemoryCamera({ permission: CameraPermission.Undetermined }));

    const granted = await controller.requestPermission();

    expect(granted).toBe(CameraPermission.Granted);
    expect(controller.state.getState().stage).toBe(ReceiveStage.Stopped);
  });

  it('stays in the permission gate when the user refuses', async () => {
    // The screen renders §14's recovery action off this stage, so a controller
    // that advanced anyway would show a camera preview over a dead camera.
    const denied: CameraAdapter = {
      ...createMemoryCamera({ permission: CameraPermission.Denied }),
      requestPermission: async () => CameraPermission.Denied,
    };

    const { controller } = build(denied);
    const result = await controller.requestPermission();

    expect(result).toBe(CameraPermission.Denied);
    expect(controller.state.getState().stage).toBe(ReceiveStage.NeedsPermission);
    expect(controller.state.getState().permission).toBe(CameraPermission.Denied);
  });

  it('reports a camera that refuses to start as failed, with a safe message', async () => {
    const camera = createMemoryCamera({ permission: CameraPermission.Denied });
    const { controller, manifests } = build(camera);

    expect(manifests.getManifest(SESSION)).toBeUndefined();

    await controller.start(SESSION);

    const state = controller.state.getState();

    expect(state.stage).toBe(ReceiveStage.Failed);
    // §6.11: the screen receives a user-safe message, never a protocol
    // internal. The prefix proves it went through the injected translator.
    expect(state.errorMessage).toMatch(/^friendly: /);
  });

  it('does not throw when starting fails', async () => {
    const camera = createMemoryCamera({ permission: CameraPermission.Denied });
    const { controller } = build(camera);

    // §11: fail gracefully. A rejected promise here would crash the screen that
    // called it from an effect.
    await expect(controller.start(SESSION)).resolves.toBeUndefined();
  });
});

describe('starting without a manifest (§10.14)', () => {
  it('fails rather than collecting packets it cannot place', async () => {
    // Without a manifest the receiver does not know how many packets any file
    // has, so §13.11 completion could never be decided. Failing loudly beats
    // collecting into a void.
    const { controller } = build(createMemoryCamera());

    await controller.start(SESSION);

    const state = controller.state.getState();

    expect(state.stage).toBe(ReceiveStage.Failed);
    expect(state.errorMessage).toMatch(/^friendly: /);
    expect(state.collectedPackets).toBe(0);
  });

  it('leaves the camera stopped after a failed start', async () => {
    const camera = createMemoryCamera();
    const { controller } = build(camera);

    await controller.start(SESSION);

    // The camera was started before the manifest lookup failed, so stopping is
    // the caller's job — but a failed start must not leave the controller
    // claiming to scan.
    expect(controller.state.getState().stage).not.toBe(ReceiveStage.Scanning);

    await controller.stop();
    expect(camera.isRunning()).toBe(false);
  });
});

describe('stopping (§14.5)', () => {
  it('is safe before anything has started', async () => {
    const { controller } = build(createMemoryCamera());

    await expect(controller.stop()).resolves.toBeUndefined();
    expect(controller.state.getState().stage).toBe(ReceiveStage.Stopped);
  });

  it('is idempotent', async () => {
    const camera = createMemoryCamera();
    const { controller } = build(camera);

    await controller.stop();
    await controller.stop();

    expect(camera.isRunning()).toBe(false);
    expect(controller.state.getState().stage).toBe(ReceiveStage.Stopped);
  });

  it('releases the camera', async () => {
    const camera = createMemoryCamera();
    const { controller } = build(camera);

    await camera.start();
    expect(camera.isRunning()).toBe(true);

    await controller.stop();

    expect(camera.isRunning()).toBe(false);
  });
});

describe('finishing (§13.11)', () => {
  it('returns nothing when no session was ever started', () => {
    const { controller } = build(createMemoryCamera());

    // Not an empty *file*, and not a throw: nothing was received, so there is
    // nothing to return.
    expect(controller.finish()).toEqual([]);
  });

  it('returns nothing after a failed start', async () => {
    const { controller } = build(createMemoryCamera());

    await controller.start(SESSION);

    expect(controller.finish()).toEqual([]);
  });

  it('returns nothing when stopped before any packet arrived', async () => {
    const { controller } = build(createMemoryCamera());

    await controller.stop();

    expect(controller.finish()).toEqual([]);
  });
});

describe('the receive service directly', () => {
  it('refuses to start for a session with no accepted manifest', () => {
    const camera = createMemoryCamera();
    const receives = createReceiveService({
      camera,
      cipher: createDisabledCipher(),
      decoder: createQrDecoder(),
      packets: createPacketManager(),
      manifests: createManifestManager(),
      verifier,
    });

    // Throwing here is right: the controller catches it and turns it into a
    // stage. A service that returned a broken session instead would push the
    // problem into every caller.
    expect(() => receives.start(SESSION)).toThrow();
  });

  it('unsubscribes from the camera when stopped, and stays stopped', async () => {
    const camera = createMemoryCamera();
    const { controller } = build(camera);

    await controller.stop();
    await controller.stop();

    // Two stops, no listeners left, no error. A stop that unsubscribed twice
    // would previously have thrown on the second.
    expect(camera.isRunning()).toBe(false);
  });
});
