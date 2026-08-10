/**
 * Observable store (ARC-004) — docs/ARCHITECTURE.md §6.6.
 */
import { createStore } from '@state/store';

interface Counter {
  readonly count: number;
  readonly label: string;
}

const initial: Counter = { count: 0, label: 'idle' };

describe('createStore', () => {
  it('exposes the initial state', () => {
    expect(createStore(initial).getState()).toEqual(initial);
  });

  it('replaces state rather than mutating it', () => {
    const store = createStore(initial);
    const before = store.getState();

    store.setState((previous) => ({ ...previous, count: previous.count + 1 }));

    expect(store.getState().count).toBe(1);
    expect(before.count).toBe(0);
    expect(store.getState()).not.toBe(before);
  });

  it('freezes state so an accidental mutation cannot take effect', () => {
    const store = createStore(initial);

    expect(Object.isFrozen(store.getState())).toBe(true);

    // Under a non-strict runtime this write fails silently rather than
    // throwing, so assert the state itself is unchanged.
    (store.getState() as { count: number }).count = 99;
    expect(store.getState().count).toBe(0);
  });

  it('notifies subscribers with the new and previous state', () => {
    const store = createStore(initial);
    const listener = jest.fn();

    store.subscribe(listener);
    store.setState((previous) => ({ ...previous, count: 5 }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toEqual({ count: 5, label: 'idle' });
    expect(listener.mock.calls[0]?.[1]).toEqual(initial);
  });

  it('does not notify when the updater returns the same reference', () => {
    const store = createStore(initial);
    const listener = jest.fn();

    store.subscribe(listener);
    store.setState((previous) => previous);

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const store = createStore(initial);
    const listener = jest.fn();

    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    unsubscribe();
    store.setState((previous) => ({ ...previous, count: 1 }));

    expect(listener).not.toHaveBeenCalled();
  });

  describe('select', () => {
    it('notifies only when the selected slice changes', () => {
      const store = createStore(initial);
      const listener = jest.fn();

      store.select((state) => state.count, listener);

      store.setState((previous) => ({ ...previous, label: 'busy' }));
      expect(listener).not.toHaveBeenCalled();

      store.setState((previous) => ({ ...previous, count: 1 }));
      expect(listener).toHaveBeenCalledWith(1, 0);
    });

    it('reports the previous slice value', () => {
      const store = createStore(initial);
      const seen: [number, number][] = [];

      store.select(
        (state) => state.count,
        (next, previous) => seen.push([next, previous]),
      );

      store.setState((previous) => ({ ...previous, count: 1 }));
      store.setState((previous) => ({ ...previous, count: 2 }));

      expect(seen).toEqual([
        [1, 0],
        [2, 1],
      ]);
    });
  });

  it('does not deliver to a subscriber added during notification', () => {
    const store = createStore(initial);
    const late = jest.fn();

    store.subscribe(() => {
      store.subscribe(late);
    });

    store.setState((previous) => ({ ...previous, count: 1 }));
    expect(late).not.toHaveBeenCalled();

    store.setState((previous) => ({ ...previous, count: 2 }));
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('reset restores the initial state and notifies', () => {
    const store = createStore(initial);
    const listener = jest.fn();

    store.setState((previous) => ({ ...previous, count: 3 }));
    store.subscribe(listener);
    store.reset();

    expect(store.getState()).toEqual(initial);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reset from the initial state does not notify', () => {
    const store = createStore(initial);
    const listener = jest.fn();

    store.subscribe(listener);
    store.reset();

    expect(listener).not.toHaveBeenCalled();
  });
});
