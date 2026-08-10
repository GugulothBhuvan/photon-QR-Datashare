/**
 * Routes (UI-001) — UI_SPEC §3, §4.
 *
 * §3 gives the information architecture and §4 the navigation: Home, Send,
 * Receive, History and Settings are primary, and Transfer Progress opens as a
 * full-screen flow.
 *
 * Route paths are declared once here rather than written as literals at call
 * sites, so a renamed route is a compile error rather than a dead button.
 * `planning/DEPENDENCIES.md` keeps navigation free of services and protocol —
 * this file names screens, nothing more.
 */

/** Every route in the application (§3). */
export const Route = {
  Home: '/',
  Send: '/send',
  Receive: '/receive',
  Transfer: '/transfer',
  History: '/history',
  Settings: '/settings',
  About: '/about',
} as const;

export type Route = (typeof Route)[keyof typeof Route];

/**
 * Routes reachable from primary navigation (§4).
 *
 * Transfer is absent deliberately: §4 makes it a full-screen flow entered from
 * a transfer, not a destination a user browses to.
 */
export const PRIMARY_ROUTES: readonly Route[] = Object.freeze([
  Route.Home,
  Route.Send,
  Route.Receive,
  Route.History,
  Route.Settings,
]);

/** Human-readable titles, for headers and accessibility labels. */
export const ROUTE_TITLES: Readonly<Record<Route, string>> = Object.freeze({
  [Route.Home]: 'photon',
  [Route.Send]: 'Send',
  [Route.Receive]: 'Receive',
  [Route.Transfer]: 'Transfer',
  [Route.History]: 'History',
  [Route.Settings]: 'Settings',
  [Route.About]: 'About',
});

/** Whether a route is part of primary navigation (§4). */
export function isPrimary(route: Route): boolean {
  return PRIMARY_ROUTES.includes(route);
}

/**
 * Whether a route is presented full-screen, without primary navigation.
 *
 * §4: Transfer Progress SHALL open as a full-screen flow. A user mid-transfer
 * should not be one tap from navigating away by accident.
 */
export function isFullScreen(route: Route): boolean {
  return route === Route.Transfer;
}
