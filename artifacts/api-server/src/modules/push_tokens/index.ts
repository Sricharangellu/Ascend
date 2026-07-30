import type { PosModule } from "../types.js";
import { PushTokensService } from "./service.js";
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

export const pushTokensModule: PosModule = {
  name: "push-tokens",
  migrations: [CREATE_TABLE, CREATE_INDEXES],
  async register({ db, events, router }) {
    const service = new PushTokensService(db);

    // When an order is created (always "open" status), send a push notification
    // to all registered devices for that tenant.
    events.on("order.created", async (event) => {
      const p = event.payload as {
        tenantId?: string;
        id?: string;
        orderNumber?: string;
        totalCents?: number;
      };
      if (!p.tenantId) return;

      const total = typeof p.totalCents === "number"
        ? `$${(p.totalCents / 100).toFixed(2)}`
        : "";

      await service
        .sendToTenant(p.tenantId, {
          title: "New Order",
          body: total
            ? `Order #${p.orderNumber} · ${total}`
            : `Order #${p.orderNumber} has been placed`,
          data: {
            screen: "orders",
            orderId: p.id ?? "",
            orderNumber: p.orderNumber ?? "",
          },
        })
        .catch(() => {
          // Never let push delivery errors surface to the caller
        });
    });

    registerRoutes(router, service);
  },
};
