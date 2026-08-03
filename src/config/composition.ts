/**
 * Composition root (ARC-001, ARC-005).
 *
 * The one module permitted to name concrete implementations. Everything else
 * receives its collaborators (planning/DEPENDENCIES.md §8), which is why this
 * file may import from any layer while nothing imports it to do work.
 *
 * See ARCHITECTURE_GRAPH.md §3 for why that is not a layer violation.
 */
import { createEventBus } from '@events/eventBus';
import { initialAppState } from '@state/appState';
import { createStore } from '@state/store';
import { createMemoryKeyValueStore } from '@storage/memoryKeyValueStore';
import { createLogger, LogLevel } from '@telemetry/logger';

import { assertValidConfig, defaultAppConfig } from './appConfig';
import { createContainer } from './container';
import { Tokens } from './tokens';

import type { AppConfig } from './appConfig';
import type { Container } from './container';
import type { LogSink } from '@telemetry/logger';

export interface CompositionOptions {
  /** Starting configuration. Defaults to `defaultAppConfig`. */
  readonly config?: AppConfig;
  /** Log destinations. Defaults to none, which keeps tests silent. */
  readonly logSinks?: readonly LogSink[];
  readonly logLevel?: LogLevel;
}

/**
 * Builds the application object graph.
 *
 * Called once at startup, and once per test that needs a wired system.
 * Registrations are lazy: nothing is constructed until something resolves it.
 *
 * Platform adapters are not registered here yet. `KeyValueStore` defaults to
 * the in-memory implementation, and `FileStore` is deliberately absent until
 * the Phase 2 adapter exists — resolving it fails loudly rather than returning
 * a stub that silently loses data.
 */
export function createAppContainer(options: CompositionOptions = {}): Container {
  const config = options.config ?? defaultAppConfig;
  assertValidConfig(config);

  const container = createContainer();

  container.registerValue(Tokens.Config, config);

  container.register(Tokens.Logger, () =>
    createLogger('photon', {
      level: options.logLevel ?? LogLevel.Info,
      sinks: options.logSinks ?? [],
    }),
  );

  container.register(Tokens.EventBus, (c) => {
    const logger = c.resolve(Tokens.Logger).child('events');
    return createEventBus({
      onSubscriberError: (error, event) => {
        logger.error('Event subscriber failed', { event, code: error.code });
      },
    });
  });

  container.register(Tokens.AppStore, () => createStore(initialAppState));

  container.register(Tokens.KeyValueStore, () => createMemoryKeyValueStore());

  return container;
}
