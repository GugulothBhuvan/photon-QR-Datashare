/**
 * screens/ — UI layer
 *
 * Screen-level composition rendered by the Expo Router routes in app/.
 *
 * Purpose, ownership, dependency rules and public exports: see ./README.md.
 * Screens are defined by docs/UI_SPEC.md §5.
 */

export { AboutScreen, LICENSES, type AboutScreenProps } from './AboutScreen';
export {
  HistoryScreen,
  filterHistory,
  type HistoryEntry,
  type HistoryFilter,
  type HistoryScreenProps,
} from './HistoryScreen';
export { HomeScreen, type HomeScreenProps, type RecentTransfer } from './HomeScreen';
export { ReceiveScreen, type ReceivedFile, type ReceiveScreenProps } from './ReceiveScreen';
export { SendScreen, type SendScreenProps } from './SendScreen';
export { SettingsScreen, type SettingsScreenProps } from './SettingsScreen';
export {
  TransferProgressScreen,
  estimateRemainingMs,
  formatDuration,
  formatThroughput,
  type TransferProgressScreenProps,
} from './TransferProgressScreen';
