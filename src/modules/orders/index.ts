import type { PosModule, ModuleContext } from "../types.js";
import { OrdersService } from "./service.js";
import { registerRoutes } from "./routes.js";

const CREATE_ORDERS_TABLE = `
CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  order_number   TEXT NOT NULL,
  state_code     TEXT NOT NULL,
  status         TEXT NOT NULL,
  subtotal_cents BIGINT NOT NULL,
  discount_cents BIGINT NOT NULL DEFAULT 0,
  tax_cents      BIGINT NOT NULL,
  total_cents    BIGINT NOT NULL,
  customer_id    TEXT,
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL
);
`;

const CREATE_ORDER_LINES_TABLE = `
CREATE TABLE IF NOT EXISTS order_lines (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL,
  product_id   TEXT NOT NULL,
  name         TEXT NOT NULL,
  quantity     INTEGER NOT NULL,
  unit_cents   BIGINT NOT NULL,
  tax_cents    BIGINT NOT NULL,
  line_cents   BIGINT NOT NULL,
  taxable      INTEGER NOT NULL
);
`;

export const ordersModule: PosModule = {
  name: "orders",
  migrations: [CREATE_ORDERS_TABLE, CREATE_ORDER_LINES_TABLE],
  register(ctx: ModuleContext): void {
    const service = new OrdersService(ctx.db, ctx.events);
    registerRoutes(ctx.router, service);

    // A captured payment completes the order it was made against.
    ctx.events.on("payment.captured", async (event) => {
      const payload = event.payload as { orderId?: string };
      const orderId = payload.orderId ?? event.aggregateId;
      if (orderId) await service.markCompleted(orderId);
    });
  },
};

export { OrdersService } from "./service.js";
export type {
  OrderRow,
  OrderLineRow,
  OrderWithLines,
  OrderStatus,
  CreateOrderInput,
  CreateOrderLineInput,
  ListOrdersQuery,
} from "./service.js";
export {
  computeOrderTax,
  rateFor,
  STATE_TAX_RATES,
  type TaxableLine,
  type OrderTax,
  type LineTax,
} from "./tax.js";
