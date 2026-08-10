/**
 * controllers/ — Controller layer
 *
 * Coordination between UI intent and services. Sequences calls and maps
 * results onto state; contains no business rules.
 *
 * Purpose, ownership, dependency rules and public exports: see ./README.md.
 * Interfaces are defined by docs/API_SPEC.md.
 */

export {
  createSendController,
  DEFAULT_PACKET_SIZE,
  initialSendState,
  SendStage,
  type SendController,
  type SendControllerOptions,
  type SendState,
} from './sendController';

export {
  createReceiveController,
  initialReceiveState,
  ReceiveStage,
  type ReceiveController,
  type ReceiveControllerOptions,
  type ReceiveState,
} from './receiveController';

export {
  createSettingsController,
  type SettingsController,
  type SettingsControllerOptions,
  type SettingsState,
} from './settingsController';
