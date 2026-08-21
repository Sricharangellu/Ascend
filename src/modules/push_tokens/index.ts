import type { PosModule } from "../types.js";
import { PushTokensService } from "./service.js";
import { OrderNotificationBatcher } from "./batcher.js";
import { registerRoutes } from "./routes.js";

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS push_tokens (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT 'ios',
  created_at  BIGINT NOT NULL,
  UNIQUE (tenant_id, token)
);
`;

const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS push_tokens_tenant_idx ON push_tokens (tenant_id);
`;

const CREATE_QUIET_HOURS_TABLE = `
CREATE TABLE IF NOT EXISTS push_quiet_hours (
  tenant_id   TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  start_time  TEXT NOT NULL DEFAULT '22:00',
  end_time    TEXT NOT NULL DEFAULT '07:00',
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  updated_at  BIGINT NOT NULL
);
`;

export const pushTokensModule: PosModule = {
  name: "push-tokens",
  migrations: [CREATE_TABLE, CREATE_INDEXES, CREATE_QUIET_HOURS_TABLE],
  async register({ db, events, router }) {
    const service = new PushTokensService(db);

    // When an order is created (always "open" status), notify all registered
    // devices for that tenant. Orders are held briefly by the batcher so a
    // rapid-fire burst (e.g. a lunch rush) collapses into a single
    // "N New Orders · $X total" notification; a lone order during a quiet
    // period is delivered as a normal single-order alert once its window
    // closes.
    const batcher = new OrderNotificationBatcher(async (tenantId, notification) => {
      try {
        // Quiet hours: check at dispatch time (after the batch window closes),
        // so an order created seconds before the window opens is still
        // suppressed if delivery would land inside it.
        if (await service.isQuietNow(tenantId)) return;
        await service.sendToTenant(tenantId, notification);
      } catch {
        // Never let push delivery errors surface to the caller
      }
    });

    events.on("order.created", async (event) => {
      const p = event.payload as {
        tenantId?: string;
        id?: string;
        orderNumber?: string;
        totalCents?: number;
      };
      if (!p.tenantId) return;

      // Multi-instance dedup: events bridged from another instance via the
      // Redis fan-out carry an `_origin` marker (see EventBus.useRedis).
      // Only the instance that originated the order batches and sends its
      // push notification, so tenants get exactly one grouped alert even
      // when horizontally deployed.
      if ((event as { _origin?: string })._origin) return;

      batcher.add(p.tenantId, {
        orderId: p.id ?? "",
        orderNumber: p.orderNumber ?? "",
        totalCents: typeof p.totalCents === "number" ? p.totalCents : null,
        receivedAt: Date.now(),
      });
    });

    registerRoutes(router, service);
  },
};
