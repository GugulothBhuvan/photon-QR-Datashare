/**
 * Event bus (ARC-002) — docs/API_SPEC.md §11, docs/ARCHITECTURE.md §6.9.
 */
import { AppEvent, createEventBus } from '@events/index';

describe('createEventBus', () => {
  it('delivers a payload to subscribers of that event only', () => {
    const bus = createEventBus();
    const started = jest.fn();
    const completed = jest.fn();

    bus.on(AppEvent.TransferStarted, started);
    bus.on(AppEvent.TransferCompleted, completed);

    bus.emit(AppEvent.TransferStarted, { transferId: 't1', sessionId: 's1' });

    expect(started).toHaveBeenCalledWith({ transferId: 't1', sessionId: 's1' });
    expect(completed).not.toHaveBeenCalled();
  });

  it('delivers in subscription order', () => {
    const bus = createEventBus();
    const order: string[] = [];

    bus.on(AppEvent.SessionCreated, () => order.push('first'));
    bus.on(AppEvent.SessionCreated, () => order.push('second'));
    bus.on(AppEvent.SessionCreated, () => order.push('third'));

    bus.emit(AppEvent.SessionCreated, { sessionId: 's1' });

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('freezes the payload so one subscriber cannot mutate it for another', () => {
    const bus = createEventBus();
    const frozen: boolean[] = [];
    let seen: { sequence: number } | undefined;

    bus.on(AppEvent.PacketGenerated, (payload) => {
      frozen.push(Object.isFrozen(payload));
      // Fails silently under a non-strict runtime; the assertion below is that
      // the next subscriber is unaffected either way.
      (payload as { sequence: number }).sequence = 999;
    });
    bus.on(AppEvent.PacketGenerated, (payload) => {
      seen = payload;
    });

    bus.emit(AppEvent.PacketGenerated, { sessionId: 's1', sequence: 7 });

    // Assertions live outside the subscribers: the bus isolates subscriber
    // throws, so a failure raised inside one would be swallowed.
    expect(frozen).toEqual([true]);
    expect(seen?.sequence).toBe(7);
  });

  it('stops delivering after unsubscribe, and tolerates a second call', () => {
    const bus = createEventBus();
    const handler = jest.fn();

    const unsubscribe = bus.on(AppEvent.TransferPaused, handler);
    bus.emit(AppEvent.TransferPaused, { transferId: 't1' });

    unsubscribe();
    unsubscribe();
    bus.emit(AppEvent.TransferPaused, { transferId: 't1' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount(AppEvent.TransferPaused)).toBe(0);
  });

  it('delivers a `once` subscription exactly once', () => {
    const bus = createEventBus();
    const handler = jest.fn();

    bus.once(AppEvent.TransferCompleted, handler);
    bus.emit(AppEvent.TransferCompleted, { transferId: 't1' });
    bus.emit(AppEvent.TransferCompleted, { transferId: 't1' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount(AppEvent.TransferCompleted)).toBe(0);
  });

  it('does not let a subscriber added during delivery receive the current event', () => {
    const bus = createEventBus();
    const late = jest.fn();

    bus.on(AppEvent.SessionCreated, () => {
      bus.on(AppEvent.SessionCreated, late);
    });

    bus.emit(AppEvent.SessionCreated, { sessionId: 's1' });
    expect(late).not.toHaveBeenCalled();

    bus.emit(AppEvent.SessionCreated, { sessionId: 's2' });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing subscriber and reports it', () => {
    const onSubscriberError = jest.fn();
    const bus = createEventBus({ onSubscriberError });
    const survivor = jest.fn();

    bus.on(AppEvent.TransferFailed, () => {
      throw new Error('subscriber exploded');
    });
    bus.on(AppEvent.TransferFailed, survivor);

    expect(() => {
      bus.emit(AppEvent.TransferFailed, { transferId: 't1', code: 'TRANSFER_FAILED' });
    }).not.toThrow();

    expect(survivor).toHaveBeenCalledTimes(1);
    expect(onSubscriberError).toHaveBeenCalledTimes(1);
    expect(onSubscriberError.mock.calls[0]?.[1]).toBe(AppEvent.TransferFailed);
  });

  it('emitting with no subscribers is a no-op', () => {
    const bus = createEventBus();
    expect(() => bus.emit(AppEvent.SessionExpired, { sessionId: 's1' })).not.toThrow();
  });

  it('clear removes every subscription', () => {
    const bus = createEventBus();
    const handler = jest.fn();

    bus.on(AppEvent.SessionCreated, handler);
    bus.clear();
    bus.emit(AppEvent.SessionCreated, { sessionId: 's1' });

    expect(handler).not.toHaveBeenCalled();
  });
});
