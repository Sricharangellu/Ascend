import type { PosModule } from "../types.js";
import { LoyaltyService } from "./service.js";
import { registerRoutes } from "./routes.js";

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id               TEXT PRIMARY KEY,
    tenant_id        TEXT NOT NULL,
    name             TEXT NOT NULL,
    level            TEXT NOT NULL CHECK (level IN ('bronze','silver','gold','platinum')),
    points_required  INTEGER NOT NULL DEFAULT 0,
    discount_pct     DECIMAL(5,2) NOT NULL DEFAULT 0,
    description      TEXT,
    created_at       BIGINT NOT NULL,
    updated_at       BIGINT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS loyalty_tiers_tenant_idx ON loyalty_tiers (tenant_id);`,
  `CREATE TABLE IF NOT EXISTS loyalty_members (
    id               TEXT PRIMARY KEY,
    tenant_id        TEXT NOT NULL,
    customer_id      TEXT NOT NULL,
    tier_id          TEXT,
    points_balance   INTEGER NOT NULL DEFAULT 0,
    points_lifetime  INTEGER NOT NULL DEFAULT 0,
    joined_at        BIGINT NOT NULL,
    last_activity_at BIGINT,
    updated_at       BIGINT NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, customer_id)
  );`,
  `CREATE INDEX IF NOT EXISTS loyalty_members_tenant_idx  ON loyalty_members (tenant_id);`,
  `CREATE INDEX IF NOT EXISTS loyalty_members_tier_idx    ON loyalty_members (tenant_id, tier_id);`,
  `CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id               TEXT PRIMARY KEY,
    tenant_id        TEXT NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT,
    points_cost      INTEGER NOT NULL,
    discount_cents   INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
    redemption_count INTEGER NOT NULL DEFAULT 0,
    created_at       BIGINT NOT NULL,
    updated_at       BIGINT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS loyalty_rewards_tenant_idx ON loyalty_rewards (tenant_id, status);`,
];

export const loyaltyModule: PosModule = {
  name: "loyalty",
  migrations: MIGRATIONS,
  async register({ db, events, router }) {
    const service = new LoyaltyService(db);
    registerRoutes(router, service, events);
  },
};

export { LoyaltyService } from "./service.js";
export type { LoyaltyTier, LoyaltyMember, LoyaltyReward, LoyaltyTierLevel, LoyaltyRewardStatus } from "./service.js";
