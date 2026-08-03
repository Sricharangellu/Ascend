import type { PosModule } from "../types.js";
import { WebhooksService } from "./service.js";
import { registerRoutes } from "./routes.js";

const CREATE_SUBSCRIPTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  url         TEXT NOT NULL,
  event_types TEXT NOT NULL DEFAULT '*',
  secret      TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);
`;

const CREATE_DELIVERIES_TABLE = `
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  status          TEXT NOT NULL,
  status_code     INTEGER NOT NULL DEFAULT 0,
  created_at      BIGINT NOT NULL
);
`;

const ADD_DELIVERY_RETRY_COLUMNS = `
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS last_response_body TEXT;
`;

const CREATE_WEBHOOK_INDEXES = `
CREATE INDEX IF NOT EXISTS webhook_subs_tenant_idx ON webhook_subscriptions (tenant_id, active);
CREATE INDEX IF NOT EXISTS webhook_deliveries_tenant_idx ON webhook_deliveries (tenant_id, created_at DESC);
`;

/**
 * Webhooks (public API). Tenant-scoped subscriptions receive HMAC-signed POSTs
 * when subscribed domain events fire. Delivery is best-effort and fire-and-forget
 * so it never blocks (or fails) the request that produced the event.
 */
export const webhooksModule: PosModule = {
  name: "webhooks",
  migrations: [CREATE_SUBSCRIPTIONS_TABLE, CREATE_DELIVERIES_TABLE, CREATE_WEBHOOK_INDEXES, ADD_DELIVERY_RETRY_COLUMNS],
  async register({ db, events, router }) {
    const service = new WebhooksService(db);
    // Best-effort fan-out on every event; never await (would block publishers).
    events.onAny((event) => {
      void service.deliverForEvent(event).catch(() => {});
    });
    registerRoutes(router, service);
  },
};

export { WebhooksService, signPayload } from "./service.js";
export type { WebhookSubscription } from "./service.js";
