import type { PosModule } from "../types.js";
import { InventoryService } from "./service.js";
import { registerRoutes } from "./routes.js";

const CREATE_INVENTORY_TABLE = `
CREATE TABLE IF NOT EXISTS inventory (
  product_id  TEXT PRIMARY KEY,
  stock_qty   INTEGER NOT NULL DEFAULT 0,
  reorder_pt  INTEGER NOT NULL DEFAULT 0,
  updated_at  BIGINT NOT NULL
);
`;

const CREATE_MOVEMENTS_TABLE = `
CREATE TABLE IF NOT EXISTS inventory_movements (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL,
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  ref         TEXT,
  created_at  BIGINT NOT NULL
);
`;

interface OrderCreatedPayload {
  id?: string;
  orderNumber?: string;
  stateCode?: string;
  totalCents?: number;
  lines?: Array<{ productId: string; quantity: number; unitCents: number }>;
}

interface OrderRefundedPayload {
  id?: string;
  orderNumber?: string;
  totalCents?: number;
}

export const inventoryModule: PosModule = {
  name: "inventory",
  migrations: [CREATE_INVENTORY_TABLE, CREATE_MOVEMENTS_TABLE],
  register({ db, events, router }) {
    const service = new InventoryService(db, events);
    registerRoutes(router, service);

    // order.created -> decrement stock for each line (reason 'sale', ref = order id).
    events.on("order.created", async (event) => {
      const payload = event.payload as OrderCreatedPayload;
      const orderId = payload.id ?? event.aggregateId;
      const lines = payload.lines ?? [];
      for (const line of lines) {
        await service.adjust(line.productId, -line.quantity, "sale", orderId);
      }
    });

    // order.refunded -> restock by reversing the recorded 'sale' movements.
    events.on("order.refunded", async (event) => {
      const payload = event.payload as OrderRefundedPayload;
      const orderId = payload.id ?? event.aggregateId;
      if (orderId) await service.restockFromOrderRef(orderId);
    });
  },
};

export { InventoryService } from "./service.js";
export type {
  InventoryRow,
  MovementRow,
  MovementReason,
  ListInventoryQuery,
} from "./service.js";
