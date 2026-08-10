/**
 * Route wiring (UI-001) — UI_SPEC §3, §4.
 *
 * Originally a Phase 0 build-integrity check against a placeholder home
 * screen. Phase 8 replaced that placeholder, so this now checks two things:
 * that the index route binds `HomeScreen` with §5.1's four actions, and that
 * **every route §3 declares has a module that renders**.
 *
 * The second is the reason this file grew. `Route.Transfer` was declared with
 * no `app/transfer.tsx` behind it — a screen that existed, passed its own
 * tests, and could not be reached. Only a test that walks the declared routes
 * catches that.
 *
 * Routes are rendered inside the providers `app/_layout.tsx` establishes.
 * Rendering one bare would test a configuration that never occurs.
 */
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ComponentType, ReactNode } from 'react';

import { ThemeProvider } from '@components/ThemeProvider';
import { createAppGraph, createMemorySettingsRepository } from '@config/appComposition';
import { AppServicesProvider } from '@hooks/useAppServices';
import { Route } from '@navigation/routes';

import AboutRoute from '../../app/about';
import HistoryRoute from '../../app/history';
import IndexRoute from '../../app/index';
import ReceiveRoute from '../../app/receive';
import SendRoute from '../../app/send';
import SettingsRoute from '../../app/settings';
import TransferRoute from '../../app/transfer';

/**
 * Fixed metrics so layout does not depend on a device.
 *
 * `SafeAreaProvider` resolves insets from a native layout event that never
 * arrives in a test renderer; without these the tree suspends on an empty
 * context.
 */
const INSETS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Every route the information architecture declares, and its module. */
const ROUTES: Readonly<Record<Route, ComponentType>> = {
  [Route.Home]: IndexRoute,
  [Route.Send]: SendRoute,
  [Route.Receive]: ReceiveRoute,
  [Route.Transfer]: TransferRoute,
  [Route.History]: HistoryRoute,
  [Route.Settings]: SettingsRoute,
  [Route.About]: AboutRoute,
};

function wrap(children: ReactNode) {
  return (
    <SafeAreaProvider initialMetrics={INSETS}>
      <AppServicesProvider
        services={createAppGraph({ settingsRepository: createMemorySettingsRepository() })}
      >
        <ThemeProvider setting="LIGHT">{children}</ThemeProvider>
      </AppServicesProvider>
    </SafeAreaProvider>
  );
}

describe('route wiring (UI-001, §3)', () => {
  it('has a module for every declared route', () => {
    // Fails if a route is added to `Route` without a file behind it.
    expect(Object.keys(ROUTES).sort()).toEqual([...Object.values(Route)].sort());
  });

  it.each(Object.entries(ROUTES))('renders %s', async (_path, RouteComponent) => {
    await render(wrap(<RouteComponent />));

    // A route that threw never reaches here. `toJSON` is null for a route that
    // rendered nothing, which `toBeDefined` on the root would not catch.
    expect(screen.toJSON()).not.toBeNull();
  });
});

describe('router entry', () => {
  it('renders the index route', async () => {
    await render(wrap(<IndexRoute />));

    expect(screen.getByText('photon')).toBeOnTheScreen();
  });

  it.each(['Send files', 'Receive files', 'History', 'Settings'])(
    'offers the %s action',
    async (label) => {
      await render(wrap(<IndexRoute />));

      expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
    },
  );
});
