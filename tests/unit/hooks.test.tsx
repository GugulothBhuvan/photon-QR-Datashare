/**
 * Hooks (TST-001) — TEST_SPEC §4, invariant §15.1.
 *
 * The hooks layer is the only place React and the controllers meet, which makes
 * it the one place a subscription bug can make a correct controller look
 * broken. Until now these were exercised only incidentally, through screens
 * that happened to render.
 *
 * Each hook is driven through a host component rather than called directly:
 * hooks are only meaningful inside a render, and a test that called one
 * outside would be testing something the application never does.
 *
 * **Nothing here unmounts.** Unmounting mid-test — by either `unmount()` or
 * `cleanup()` — leaves this library's renderer in a state where every later
 * render in the same file produces an empty tree. Every test passed alone and
 * failed in sequence, which is exactly how that failure hides. Tests that need
 * an unmount live in `hookLifecycle.test.tsx`, one per file-load, so no render
 * ever follows one.
 *
 * Queries go through the render result rather than the global `screen`: one
 * tree, unambiguously.
 */
import { act, render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

import { SendStage, type SendController } from '@controllers/sendController';
import { useAppServices, AppServicesProvider, type AppServices } from '@hooks/useAppServices';
import { useElapsed } from '@hooks/useElapsed';
import { useFrameDriver } from '@hooks/useFrameDriver';
import { useStore, useStoreSelector } from '@hooks/useStore';
import { createStore } from '@state/store';

interface Counter {
  readonly count: number;
  readonly label: string;
}

type CounterStore = ReturnType<typeof createStore<Counter>>;

describe('useStore', () => {
  function Host({ store }: { readonly store: CounterStore }) {
    const state = useStore(store);
    return <Text>{`${state.label}:${state.count}`}</Text>;
  }

  it('renders the store’s current value', async () => {
    const store = createStore<Counter>({ count: 3, label: 'a' });
    const view = await render(<Host store={store} />);

    expect(view.getByText('a:3')).toBeOnTheScreen();
  });

  it('re-renders when the store changes', async () => {
    const store = createStore<Counter>({ count: 0, label: 'a' });
    const view = await render(<Host store={store} />);

    await act(async () => {
      store.setState((previous) => ({ ...previous, count: 1 }));
    });

    expect(view.getByText('a:1')).toBeOnTheScreen();
  });
});

describe('useStoreSelector', () => {
  /** Counts renders so a re-render that should not happen is visible. */
  function makeHost() {
    const renders = { count: 0 };
    const select = (state: Counter) => state.label;

    function Host({ store }: { readonly store: CounterStore }) {
      const label = useStoreSelector(store, select);
      renders.count += 1;
      return <Text>{label}</Text>;
    }

    return { Host, renders };
  }

  it('renders only the selected slice', async () => {
    const { Host } = makeHost();
    const store = createStore<Counter>({ count: 7, label: 'hello' });

    const view = await render(<Host store={store} />);

    expect(view.getByText('hello')).toBeOnTheScreen();
  });

  it('re-renders when the slice changes', async () => {
    const { Host } = makeHost();
    const store = createStore<Counter>({ count: 0, label: 'before' });

    const view = await render(<Host store={store} />);

    await act(async () => {
      store.setState((previous) => ({ ...previous, label: 'after' }));
    });

    expect(view.getByText('after')).toBeOnTheScreen();
  });

  it('does not re-render when an unselected field changes', async () => {
    // This is the hook's entire reason for existing: a progress update must not
    // re-render a screen that only reads the stage.
    const { Host, renders } = makeHost();
    const store = createStore<Counter>({ count: 0, label: 'steady' });

    await render(<Host store={store} />);
    const before = renders.count;

    await act(async () => {
      store.setState((previous) => ({ ...previous, count: previous.count + 1 }));
    });

    expect(renders.count).toBe(before);
    expect(store.getState().count).toBe(1);
  });
});

describe('useElapsed', () => {
  function Host({
    now,
    since,
    intervalMs,
  }: {
    readonly now: () => number;
    readonly since: number | undefined;
    readonly intervalMs?: number;
  }) {
    const elapsed = useElapsed(now, since, intervalMs);
    return <Text>{`elapsed:${elapsed}`}</Text>;
  }

  it('reports zero when there is nothing to measure', async () => {
    const view = await render(<Host now={() => 5000} since={undefined} />);

    expect(view.getByText('elapsed:0')).toBeOnTheScreen();
  });

  it('reports the difference immediately, without waiting an interval', async () => {
    // A transfer already under way must not show zero on first paint.
    const view = await render(<Host now={() => 5000} since={2000} />);

    expect(view.getByText('elapsed:3000')).toBeOnTheScreen();
  });

  it('advances as the clock advances', async () => {
    jest.useFakeTimers();

    try {
      let current = 2000;
      const view = await render(<Host now={() => current} since={2000} intervalMs={500} />);

      expect(view.getByText('elapsed:0')).toBeOnTheScreen();

      current = 3500;
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(view.getByText('elapsed:1500')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('never reports a negative elapsed time', async () => {
    // A clock that steps backwards — a device time correction — must not
    // produce a countdown running the wrong way.
    const view = await render(<Host now={() => 1000} since={5000} />);

    expect(view.getByText('elapsed:0')).toBeOnTheScreen();
  });
});

describe('useFrameDriver', () => {
  /**
   * A send controller reduced to what the driver actually touches.
   *
   * A real controller would need a whole transfer prepared to reach a frame
   * duration, which would make these tests about the transfer service rather
   * than about the driver. The store is real; only the surface is narrowed.
   */
  function stubController(durationMs: number | undefined) {
    const advance = jest.fn();
    const state = createStore<{
      position: { index: number; frameCount: number; durationMs: number } | undefined;
    }>({
      position: durationMs === undefined ? undefined : { index: 0, frameCount: 4, durationMs },
    });

    return {
      advance,
      state,
      controller: { state, advance } as unknown as SendController,
    };
  }

  function Host({
    send,
    stage,
    enabled,
  }: {
    readonly send: SendController;
    readonly stage: SendStage;
    readonly enabled?: boolean;
  }) {
    useFrameDriver(send, stage, enabled);
    return <View />;
  }

  it('advances once per frame duration while sending', async () => {
    jest.useFakeTimers();

    try {
      const { controller, advance } = stubController(200);
      await render(<Host send={controller} stage={SendStage.Sending} />);

      expect(advance).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(advance).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      expect(advance).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([SendStage.Selecting, SendStage.Preparing, SendStage.Ready, SendStage.Paused])(
    'does not advance while %s',
    async (stage) => {
      jest.useFakeTimers();

      try {
        const { controller, advance } = stubController(200);
        await render(<Host send={controller} stage={stage} />);

        await act(async () => {
          jest.advanceTimersByTime(2000);
        });

        expect(advance).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('does nothing when explicitly disabled', async () => {
    jest.useFakeTimers();

    try {
      const { controller, advance } = stubController(200);
      await render(<Host send={controller} stage={SendStage.Sending} enabled={false} />);

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(advance).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does nothing when there is no frame to show', async () => {
    jest.useFakeTimers();

    try {
      const { controller, advance } = stubController(undefined);
      await render(<Host send={controller} stage={SendStage.Sending} />);

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(advance).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('re-reads the duration each tick, so a speed change applies to the next frame', async () => {
    jest.useFakeTimers();

    try {
      const { controller, advance, state } = stubController(200);
      await render(<Host send={controller} stage={SendStage.Sending} />);

      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(advance).toHaveBeenCalledTimes(1);

      // The user picks a slower speed mid-transfer (§10). The frame already on
      // screen keeps the duration it was scheduled with — the change applies
      // from the *next* frame, which is what re-reading after each advance
      // means. Expecting it to apply immediately would be expecting the driver
      // to cut short a frame the receiver is still reading.
      await act(async () => {
        state.setState(() => ({ position: { index: 1, frameCount: 4, durationMs: 1000 } }));
      });

      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(advance).toHaveBeenCalledTimes(2);

      // From here the slower duration governs: nothing at 200 ms...
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(advance).toHaveBeenCalledTimes(2);

      // ...and the next frame arrives only after the full second.
      await act(async () => {
        jest.advanceTimersByTime(800);
      });
      expect(advance).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useAppServices', () => {
  function Host() {
    const services = useAppServices();
    return <Text>{`now:${services.now()}`}</Text>;
  }

  it('hands a screen the services the provider holds', async () => {
    const services = { now: () => 4242 } as AppServices;

    const view = await render(
      <AppServicesProvider services={services}>
        <Host />
      </AppServicesProvider>,
    );

    expect(view.getByText('now:4242')).toBeOnTheScreen();
  });

  it('throws loudly when no provider is present', async () => {
    // A missing provider is a wiring mistake. Returning `undefined` would make
    // every screen guard against a case that should fail at first render.
    //
    // The throw is caught inside the component rather than expected from
    // `render`, because how a renderer surfaces an error thrown during render
    // is the renderer's business — asserting on that would tie this test to
    // React's error plumbing rather than to the hook's contract.
    function Probe() {
      try {
        useAppServices();
        return <Text>reached</Text>;
      } catch (error: unknown) {
        return <Text>{(error as Error).message}</Text>;
      }
    }

    const view = await render(<Probe />);

    expect(view.getByText(/AppServicesProvider/)).toBeOnTheScreen();
    expect(view.queryByText('reached')).toBeNull();
  });
});
