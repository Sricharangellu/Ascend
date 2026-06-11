import type { DomainEvent } from "./types.js";

type Handler = (event: DomainEvent) => void | Promise<void>;

/**
 * In-process event bus for the modular monolith. Modules publish domain events;
 * other modules (and the Sync outbox) subscribe. Handlers may be async (they
 * perform async Postgres writes), and `publish` awaits them in registration
 * order so cross-module effects (inventory decrement on order.created, outbox
 * enqueue on every event) complete — and surface errors — before publish
 * returns. In Year 2 this is replaced by Kafka; the contract stays identical.
 */
export class EventBus {
  private handlers: Handler[] = [];
  private byType = new Map<string, Handler[]>();

  /** Subscribe to all events. */
  onAny(handler: Handler): void {
    this.handlers.push(handler);
  }

  /** Subscribe to a specific event type, e.g. "order.created". */
  on(type: string, handler: Handler): void {
    const list = this.byType.get(type) ?? [];
    list.push(handler);
    this.byType.set(type, list);
  }

  /** Publish an event, awaiting all matching subscribers in registration order. */
  async publish<T>(type: string, payload: T, aggregateId?: string): Promise<DomainEvent<T>> {
    const event: DomainEvent<T> = {
      type,
      payload,
      aggregateId,
      occurredAt: new Date().toISOString(),
    };
    for (const h of this.byType.get(type) ?? []) await h(event);
    for (const h of this.handlers) await h(event);
    return event;
  }
}
