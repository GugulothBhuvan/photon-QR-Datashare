/**
 * Shared components (UI_SPEC §6, §7, §9, §10, §14, §15).
 *
 * These assert the specification's requirements, not appearance. A test that
 * pinned colours would break on every design change while catching nothing that
 * matters; a test that asserts a button is never below the minimum touch target
 * catches a real accessibility regression.
 */
import { render, screen, userEvent } from '@testing-library/react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListItem,
  LoadingState,
  ProgressBar,
  ProgressRing,
  Text,
  ThemeProvider,
} from '@components/index';
import { DarkColors, LightColors, MIN_TOUCH_TARGET, colorsFor } from '@constants/tokens';

describe('theme resolution (§12)', () => {
  it.each([
    ['LIGHT', false, LightColors],
    ['LIGHT', true, LightColors],
    ['DARK', false, DarkColors],
    ['DARK', true, DarkColors],
    ['SYSTEM', false, LightColors],
    ['SYSTEM', true, DarkColors],
  ] as const)('%s with systemIsDark=%p resolves correctly', (setting, systemIsDark, expected) => {
    expect(colorsFor(setting, systemIsDark)).toBe(expected);
  });

  it('keeps QR colours identical across themes — a dark QR code does not scan', () => {
    expect(LightColors.qrForeground).toBe(DarkColors.qrForeground);
    expect(LightColors.qrBackground).toBe(DarkColors.qrBackground);
    expect(DarkColors.qrForeground).toBe('#000000');
  });
});

describe('Button (§2, §6, §8, §9)', () => {
  it('renders its label', async () => {
    await render(<Button label="Send files" />);

    expect(screen.getByText('Send files')).toBeOnTheScreen();
  });

  it('is announced as a button with its label (§10)', async () => {
    await render(<Button label="Start transfer" />);

    expect(screen.getByRole('button', { name: 'Start transfer' })).toBeOnTheScreen();
  });

  it('never falls below the minimum touch target (§2, §8)', async () => {
    await render(<Button label="Tap" />);

    const style = screen.getByRole('button').props['style'];
    const flattened = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;

    expect(flattened.minHeight).toBe(MIN_TOUCH_TARGET);
  });

  it('calls its handler when pressed', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<Button label="Go" onPress={onPress} />);

    await user.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call its handler when disabled', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<Button label="Go" onPress={onPress} disabled />);

    await user.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports its disabled state to assistive technology (§10)', async () => {
    await render(<Button label="Go" disabled />);

    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('Progress (§6, §10)', () => {
  it('announces the percentage rather than relying on the fill (§10)', async () => {
    await render(<ProgressBar value={0.42} label="Transfer progress" />);

    const bar = screen.getByRole('progressbar', { name: 'Transfer progress' });

    expect(bar.props['accessibilityValue']).toEqual({ min: 0, max: 100, now: 42 });
  });

  it.each([
    [-1, 0],
    [0, 0],
    [0.5, 50],
    [1, 100],
    [2, 100],
    [Number.NaN, 0],
  ])('clamps %p to %p percent', async (value, expected) => {
    await render(<ProgressBar value={value} />);

    expect(screen.getByRole('progressbar').props['accessibilityValue'].now).toBe(expected);
  });

  it('renders a ring with the same clamping', async () => {
    await render(<ProgressRing value={0.75} label="Packets" />);

    expect(
      screen.getByRole('progressbar', { name: 'Packets' }).props['accessibilityValue'].now,
    ).toBe(75);
    expect(screen.getByText('75%')).toBeOnTheScreen();
  });
});

describe('screen states (§7, §14, §15, §16)', () => {
  it('a loading state says what is loading (§16)', async () => {
    await render(<LoadingState message="Starting camera…" />);

    expect(screen.getByText('Starting camera…')).toBeOnTheScreen();
  });

  it('an empty state explains and may offer an action (§15)', async () => {
    const onAction = jest.fn();
    const user = userEvent.setup();

    await render(
      <EmptyState
        title="No transfers yet"
        description="Your completed transfers will appear here."
        actionLabel="Send something"
        onAction={onAction}
      />,
    );

    expect(screen.getByText('No transfers yet')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Send something' }));
    expect(onAction).toHaveBeenCalled();
  });

  it('an error state carries a title, an explanation and a recovery action (§14)', async () => {
    const onAction = jest.fn();
    const user = userEvent.setup();

    await render(
      <ErrorState
        title="Camera access required"
        description="Allow camera permission to receive files."
        actionLabel="Grant permission"
        onAction={onAction}
      />,
    );

    // §14's own worked example.
    expect(screen.getByText('Camera access required')).toBeOnTheScreen();
    expect(screen.getByText('Allow camera permission to receive files.')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Grant permission' }));
    expect(onAction).toHaveBeenCalled();
  });

  it('an error state is announced as an alert (§10)', async () => {
    await render(
      <ErrorState
        title="Failed"
        description="Something went wrong."
        actionLabel="Retry"
        onAction={jest.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });
});

describe('ListItem (§6)', () => {
  it('renders title, subtitle and trailing text', async () => {
    await render(<ListItem title="holiday.jpg" subtitle="2048 bytes" trailing="Remove" />);

    expect(screen.getByText('holiday.jpg')).toBeOnTheScreen();
    expect(screen.getByText('2048 bytes')).toBeOnTheScreen();
    expect(screen.getByText('Remove')).toBeOnTheScreen();
  });

  it('is not a button when it has no action', async () => {
    await render(<ListItem title="Protocol version" trailing="1" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is a button when it does', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<ListItem title="Open" onPress={onPress} />);

    await user.press(screen.getByRole('button', { name: 'Open' }));

    expect(onPress).toHaveBeenCalled();
  });
});

describe('composition', () => {
  it('renders inside a theme provider without a provider being required elsewhere', async () => {
    await render(
      <ThemeProvider setting="DARK">
        <Card>
          <Text variant="heading">Grouped</Text>
        </Card>
      </ThemeProvider>,
    );

    expect(screen.getByText('Grouped')).toBeOnTheScreen();
  });
});
