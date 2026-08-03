/**
 * Injection tokens.
 *
 * One place where every injectable dependency is named. Tokens are declared
 * separately from the composition root so a consumer can depend on the *name*
 * of a dependency without importing the module that constructs it — which is
 * what keeps the graph acyclic.
 */
import { createToken } from './container';

import type { AppConfig } from './appConfig';
import type { EventBus } from '@events/eventBus';
import type { AppState } from '@state/appState';
import type { Store } from '@state/store';
import type { FileStore, KeyValueStore } from '@storage/ports';
import type { Logger } from '@telemetry/logger';

export const Tokens = {
  Config: createToken<AppConfig>('AppConfig'),
  EventBus: createToken<EventBus>('EventBus'),
  Logger: createToken<Logger>('Logger'),
  AppStore: createToken<Store<AppState>>('AppStore'),
  KeyValueStore: createToken<KeyValueStore>('KeyValueStore'),
  FileStore: createToken<FileStore>('FileStore'),
} as const;
