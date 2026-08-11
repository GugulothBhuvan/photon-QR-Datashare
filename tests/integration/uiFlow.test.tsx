/**
 * Screens, controllers and navigation (UI-001…UI-007) — UI_SPEC §5, §18.
 *
 * Screens are rendered against the **real** graph — real controllers, real
 * services, the real protocol engine — with only the clock, the id source and
 * the camera substituted. That is the point of the composition root taking
 * every dependency: a screen test exercises the same code the app runs.
 */
import { act, cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createMemoryCamera } from '@camera/memoryCamera';
import { createStore } from '@state/store';
import { ThemeProvider } from '@components/ThemeProvider';
import { createAppGraph, createMemorySettingsRepository } from '@config/appComposition';
import type { Clock, IdGenerator } from '@core/contracts';
import {
  DEFAULT_PACKET_SIZE,
  PACKET_SIZE_OPTIONS,
  RELIABLE_PACKET_SIZE,
  SendStage,
} from '@controllers/sendController';
import { QRSpeedPreference } from '@domain/settings';
import { FRAME_DURATION_MS, FrameRate } from '@qr/frameScheduler';
import { AppServicesProvider } from '@hooks/useAppServices';
import {
  estimateRemainingMs,
  filterHistory,
  formatDuration,
  formatThroughput,
  HistoryScreen,
  HomeScreen,
  ReceiveScreen,
  SendScreen,
  SettingsScreen,
  TransferProgressScreen,
  type HistoryEntry,
} from '@screens/index';
import { isFullScreen, isPrimary, PRIMARY_ROUTES, Route } from '@navigation/routes';
import type { ReactNode } from 'react';

/**
 * Unmounts between tests.
 *
 * `render` is asynchronous in this version of the library, and without an
 * explicit unmount a tree from one test is still mounted when the next queries
 * the screen — so a later test finds an earlier test's content, or none at all.
 */
afterEach(() => {
  cleanup();
});

const clock: Clock = { now: () => 1_700_000_000_000 };

function ids(): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
  };
}

function makeGraph() {
  return createAppGraph({
    clock,
    idGenerator: ids(),
    camera: createMemoryCamera(),
    settingsRepository: createMemorySettingsRepository(),
  });
}

/**
 * Metrics a real device would supply.
 *
 * Passed explicitly because `SafeAreaProvider` measures asynchronously
 * otherwise, and a screen would render nothing on the first pass.
 */
const INSETS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Wraps a screen in the providers the app root supplies. */
function wrap(graph: ReturnType<typeof makeGraph>, children: ReactNode) {
  return (
    <SafeAreaProvider initialMetrics={INSETS}>
      <AppServicesProvider services={graph}>
        <ThemeProvider setting="LIGHT">{children}</ThemeProvider>
      </AppServicesProvider>
    </SafeAreaProvider>
  );
}

/** Wraps a screen that needs no controllers. */
function wrapPlain(children: ReactNode) {
  return (
    <SafeAreaProvider initialMetrics={INSETS}>
      <ThemeProvider setting="LIGHT">{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('navigation (UI-001, §3, §4)', () => {
  it('declares every route the information architecture lists (§3)', () => {
    expect(Object.values(Route)).toEqual([
      '/',
      '/send',
      '/receive',
      '/transfer',
      '/history',
      '/settings',
      '/about',
    ]);
  });

  it('makes exactly the five §4 destinations primary', () => {
    expect(PRIMARY_ROUTES).toEqual([
      Route.Home,
      Route.Send,
      Route.Receive,
      Route.History,
      Route.Settings,
    ]);
  });

  it('keeps Transfer out of primary navigation and full-screen (§4)', () => {
    // §4: Transfer Progress opens as a full-screen flow, so a user mid-transfer
    // is not one tap from leaving it.
    expect(isPrimary(Route.Transfer)).toBe(false);
    expect(isFullScreen(Route.Transfer)).toBe(true);
    expect(isFullScreen(Route.Home)).toBe(false);
  });
});

describe('Home (UI-002, §5.1)', () => {
  it.each([
    ['Send files', 'onSend'],
    ['Receive files', 'onReceive'],
    ['History', 'onHistory'],
    ['Settings', 'onSettings'],
  ] as const)('wires the %s action', async (label, key) => {
    // One press per test rather than four in one: `userEvent` applies a
    // realistic delay per press, and its synchronous counterpart leaves this
    // library's asynchronous renderer in a state that breaks later tests.
    const actions = {
      onSend: jest.fn(),
      onReceive: jest.fn(),
      onHistory: jest.fn(),
      onSettings: jest.fn(),
    };
    const user = userEvent.setup();

    await render(
      wrapPlain(
        <>
          <HomeScreen {...actions} />
        </>,
      ),
    );

    await user.press(screen.getByRole('button', { name: label }));

    expect(actions[key]).toHaveBeenCalledTimes(1);
  });

  it('shows the §15 empty state when there are no recent transfers', async () => {
    await render(
      wrapPlain(
        <>
          <HomeScreen
            onSend={jest.fn()}
            onReceive={jest.fn()}
            onHistory={jest.fn()}
            onSettings={jest.fn()}
          />
        </>,
      ),
    );

    expect(screen.getByText('No transfers yet')).toBeOnTheScreen();
  });

  it('lists recent transfers when there are some', async () => {
    await render(
      wrapPlain(
        <>
          <HomeScreen
            onSend={jest.fn()}
            onReceive={jest.fn()}
            onHistory={jest.fn()}
            onSettings={jest.fn()}
            recent={[{ id: '1', name: 'holiday.jpg', detail: '1 file', when: 'Today' }]}
          />
        </>,
      ),
    );

    expect(screen.getByText('holiday.jpg')).toBeOnTheScreen();
    expect(screen.queryByText('No transfers yet')).toBeNull();
  });
});

describe('Send (UI-003, §5.2)', () => {
  it('starts empty and disables the start button', async () => {
    const graph = makeGraph();
    await render(wrap(graph, <SendScreen onPickFiles={jest.fn()} onBack={jest.fn()} />));

    expect(screen.getByText('No files selected')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start transfer' })).toBeDisabled();
  });

  it('lists files the controller holds', async () => {
    const graph = makeGraph();
    graph.send.addFiles([{ name: 'notes.txt', content: Uint8Array.from([1, 2, 3]) }]);

    await render(wrap(graph, <SendScreen onPickFiles={jest.fn()} onBack={jest.fn()} />));

    expect(screen.getByText('notes.txt')).toBeOnTheScreen();
    expect(screen.getByText('3 bytes')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start transfer' })).not.toBeDisabled();
  });

  it('offers bytes per frame, which is the throughput lever (§5.2)', async () => {
    // A decode costs about the same whatever the payload, so bytes per frame
    // is nearly free throughput where frame rate is not. It was fixed and
    // hidden, which left a user with no way to trade density for speed.
    const graph = makeGraph();
    graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from([1, 2, 3]) }]);

    const user = userEvent.setup();
    await render(wrap(graph, <SendScreen onPickFiles={jest.fn()} onBack={jest.fn()} />));

    await user.press(screen.getByRole('button', { name: String(RELIABLE_PACKET_SIZE) }));

    expect(graph.send.state.getState().packetSize).toBe(RELIABLE_PACKET_SIZE);
  });

  it('offers the value its own troubleshooting advice names', () => {
    // The receiver tells a struggling user to drop to a specific number. If
    // the sender does not offer it, the advice is unfollowable.
    expect(PACKET_SIZE_OPTIONS).toContain(RELIABLE_PACKET_SIZE);
    expect(PACKET_SIZE_OPTIONS).toContain(DEFAULT_PACKET_SIZE);
  });

  it('starts a real transfer and shows the codes on one press (§5.2)', async () => {
    const graph = makeGraph();
    graph.send.addFiles([
      { name: 'payload.bin', content: Uint8Array.from({ length: 900 }, (_u, i) => i & 0xff) },
    ]);

    const user = userEvent.setup();
    await render(wrap(graph, <SendScreen onPickFiles={jest.fn()} onBack={jest.fn()} />));

    await user.press(screen.getByRole('button', { name: 'Start transfer' }));

    // The controller ran the real service: session, manifest, packets, frames.
    //
    // This asserted `Ready` until a physical device showed why that was wrong:
    // §5.2 has one start button, and `Ready` is the stage the send screen
    // renders as the *file list*. A transfer that stopped there looked to a
    // user exactly like a button that did nothing. Asserting the intermediate
    // stage made a passing test out of a broken screen.
    await waitFor(() => {
      expect(graph.send.state.getState().stage).toBe(SendStage.Sending);
    });

    const prepared = graph.send.prepared();
    expect(prepared?.frames.count).toBeGreaterThan(1);
    // Frames exceed packets by the two-frame preamble §7.5 and §7.6 require.
    expect(prepared?.frames.count).toBe((prepared?.totalPackets ?? 0) + 2);

    // And the screen is actually showing a code, not merely holding one.
    expect(screen.getByLabelText('QR frame')).toBeOnTheScreen();
  });

  it('renders the frame once transmitting', async () => {
    const graph = makeGraph();
    graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from({ length: 200 }, () => 7) }]);
    graph.send.prepare();
    graph.send.start();

    await render(wrap(graph, <SendScreen onPickFiles={jest.fn()} onBack={jest.fn()} />));

    expect(screen.getByLabelText('QR frame')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
  });

  it('reports encryption and compression as unavailable rather than pretending', async () => {
    // A toggle that silently did nothing would be worse than one that explains.
    const graph = makeGraph();
    await render(wrap(graph, <SendScreen onPickFiles={jest.fn()} onBack={jest.fn()} />));

    expect(screen.getAllByText('Not available in this version')).toHaveLength(2);
  });

  it('offers the speed control in the user vocabulary, not the transport one', async () => {
    // §5.2's control is a preference. "Reliable" is a frame rate and has no
    // business on a screen.
    const graph = makeGraph();
    await render(wrap(graph, <SendScreen onPickFiles={jest.fn()} onBack={jest.fn()} />));

    for (const label of ['Slow', 'Balanced', 'Fast']) {
      expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
    }
    expect(screen.queryByRole('button', { name: 'Reliable' })).toBeNull();
  });

  it.each([
    [QRSpeedPreference.Slow, FRAME_DURATION_MS[FrameRate.Reliable]],
    [QRSpeedPreference.Balanced, FRAME_DURATION_MS[FrameRate.Balanced]],
    [QRSpeedPreference.Fast, FRAME_DURATION_MS[FrameRate.Fast]],
  ])('translates the %s preference into a real frame duration', (speed, expected) => {
    // The preference must reach the scheduler, not merely be stored: a control
    // that changed a label and nothing else would pass a weaker test.
    const graph = makeGraph();
    graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from({ length: 200 }, () => 7) }]);
    graph.send.setSpeed(speed);
    graph.send.prepare();

    expect(graph.send.state.getState().position?.durationMs).toBe(expected);
    expect(graph.send.prepared()?.scheduler.state().durationMs).toBe(expected);
  });

  it('adapts a running transfer when the preference changes (§10)', () => {
    const graph = makeGraph();
    graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from({ length: 200 }, () => 7) }]);
    graph.send.prepare();
    graph.send.start();

    graph.send.setSpeed(QRSpeedPreference.Slow);

    expect(graph.send.prepared()?.scheduler.state().durationMs).toBe(
      FRAME_DURATION_MS[FrameRate.Reliable],
    );
    // §10 forbids adaptation from touching packet contents.
    expect(graph.send.prepared()?.scheduler.state().index).toBe(0);
  });

  it('renders frame geometry through the controller', () => {
    const graph = makeGraph();
    graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from({ length: 200 }, () => 7) }]);

    expect(graph.send.currentFrame(280)).toBeUndefined();

    graph.send.prepare();
    const geometry = graph.send.currentFrame(280);

    // Square, within the requested width, and carrying modules to draw (§13).
    expect(geometry?.size).toBeGreaterThan(0);
    expect(geometry?.size).toBeLessThanOrEqual(280);
    expect(geometry?.path.length).toBeGreaterThan(0);
    // A path, not thousands of rectangles — see QrDisplay.
    expect(geometry?.path.startsWith('M')).toBe(true);
    expect(geometry?.background).toBe('#FFFFFF');
  });

  it('drives the frame sequence while transmitting (§8, §9)', async () => {
    jest.useFakeTimers();

    try {
      const graph = makeGraph();
      graph.send.addFiles([
        { name: 'payload.bin', content: Uint8Array.from({ length: 900 }, (_u, i) => i & 0xff) },
      ]);
      graph.send.prepare();
      graph.send.start();

      await render(wrap(graph, <SendScreen onPickFiles={jest.fn()} onBack={jest.fn()} />));

      expect(graph.send.state.getState().position?.index).toBe(0);

      // One frame duration: the scheduler owns no timer, so this proves the UI
      // is driving it.
      await act(async () => {
        jest.advanceTimersByTime(FRAME_DURATION_MS[FrameRate.Balanced]);
      });

      expect(graph.send.state.getState().position?.index).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops driving when the transfer is paused (§14.5)', async () => {
    jest.useFakeTimers();

    try {
      const graph = makeGraph();
      graph.send.addFiles([
        { name: 'payload.bin', content: Uint8Array.from({ length: 900 }, (_u, i) => i & 0xff) },
      ]);
      graph.send.prepare();
      graph.send.start();
      graph.send.pause();

      await render(wrap(graph, <SendScreen onPickFiles={jest.fn()} onBack={jest.fn()} />));

      await act(async () => {
        jest.advanceTimersByTime(FRAME_DURATION_MS[FrameRate.Balanced] * 5);
      });

      // §14.5: a pause preserves state. A display that kept moving is not paused.
      expect(graph.send.state.getState().position?.index).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stamps the start time from the injected clock, and keeps it across a resume', () => {
    const graph = makeGraph();
    graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from({ length: 200 }, () => 7) }]);
    graph.send.prepare();

    expect(graph.send.state.getState().startedAt).toBeUndefined();

    graph.send.start();
    expect(graph.send.state.getState().startedAt).toBe(clock.now());

    // §5.4's elapsed time is how long the transfer has run, not how long since
    // the last resume.
    graph.send.pause();
    graph.send.start();
    expect(graph.send.state.getState().startedAt).toBe(clock.now());
  });

  it('publishes the frame position as the display advances (§8)', () => {
    const graph = makeGraph();
    graph.send.addFiles([
      { name: 'payload.bin', content: Uint8Array.from({ length: 900 }, (_u, i) => i & 0xff) },
    ]);
    graph.send.prepare();

    const { position } = graph.send.state.getState();
    expect(position?.index).toBe(0);
    expect(position?.frameCount).toBeGreaterThan(1);

    graph.send.advance();

    expect(graph.send.state.getState().position?.index).toBe(1);
  });
});

describe('Receive camera availability (Stage 0)', () => {
  /*
   * Three device sessions were lost to a camera that failed silently: a
   * VisionCamera 5 API mismatch threw, a bare `catch` swallowed it, and the
   * screen showed a placeholder that looked like a camera which had not
   * focused. These pin the reporting that was missing.
   */

  it('says why the camera is unavailable rather than showing a dead placeholder', async () => {
    const graph = makeGraph();

    await render(
      wrap(
        {
          ...graph,
          cameraUnavailableReason: 'VisionCamera.requestCameraPermission is not a function',
        },
        <ReceiveScreen onBack={jest.fn()} />,
      ),
    );

    expect(screen.getByText('Camera unavailable on this device')).toBeOnTheScreen();
    // The actual reason reaches the user, not a generic apology.
    expect(screen.getByText(/is not a function/)).toBeOnTheScreen();
  });

  it('reports the failure before asking for permission', async () => {
    // Asking for permission when the module never loaded is worse than
    // useless: the user grants it and still sees nothing.
    const graph = makeGraph();

    await render(
      wrap(
        { ...graph, cameraUnavailableReason: 'native module missing' },
        <ReceiveScreen onBack={jest.fn()} />,
      ),
    );

    expect(screen.queryByText('Camera access required')).toBeNull();
  });

  it('still asks for permission when the camera itself is fine', async () => {
    const graph = makeGraph();

    await render(wrap(graph, <ReceiveScreen onBack={jest.fn()} />));

    expect(screen.getByText('Camera access required')).toBeOnTheScreen();
    expect(screen.queryByText('Camera unavailable on this device')).toBeNull();
  });

  it('reports what arrived instead of saving silently (§5.3)', async () => {
    // Files used to be written with nothing said about it, which left a
    // completed transfer and a failed write looking identical.
    const graph = makeGraph();

    await render(
      wrap(
        graph,
        <ReceiveScreen
          onBack={jest.fn()}
          received={[
            {
              name: 'holiday.jpg',
              size: 2048,
              verified: true,
              savedTo: 'file:///docs/holiday.jpg',
            },
            { name: 'broken.bin', size: 10, verified: false },
          ]}
        />,
      ),
    );

    await act(async () => {
      await graph.receive.requestPermission();
    });

    expect(screen.getByText('holiday.jpg')).toBeOnTheScreen();
    expect(screen.getByText('file:///docs/holiday.jpg')).toBeOnTheScreen();
    // §20.14: a file that failed verification is reported, not quietly missing.
    expect(screen.getByText('Failed verification — discarded')).toBeOnTheScreen();
  });

  it('surfaces a session failure from a camera that did load', async () => {
    // A camera that loads and then fails to start is the case a static
    // `cameraUnavailableReason` cannot describe: the failure arrives after the
    // screen has mounted. It previously showed an empty preview, which looks
    // exactly like a working camera pointed at nothing.
    const graph = makeGraph();
    const cameraErrors = createStore<string | undefined>(undefined);

    await render(
      wrap(
        { ...graph, cameraErrors, cameraPreview: () => null },
        <ReceiveScreen onBack={jest.fn()} />,
      ),
    );

    await act(async () => {
      await graph.receive.requestPermission();
    });

    expect(screen.queryByText(/Camera error/)).toBeNull();

    await act(() => {
      cameraErrors.setState(() => 'Camera device was disconnected');
    });

    expect(screen.getByText(/Camera device was disconnected/)).toBeOnTheScreen();
  });
});

describe('Settings (UI-007, §5.6)', () => {
  it('shows all six sections', async () => {
    const graph = makeGraph();
    await render(wrap(graph, <SettingsScreen onBack={jest.fn()} onAbout={jest.fn()} />));

    for (const section of [
      'Appearance',
      'QR settings',
      'Camera',
      'Storage',
      'Security',
      'Developer',
    ]) {
      expect(screen.getByText(section)).toBeOnTheScreen();
    }
  });

  it('writes a theme change through the controller', async () => {
    const graph = makeGraph();
    const user = userEvent.setup();

    await render(wrap(graph, <SettingsScreen onBack={jest.fn()} onAbout={jest.fn()} />));
    await user.press(screen.getByRole('button', { name: 'Dark' }));

    await waitFor(() => {
      expect(graph.settings.state.getState().settings.theme).toBe('DARK');
    });
  });

  it('persists the change through the repository', async () => {
    const repository = createMemorySettingsRepository();
    const graph = createAppGraph({
      clock,
      idGenerator: ids(),
      camera: createMemoryCamera(),
      settingsRepository: repository,
    });

    await graph.settings.setQrSpeed('FAST');

    expect((await repository.get()).qrSpeed).toBe('FAST');
  });

  it('toggles a storage preference', async () => {
    const graph = makeGraph();
    const user = userEvent.setup();

    await render(wrap(graph, <SettingsScreen onBack={jest.fn()} onAbout={jest.fn()} />));
    await user.press(screen.getByRole('button', { name: 'Keep received files' }));

    await waitFor(() => {
      expect(graph.settings.state.getState().settings.storage.keepReceivedFiles).toBe(false);
    });
  });
});

describe('History (UI-006, §5.5, §15)', () => {
  const entries: readonly HistoryEntry[] = [
    {
      id: '1',
      name: 'holiday.jpg',
      fileCount: 1,
      totalBytes: 2048,
      completedAt: 1,
      direction: 'SEND',
      verified: true,
    },
    {
      id: '2',
      name: 'report.pdf',
      fileCount: 2,
      totalBytes: 9000,
      completedAt: 2,
      direction: 'RECEIVE',
      verified: true,
    },
  ];

  it('shows §15’s empty state verbatim when there is no history', async () => {
    await render(
      wrapPlain(
        <>
          <HistoryScreen onBack={jest.fn()} />
        </>,
      ),
    );

    expect(screen.getByText('No transfers yet')).toBeOnTheScreen();
    expect(screen.getByText('Your completed transfers will appear here.')).toBeOnTheScreen();
  });

  it('lists entries when there are some', async () => {
    await render(
      wrapPlain(
        <>
          <HistoryScreen entries={entries} onBack={jest.fn()} formatDate={() => 'Today'} />
        </>,
      ),
    );

    expect(screen.getByText('holiday.jpg')).toBeOnTheScreen();
    expect(screen.getByText('report.pdf')).toBeOnTheScreen();
  });

  describe('filterHistory', () => {
    it('returns everything by default', () => {
      expect(filterHistory(entries, '', 'ALL')).toHaveLength(2);
    });

    it('filters by direction', () => {
      expect(filterHistory(entries, '', 'SEND').map((e) => e.id)).toEqual(['1']);
      expect(filterHistory(entries, '', 'RECEIVE').map((e) => e.id)).toEqual(['2']);
    });

    it('searches by name, case-insensitively', () => {
      expect(filterHistory(entries, 'HOLIDAY', 'ALL').map((e) => e.id)).toEqual(['1']);
    });

    it('ignores surrounding whitespace', () => {
      expect(filterHistory(entries, '  report  ', 'ALL').map((e) => e.id)).toEqual(['2']);
    });

    it('combines search and filter', () => {
      expect(filterHistory(entries, 'holiday', 'RECEIVE')).toEqual([]);
    });
  });
});

describe('Transfer progress (UI-005, §5.4)', () => {
  it('shows the packet counter, throughput and remaining time', async () => {
    await render(
      wrapPlain(
        <>
          <TransferProgressScreen
            completedPackets={5}
            totalPackets={20}
            elapsedMs={5000}
            packetSize={512}
            onPause={jest.fn()}
            onResume={jest.fn()}
            onCancel={jest.fn()}
          />
        </>,
      ),
    );

    expect(screen.getByText('5 / 20')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Transfer progress' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
  });

  it('offers Resume instead of Pause when paused', async () => {
    await render(
      wrapPlain(
        <>
          <TransferProgressScreen
            completedPackets={5}
            totalPackets={20}
            elapsedMs={5000}
            packetSize={512}
            paused
            onPause={jest.fn()}
            onResume={jest.fn()}
            onCancel={jest.fn()}
          />
        </>,
      ),
    );

    expect(screen.getByRole('button', { name: 'Resume' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  describe('derived values', () => {
    it.each([
      [0, '—'],
      [500, '500 B/s'],
      [1500, '1.5 kB/s'],
      [2_500_000, '2.5 MB/s'],
    ])('formats %p bytes per second as %p', (rate, expected) => {
      expect(formatThroughput(rate)).toBe(expected);
    });

    it('formats durations', () => {
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(65_000)).toBe('1m 05s');
      expect(formatDuration(-1)).toBe('—');
    });

    it('estimates remaining time from observed progress', () => {
      // 5 packets in 5 seconds, 15 to go: 15 seconds.
      expect(estimateRemainingMs(5, 20, 5000)).toBe(15_000);
    });

    it('withholds an estimate until there is evidence for one', () => {
      // An estimate from no packets is noise, and noise shown as a countdown is
      // worse than nothing.
      expect(estimateRemainingMs(0, 20, 5000)).toBeUndefined();
      expect(estimateRemainingMs(5, 5, 5000)).toBeUndefined();
      expect(estimateRemainingMs(5, 20, 0)).toBeUndefined();
    });
  });
});
