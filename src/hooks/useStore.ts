/**
 * Store subscription hook.
 *
 * The single bridge between the observable stores the controllers own and
 * React's render cycle. `src/hooks` is the only place those two meet — a
 * controller may not import React (the lint boundary enforces it), and a
 * component may not reach past a hook to a service.
 *
 * Built on `useSyncExternalStore` because that is the API React provides for
 * exactly this: it subscribes, re-reads on notification, and stays correct
 * under concurrent rendering, which a `useState` + `useEffect` pair does not.
 */
import { useCallback, useSyncExternalStore } from 'react';

import type { Store } from '@state/store';

/** Subscribes to a whole store. */
export function useStore<TState>(store: Store<TState>): Readonly<TState> {
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(() => onChange()),
    [store],
  );

  return useSyncExternalStore(subscribe, store.getState, store.getState);
}

/**
 * Subscribes to one slice of a store.
 *
 * The component re-renders only when the selected value changes, so a progress
 * update does not re-render a screen that only reads the stage.
 *
 * The selector must be stable — defined at module scope or wrapped in
 * `useCallback` — or the subscription is rebuilt on every render.
 */
export function useStoreSelector<TState, TSlice>(
  store: Store<TState>,
  selector: (state: Readonly<TState>) => TSlice,
): TSlice {
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(() => onChange()),
    [store],
  );

  const getSnapshot = useCallback(() => selector(store.getState()), [store, selector]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
