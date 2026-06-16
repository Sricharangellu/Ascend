import type { PosModule } from "../types.js";
import { DiscountsService } from "./service.js";
import { registerRoutes } from "./routes.js";

const CREATE_DISCOUNTS = `
CREATE TABLE IF NOT EXISTS discounts (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL,
  name               TEXT NOT NULL,
  coupon_code        TEXT,
  rule_type          TEXT NOT NULL DEFAULT 'simple',
  discount_type      TEXT NOT NULL DEFAULT 'percent',
  value              BIGINT NOT NULL DEFAULT 0,
  apply_to           TEXT NOT NULL DEFAULT 'cart',
  target_id          TEXT,
  min_order_cents    BIGINT NOT NULL DEFAULT 0,
  min_qty            INTEGER NOT NULL DEFAULT 0,
  buy_qty            INTEGER NOT NULL DEFAULT 0,
  get_qty            INTEGER NOT NULL DEFAULT 0,
  tier_restriction   TEXT,
  start_date         BIGINT,
  end_date           BIGINT,
  status             TEXT NOT NULL DEFAULT 'active',
  auto_applicable    INTEGER NOT NULL DEFAULT 0,
  usage_limit        INTEGER,
  per_customer_limit INTEGER,
  used_count         INTEGER NOT NULL DEFAULT 0,
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL
);`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS discounts_tenant_status_idx ON discounts (tenant_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS discounts_coupon_uidx ON discounts (tenant_id, coupon_code) WHERE coupon_code IS NOT NULL;`;

// BE-5: per-customer discount usage tracking.
const CREATE_DISCOUNT_USAGES = `
CREATE TABLE IF NOT EXISTS discount_usages (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  discount_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  order_id    TEXT,
  used_at     BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS discount_usages_customer_idx ON discount_usages (tenant_id, discount_id, customer_id);`;

/** Discounts & Promotions engine (ERP benchmark #11). */
export const discountsModule: PosModule = {
  name: "discounts",
  migrations: [CREATE_DISCOUNTS, INDEXES, CREATE_DISCOUNT_USAGES],
  register({ db, router }) {
    registerRoutes(router, new DiscountsService(db));
  },
};

export { DiscountsService } from "./service.js";
export type { Discount, RuleType, DiscountType, ApplyTo, RuleStatus, EvaluateResult } from "./service.js";
