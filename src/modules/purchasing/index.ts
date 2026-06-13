import type { PosModule } from "../types.js";
import { PurchasingService } from "./service.js";
import { registerRoutes } from "./routes.js";

const CREATE_SUPPLIERS = `
CREATE TABLE IF NOT EXISTS suppliers (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  email      TEXT,
  created_at BIGINT NOT NULL
);`;

const CREATE_PURCHASE_ORDERS = `
CREATE TABLE IF NOT EXISTS purchase_orders (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  supplier_id      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ordered',
  total_cost_cents BIGINT NOT NULL DEFAULT 0,
  created_at       BIGINT NOT NULL,
  received_at      BIGINT
);`;

const CREATE_PO_LINES = `
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  po_id           TEXT NOT NULL,
  product_id      TEXT NOT NULL,
  quantity        INTEGER NOT NULL,
  unit_cost_cents BIGINT NOT NULL,
  line_cost_cents BIGINT NOT NULL
);`;

const CREATE_PRODUCT_COSTS = `
CREATE TABLE IF NOT EXISTS product_costs (
  tenant_id  TEXT NOT NULL,
  product_id TEXT NOT NULL,
  cost_cents BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, product_id)
);`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS po_tenant_status_idx ON purchase_orders (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pol_tenant_po_idx ON purchase_order_lines (tenant_id, po_id);
CREATE INDEX IF NOT EXISTS suppliers_tenant_idx ON suppliers (tenant_id, created_at DESC);`;

/** Purchasing — suppliers, purchase orders, receiving. Receiving emits
 *  `purchase_order.received`; inventory listens and increments stock. */
export const purchasingModule: PosModule = {
  name: "purchasing",
  migrations: [CREATE_SUPPLIERS, CREATE_PURCHASE_ORDERS, CREATE_PO_LINES, CREATE_PRODUCT_COSTS, INDEXES],
  async register({ db, events, router }) {
    const service = new PurchasingService(db, events);
    registerRoutes(router, service);
  },
};

export { PurchasingService } from "./service.js";
export type { Supplier, PurchaseOrder, PurchaseOrderWithLines } from "./service.js";
