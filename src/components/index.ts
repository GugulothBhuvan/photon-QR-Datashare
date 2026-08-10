/**
 * components/ — UI layer
 *
 * Reusable presentational components. Render UI, display state, dispatch
 * actions — nothing else (AGENTS.md §8).
 *
 * Purpose, ownership, dependency rules and public exports: see ./README.md.
 * Screens are defined by docs/UI_SPEC.md.
 */

export { Button, type ButtonProps, type ButtonVariant } from './Button';
export { Card, type CardProps } from './Card';
export { ListItem, type ListItemProps } from './ListItem';
export { ProgressBar, ProgressRing, type ProgressProps } from './Progress';
export { QrDisplay, type QrDisplayProps } from './QrDisplay';
export { Screen, type ScreenProps } from './Screen';

export {
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenStatus,
  type EmptyStateProps,
  type ErrorStateProps,
  type LoadingStateProps,
} from './ScreenState';

export { Text, type TextProps } from './Text';
export { ThemeProvider, useTheme, type Theme, type ThemeSetting } from './ThemeProvider';
