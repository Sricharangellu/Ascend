import type { PosModule } from "../types.js";
import { CustomersService } from "./service.js";
import { registerRoutes } from "./routes.js";

const CREATE_CUSTOMERS_TABLE = `
CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  points      BIGINT NOT NULL DEFAULT 0,
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);
`;

const CREATE_CUSTOMERS_INDEXES = `
CREATE INDEX IF NOT EXISTS customers_tenant_created_idx ON customers (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_tenant_email_idx ON customers (tenant_id, email);
`;

/**
 * Customers + loyalty. Tenant-scoped. Reacts to `payment.captured`: looks up the
 * paid order's customer and awards loyalty points ($1 net spent = 1 point).
 * Net spent = amountCents − changeCents (i.e. the order total, change excluded).
 */
export const customersModule: PosModule = {
  name: "customers",
  migrations: [CREATE_CUSTOMERS_TABLE, CREATE_CUSTOMERS_INDEXES],
  async register({ db, events, router }) {
    const service = new CustomersService(db, events);

    events.on("payment.captured", async (event) => {
      const p = event.payload as {
        tenantId?: string;
        orderId?: string;
        amountCents?: number;
        changeCents?: number;
      };
      const tenantId = p.tenantId ?? "";
      const orderId = p.orderId ?? "";
      if (!tenantId || !orderId) return;
      const customerId = await service.customerForOrder(orderId, tenantId);
      if (!customerId) return; // walk-in / no loyalty account
      const netSpent = (p.amountCents ?? 0) - (p.changeCents ?? 0);
      const points = Math.floor(netSpent / 100);
      await service.awardPoints(customerId, points, tenantId);
    });

    registerRoutes(router, service);
  },
};

export { CustomersService } from "./service.js";
export type { Customer, CreateCustomerInput } from "./service.js";
