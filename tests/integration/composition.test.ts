/**
 * Composition root (ARC-001, ARC-005).
 *
 * Phase 1's exit criterion is that the architecture wires up and compiles
 * without any feature implementation. This suite is that criterion, executed.
 */
import { sessionId, transferId } from '@domain/index';
import { AppEvent } from '@events/index';
import { AppPhase, initialAppState } from '@state/index';
import { LogLevel, type LogRecord } from '@telemetry/index';
import { AppError, ErrorCode } from '@core/errors';
import {
  createAppContainer,
  defaultAppConfig,
  QRSpeedPreference,
  Theme,
  Tokens,
  withConfig,
} from '@config/index';

describe('createAppContainer', () => {
  it('wires the architecture with no feature code present', () => {
    const container = createAppContainer();

    expect(container.resolve(Tokens.Config)).toEqual(defaultAppConfig);
    expect(container.resolve(Tokens.EventBus)).toBeDefined();
    expect(container.resolve(Tokens.Logger)).toBeDefined();
    expect(container.resolve(Tokens.AppStore).getState()).toEqual(initialAppState);
    expect(container.resolve(Tokens.KeyValueStore)).toBeDefined();
  });

  it('accepts an overriding configuration', () => {
    const config = withConfig(defaultAppConfig, {
      theme: Theme.Dark,
      qrSpeed: QRSpeedPreference.Fast,
    });

    expect(createAppContainer({ config }).resolve(Tokens.Config)).toEqual(config);
  });

  it('rejects an invalid configuration at startup rather than at first use', () => {
    expect(() =>
      createAppContainer({
        config: { ...defaultAppConfig, theme: 'NEON' } as never,
      }),
    ).toThrow(AppError);
  });

  it('shares one instance of each singleton across the graph', () => {
    const container = createAppContainer();

    expect(container.resolve(Tokens.EventBus)).toBe(container.resolve(Tokens.EventBus));
    expect(container.resolve(Tokens.AppStore)).toBe(container.resolve(Tokens.AppStore));
  });

  it('fails loudly for an adapter that does not exist yet', () => {
    // FileStore is deliberately unregistered until its Phase 2 adapter lands:
    // a missing adapter must not silently resolve to something that drops data.
    try {
      createAppContainer().resolve(Tokens.FileStore);
      throw new Error('expected resolve to throw');
    } catch (error: unknown) {
      expect((error as AppError).code).toBe(ErrorCode.DEPENDENCY_NOT_REGISTERED);
    }
  });

  it('lets a test scope substitute an adapter without rebuilding the graph', () => {
    const container = createAppContainer();
    const scope = container.createScope();
    const store = { ...container.resolve(Tokens.KeyValueStore) };

    scope.registerValue(Tokens.KeyValueStore, store);

    expect(scope.resolve(Tokens.KeyValueStore)).toBe(store);
    expect(container.resolve(Tokens.KeyValueStore)).not.toBe(store);
  });

  it('routes a failing event subscriber to the logger instead of the caller', () => {
    const records: LogRecord[] = [];
    const container = createAppContainer({
      logLevel: LogLevel.Debug,
      logSinks: [(record) => records.push(record)],
    });

    const bus = container.resolve(Tokens.EventBus);
    bus.on(AppEvent.TransferFailed, () => {
      throw new Error('subscriber exploded');
    });

    expect(() =>
      bus.emit(AppEvent.TransferFailed, { transferId: transferId('t1'), code: 'TRANSFER_FAILED' }),
    ).not.toThrow();

    const logged = records.find((record) => record.message === 'Event subscriber failed');
    expect(logged?.scope).toBe('photon:events');
    expect(logged?.context?.['code']).toBe(ErrorCode.EVENT_HANDLER_FAILED);
  });

  it('is silent by default, so no log output escapes during tests', () => {
    const container = createAppContainer();
    expect(() => container.resolve(Tokens.Logger).error('should go nowhere')).not.toThrow();
  });

  describe('state and events together', () => {
    it('drives application state from an event without duplicating protocol state', () => {
      const container = createAppContainer();
      const bus = container.resolve(Tokens.EventBus);
      const store = container.resolve(Tokens.AppStore);

      // A controller would own this wiring; here it stands in for one.
      bus.on(AppEvent.TransferStarted, ({ transferId, sessionId }) => {
        store.setState((previous) => ({
          ...previous,
          phase: AppPhase.Transferring,
          activeTransferId: transferId,
          activeSessionId: sessionId,
        }));
      });

      bus.emit(AppEvent.TransferStarted, {
        transferId: transferId('t1'),
        sessionId: sessionId('s1'),
      });

      const state = store.getState();
      expect(state.phase).toBe(AppPhase.Transferring);
      // Identifiers only — the protocol engine still owns the objects.
      expect(state.activeTransferId).toBe('t1');
      expect(state.activeSessionId).toBe('s1');
    });
  });
});
