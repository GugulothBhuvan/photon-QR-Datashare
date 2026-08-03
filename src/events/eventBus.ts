/**
 * Typed event bus (ARC-002).
 *
 * Implements docs/API_SPEC.md §11 and docs/ARCHITECTURE.md §6.9: events are
 * immutable, and they coordinate communication between layers
 * (docs/ARCHITECTURE.md §6.14.7) without those layers importing one another.
 *
 * Delivery is synchronous and ordered — subscribers run in subscription order,
 * within the publishing call. That keeps behaviour deterministic
 * (docs/API_SPEC.md §2), which asynchronous delivery would not.
 */
import { AppError, ErrorCode } from '@core/errors';

import type { AppEventMap } from './eventTypes';

export type EventHandler<TPayload> = (payload: Readonly<TPayload>) => void;

/** Removes the subscription it came from. Calling it twice is a no-op. */
export type Unsubscribe = () => void;

/**
 * Reports a subscriber that threw.
 *
 * One failing subscriber must not prevent the others from receiving the event,
 * so throws are captured and reported here instead of propagating.
 */
export type SubscriberErrorHandler = (error: AppError, event: keyof AppEventMap) => void;

export interface EventBus {
  /** Subscribes to an event. Returns the unsubscribe function. */
  on<TEvent extends keyof AppEventMap>(
    event: TEvent,
    handler: EventHandler<AppEventMap[TEvent]>,
  ): Unsubscribe;

  /** Subscribes for a single delivery, then unsubscribes automatically. */
  once<TEvent extends keyof AppEventMap>(
    event: TEvent,
    handler: EventHandler<AppEventMap[TEvent]>,
  ): Unsubscribe;

  /** Publishes an event to every current subscriber, in subscription order. */
  emit<TEvent extends keyof AppEventMap>(event: TEvent, payload: AppEventMap[TEvent]): void;

  /** Number of active subscribers for an event. Intended for tests. */
  listenerCount(event: keyof AppEventMap): number;

  /** Removes all subscribers. Used when tearing down a session or a test. */
  clear(): void;
}

export interface EventBusOptions {
  /** Invoked when a subscriber throws. Defaults to swallowing the error. */
  readonly onSubscriberError?: SubscriberErrorHandler;
}

type HandlerSet = Set<EventHandler<never>>;

/**
 * Creates an event bus.
 *
 * Constructed in the composition root and injected; modules never reach for a
 * shared global (planning/DEPENDENCIES.md §8).
 */
export function createEventBus(options: EventBusOptions = {}): EventBus {
  const handlers = new Map<keyof AppEventMap, HandlerSet>();
  const { onSubscriberError } = options;

  function subscribe<TEvent extends keyof AppEventMap>(
    event: TEvent,
    handler: EventHandler<AppEventMap[TEvent]>,
  ): Unsubscribe {
    const existing = handlers.get(event);
    const set: HandlerSet = existing ?? new Set();

    if (existing === undefined) {
      handlers.set(event, set);
    }

    set.add(handler as EventHandler<never>);

    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      set.delete(handler as EventHandler<never>);
      if (set.size === 0) {
        handlers.delete(event);
      }
    };
  }

  return {
    on: subscribe,

    once(event, handler) {
      const unsubscribe = subscribe(event, (payload) => {
        unsubscribe();
        handler(payload);
      });
      return unsubscribe;
    },

    emit(event, payload) {
      const set = handlers.get(event);
      if (set === undefined || set.size === 0) {
        return;
      }

      // Freeze so a subscriber cannot mutate a payload another subscriber has
      // yet to receive (docs/API_SPEC.md §11: events remain immutable).
      const frozen = Object.freeze(payload);

      // Iterate a snapshot: subscribing or unsubscribing during delivery must
      // not affect who receives this event.
      for (const handler of [...set]) {
        try {
          (handler as EventHandler<AppEventMap[typeof event]>)(frozen);
        } catch (error: unknown) {
          onSubscriberError?.(
            AppError.wrap(error, ErrorCode.EVENT_HANDLER_FAILED, {
              details: { event },
            }),
            event,
          );
        }
      }
    },

    listenerCount(event) {
      return handlers.get(event)?.size ?? 0;
    },

    clear() {
      handlers.clear();
    },
  };
}
