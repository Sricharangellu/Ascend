import type { Redis } from "./redis.js";
import type { DomainEvent } from "./types.js";

type Handler = (event: DomainEvent) => void | Promise<void>;

const REDIS_CHANNEL = "finder:events";

/**
 * Event bus for the modular monolith.
 *
 * Default mode (no Redis): in-process pub/sub — all modules on the same
 * instance communicate synchronously. Handlers are awaited in registration
 * order so cross-module effects (inventory decrement, outbox enqueue) complete
 * before publish() returns.
 *
 * Redis mode (call useRedis() at startup): adds a Pub/Sub fan-out layer.
 * Events published on any instance are broadcast to the "finder:events"
 * Redis channel; every other instance receives them and dispatches to its
 * local subscribers. Solves the multi-instance SSE and dunning-sweep problems.
 * Falls back silently to local-only if Redis publish fails.
 */
export class EventBus {
  private readonly handlers: Handler[] = [];
  private readonly byType = new Map<string, Handler[]>();
  private readonly _id = Math.random().toString(36).slice(2, 10);
  private _pub: Redis | null = null;

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

  /** Dispatch to local subscribers only — used by publish() and by the Redis bridge. */
  private async _dispatch<T>(event: DomainEvent<T>): Promise<void> {
    for (const h of this.byType.get(event.type) ?? []) await h(event);
    for (const h of this.handlers) await h(event);
  }

  /**
   * Publish an event.
   * - Always dispatches to local subscribers immediately.
   * - If Redis is wired up, also broadcasts to the shared channel so other
   *   instances receive and re-dispatch the event to their own subscribers.
   */
  async publish<T>(type: string, payload: T, aggregateId?: string): Promise<DomainEvent<T>> {
    const event: DomainEvent<T> = {
      type,
      payload,
      aggregateId,
      occurredAt: new Date().toISOString(),
    };
    await this._dispatch(event);
    if (this._pub) {
      try {
        await this._pub.publish(
          REDIS_CHANNEL,
          JSON.stringify({ ...event, _origin: this._id }),
        );
      } catch {
        // Redis publish failure is non-fatal: local handlers already ran.
      }
    }
    return event;
  }

  /**
   * Wire Redis Pub/Sub fan-out. Call once at startup when REDIS_URL is set.
   *
   * Creates a dedicated subscriber connection (ioredis subscriber mode cannot
   * share a connection with regular commands). Incoming messages from other
   * instances are dispatched to local subscribers; messages from this instance
   * are skipped to prevent double-dispatch.
   *
   * Returns an async cleanup function — call it on graceful shutdown.
   */
  async useRedis(redis: Redis): Promise<() => Promise<void>> {
    this._pub = redis;
    const sub = redis.duplicate();

    await sub.subscribe(REDIS_CHANNEL);

    const selfId = this._id;
    const dispatch = this._dispatch.bind(this);

    sub.on("message", (_channel: string, msg: string) => {
      void (async () => {
        try {
          const parsed = JSON.parse(msg) as DomainEvent & { _origin?: string };
          if (parsed._origin === selfId) return; // own broadcast — skip
          await dispatch(parsed);
        } catch {
          // malformed message — ignore
        }
      })();
    });

    return async () => {
      try {
        await sub.unsubscribe(REDIS_CHANNEL);
        sub.disconnect();
      } catch {
        // ignore cleanup errors on shutdown
      }
    };
  }
}
