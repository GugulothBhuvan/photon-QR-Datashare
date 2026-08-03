/**
 * Verifies the Expo Router entry point renders. This is a build-integrity
 * check for Phase 0, not a UI acceptance test (see docs/UI_SPEC.md and
 * Phase 8 for those).
 */
import { render, screen } from '@testing-library/react-native';

import IndexRoute from '../../app/index';

describe('router entry', () => {
  it('renders the index route', async () => {
    await render(<IndexRoute />);
    expect(screen.getByText('photon')).toBeOnTheScreen();
  });
});
