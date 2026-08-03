/**
 * Observable store primitive (ARC-004).
 *
 * A minimal immutable store, written rather than imported: no state library
 * appears in planning/DEPENDENCIES.md §9's allowed list, and every third-party
 * dependency requires review before adoption. This is small enough that the
 * dependency is not worth its review.
 *
 * State is replaced, never mutated (docs/API_SPEC.md §2, §15.5). Notification
 * is synchronous so a sequence of updates produces a deterministic sequence of
 * renders.
 */

export type Listener<TState> = (state: Readonly<TState>, previous: Readonly<TState>) => void;

export type Updater<TState> = (previous: Readonly<TState>) => TState;

export type Selector<TState, TSlice> = (state: Readonly<TState>) => TSlice;

export type Unsubscribe = () => void;

export interface Store<TState> {
  /** Current state. Always frozen. */
  getState(): Readonly<TState>;

  /**
   * Replaces state with the result of `updater`.
   *
   * The updater must be pure and must not mutate its argument. If it returns
   * the same reference, no listener is notified.
   */
  setState(updater: Updater<TState>): void;

  /** Subscribes to every state change. Returns the unsubscribe function. */
  subscribe(listener: Listener<TState>): Unsubscribe;

  /**
   * Subscribes to one slice of state.
   *
   * The listener runs only when the selected value changes, compared with
   * `Object.is`. This is what keeps a progress update from re-rendering an
   * unrelated screen.
   */
  select<TSlice>(
    selector: Selector<TState, TSlice>,
    listener: (slice: TSlice, previous: TSlice) => void,
  ): Unsubscribe;

  /** Restores the initial state. Subscribers are notified; they are not removed. */
  reset(): void;
}

/**
 * Creates a store.
 *
 * @param initialState Starting state. Frozen on entry.
 */
export function createStore<TState>(initialState: TState): Store<TState> {
  const initial = Object.freeze(initialState);
  let state: Readonly<TState> = initial;
  const listeners = new Set<Listener<TState>>();

  function notify(previous: Readonly<TState>): void {
    // Snapshot: subscribing or unsubscribing during notification must not
    // change who is notified for this transition.
    for (const listener of [...listeners]) {
      listener(state, previous);
    }
  }

  function subscribe(listener: Listener<TState>): Unsubscribe {
    listeners.add(listener);

    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      listeners.delete(listener);
    };
  }

  return {
    getState() {
      return state;
    },

    setState(updater) {
      const previous = state;
      const next = updater(previous);

      if (Object.is(next, previous)) {
        return;
      }

      state = Object.freeze(next);
      notify(previous);
    },

    subscribe,

    select(selector, listener) {
      let current = selector(state);

      return subscribe((nextState) => {
        const next = selector(nextState);
        if (Object.is(next, current)) {
          return;
        }
        const previous = current;
        current = next;
        listener(next, previous);
      });
    },

    reset() {
      const previous = state;
      if (Object.is(initial, previous)) {
        return;
      }
      state = initial;
      notify(previous);
    },
  };
}
