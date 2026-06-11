import type { PosModule, ModuleContext } from "../types.js";
import { PaymentsService } from "./service.js";
import { registerRoutes } from "./routes.js";

const MIGRATION = `
CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL,
  method        TEXT NOT NULL,
  amount_cents  BIGINT NOT NULL,
  cash_cents    BIGINT NOT NULL DEFAULT 0,
  card_cents    BIGINT NOT NULL DEFAULT 0,
  change_cents  BIGINT NOT NULL DEFAULT 0,
  card_last4    TEXT,
  auth_code     TEXT,
  status        TEXT NOT NULL,
  created_at    BIGINT NOT NULL
);
`;

export const paymentsModule: PosModule = {
  name: "payments",
  migrations: [MIGRATION],
  register(ctx: ModuleContext): void {
    const service = new PaymentsService(ctx.db, ctx.events);
    registerRoutes(ctx.router, service);
  },
};

export { PaymentsService } from "./service.js";
export type {
  PaymentRecord,
  PaymentMethod,
  PaymentStatus,
  CapturePaymentInput,
} from "./service.js";
