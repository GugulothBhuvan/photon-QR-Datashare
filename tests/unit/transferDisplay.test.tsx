/**
 * Display control during a transfer (QR_SPEC §11).
 *
 * §11 asks the sender for maximum brightness, no screen sleep and a fixed
 * orientation. The requirement that decides whether a transfer survives is
 * sleep prevention — a device showing codes receives no touches, so the system
 * dims and sleeps it mid-transfer.
 *
 * The invariant worth testing is **release**, not acquire. A hold that is
 * taken and never given back leaves a phone at full brightness with sleep
 * disabled, which costs a user their battery for as long as the app is open.
 */
import { act, cleanup, render } from '@testing-library/react-native';

import { createPlatformDisplay } from '@config/platformDisplay';
import { AppServicesProvider } from '@hooks/useAppServices';
import { useTransferDisplay } from '@hooks/index';
import type { ReactNode } from 'react';

afterEach(() => {
  cleanup();
});

/** A component whose only job is to hold the display while mounted. */
function Holder({ active }: { readonly active: boolean }) {
  useTransferDisplay(active);
  return null;
}

function wrap(beginTransferDisplay: (() => () => void) | undefined, children: ReactNode) {
  // Only the field under test is real; a screen needs nothing else here.
  const services = { beginTransferDisplay } as unknown as Parameters<
    typeof AppServicesProvider
  >[0]['services'];

  return <AppServicesProvider services={services}>{children}</AppServicesProvider>;
}

describe('useTransferDisplay (§11)', () => {
  it('holds the display while a transfer is on screen', async () => {
    const release = jest.fn();
    const begin = jest.fn(() => release);

    await render(wrap(begin, <Holder active />));

    expect(begin).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
  });

  it('releases when the screen goes away', async () => {
    // The case that costs a user their battery if it is wrong.
    const release = jest.fn();
    const begin = jest.fn(() => release);

    await render(wrap(begin, <Holder active />));
    await act(async () => {
      cleanup();
    });

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases when the transfer ends, without waiting for the screen to close', async () => {
    const release = jest.fn();
    const begin = jest.fn(() => release);

    const view = await render(wrap(begin, <Holder active />));

    await act(async () => {
      view.rerender(wrap(begin, <Holder active={false} />));
    });

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('takes no hold at all when nothing is being transferred', async () => {
    const begin = jest.fn(() => jest.fn());

    await render(wrap(begin, <Holder active={false} />));

    expect(begin).not.toHaveBeenCalled();
  });

  it('does nothing on a platform that cannot control the display', async () => {
    // §11 says SHOULD. A build without the native modules still transfers.
    await render(wrap(undefined, <Holder active />));
  });
});

describe('platform display resolution', () => {
  it('reports the §11 requirements it can meet', () => {
    const display = createPlatformDisplay();

    // Whatever resolved, it is named — the About screen reports these, so a
    // device that silently cannot dim or hold itself awake is diagnosable.
    for (const capability of display.capabilities) {
      expect(['sleep prevented', 'brightness raised', 'orientation locked']).toContain(capability);
    }
  });

  it('keeps the capabilities it has when one module is missing', () => {
    // Each is guarded separately on purpose. Losing sleep prevention because
    // brightness control is unavailable would be a poor trade, and sleep is
    // the one that ends a transfer outright.
    jest.isolateModules(() => {
      jest.doMock('expo-brightness', () => {
        throw new Error('native module missing');
      });

      const { createPlatformDisplay: create } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@config/platformDisplay') as typeof import('@config/platformDisplay');
      const display = create();

      expect(display.capabilities).not.toContain('brightness raised');
      expect(display.capabilities).toContain('sleep prevented');
      // Reported, not swallowed.
      expect(display.unavailableReason).toMatch(/native module missing/);
    });
  });

  it('returns a release that is safe to call', () => {
    const display = createPlatformDisplay();

    expect(() => display.begin()()).not.toThrow();
  });
});
