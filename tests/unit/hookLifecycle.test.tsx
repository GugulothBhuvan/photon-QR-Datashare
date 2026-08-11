/**
 * Hook cleanup on unmount (TST-001) — TEST_SPEC §4, §7.
 *
 * Two hooks own timers and one owns a store subscription. A hook that fails to
 * release its resource leaks: an interval keeps firing after a screen is gone,
 * a subscription notifies a component that no longer exists, and the frame
 * driver keeps pacing a transfer nobody is watching. §7 lists CPU and battery,
 * and a leaked interval is exactly how an idle app spends both.
 *
 * **Why these are in a file of their own.** Unmounting mid-test leaves this
 * version of the testing library's renderer in a state where every later render
 * in the same file produces an empty tree — by either `unmount()` or
 * `cleanup()`. So each test here unmounts once and asserts only on things
 * observed *outside* the tree: a mock, a store, a call count. No render follows
 * an unmount within a test, and `jest.isolateModules` is not needed because
 * nothing here re-renders after tearing down.
 */
import { act, render } from '@testing-library/react-native';
import { View } from 'react-native';

import { SendStage, type SendController } from '@controllers/sendController';
import { useElapsed } from '@hooks/useElapsed';
import { useFrameDriver } from '@hooks/useFrameDriver';
import { useStore } from '@hooks/useStore';
import { createStore } from '@state/store';

describe('unmount releases what a hook holds', () => {
  it('useStore stops re-rendering once its tree is gone', async () => {
    const store = createStore({ count: 0 });
    let renders = 0;

    function Host() {
      useStore(store);
      renders += 1;
      return <View />;
    }

    const view = await render(<Host />);
    const before = renders;

    view.unmount();

    await act(async () => {
      store.setState(() => ({ count: 99 }));
    });

    // The store still works; the unmounted component simply no longer hears
    // about it. A leaked subscription would have rendered again — and React
    // would have warned about updating an unmounted component.
    expect(store.getState().count).toBe(99);
    expect(renders).toBe(before);
  });

  it('useElapsed stops reading the clock', async () => {
    jest.useFakeTimers();

    try {
      const now = jest.fn(() => 2000);

      function Host() {
        useElapsed(now, 1000, 100);
        return <View />;
      }

      const view = await render(<Host />);
      view.unmount();

      const readsBefore = now.mock.calls.length;

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // Ten intervals' worth of time with no further reading of the clock.
      // Counting pending timers instead would count the renderer's own.
      expect(now).toHaveBeenCalledTimes(readsBefore);
    } finally {
      jest.useRealTimers();
    }
  });

  it('useFrameDriver stops advancing frames', async () => {
    jest.useFakeTimers();

    try {
      const advance = jest.fn();
      const state = createStore({ position: { index: 0, frameCount: 4, durationMs: 200 } });
      const send = { state, advance } as unknown as SendController;

      function Host() {
        useFrameDriver(send, SendStage.Sending);
        return <View />;
      }

      const view = await render(<Host />);
      view.unmount();

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Ten frame durations, no advance: the driver stopped with the screen.
      expect(advance).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
