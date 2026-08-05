import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";

export type LoyaltyTierLevel = "bronze" | "silver" | "gold" | "platinum";
export type LoyaltyRewardStatus = "active" | "inactive" | "archived";

export interface LoyaltyTier {
  id: string;
  tenant_id: string;
  name: string;
  level: LoyaltyTierLevel;
  points_required: number;
  discount_pct: number;
  description: string | null;
  member_count: number;
  created_at: number;
  updated_at: number;
}

export interface LoyaltyMember {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  tier_id: string | null;
  tier_name: string | null;
  tier_level: LoyaltyTierLevel | null;
  points_balance: number;
  points_lifetime: number;
  joined_at: number;
  last_activity_at: number | null;
}

export interface LoyaltyReward {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  points_cost: number;
  discount_cents: number;
  status: LoyaltyRewardStatus;
  redemption_count: number;
  created_at: number;
  updated_at: number;
}

export class LoyaltyService {
  constructor(private readonly db: DB) {}

  // ── Tiers ──────────────────────────────────────────────────────────────────

  async listTiers(tenantId: string): Promise<LoyaltyTier[]> {
    return this.db.query<LoyaltyTier>(
      `SELECT t.*,
              (SELECT COUNT(*)::int FROM loyalty_members m
               WHERE m.tier_id = t.id AND m.tenant_id = @tenantId) AS member_count
       FROM loyalty_tiers t
       WHERE t.tenant_id = @tenantId
       ORDER BY t.points_required ASC`,
      { tenantId },
    );
  }

  async getTier(id: string, tenantId: string): Promise<LoyaltyTier | null> {
    const rows = await this.db.query<LoyaltyTier>(
      `SELECT t.*,
              (SELECT COUNT(*)::int FROM loyalty_members m
               WHERE m.tier_id = t.id AND m.tenant_id = @tenantId) AS member_count
       FROM loyalty_tiers t
       WHERE t.id = @id AND t.tenant_id = @tenantId`,
      { id, tenantId },
    );
    return rows[0] ?? null;
  }

  async createTier(
    tenantId: string,
    input: {
      name: string;
      level: LoyaltyTierLevel;
      points_required: number;
      discount_pct: number;
      description?: string | null;
    },
  ): Promise<LoyaltyTier> {
    const now = Date.now();
    const id = `ltier_${uuidv7()}`;
    await this.db.query(
      `INSERT INTO loyalty_tiers (id, tenant_id, name, level, points_required, discount_pct, description, created_at, updated_at)
       VALUES (@id, @tenantId, @name, @level, @points_required, @discount_pct, @description, @now, @now)`,
      { id, tenantId, ...input, description: input.description ?? null, now },
    );
    return (await this.getTier(id, tenantId))!;
  }

  async updateTier(
    id: string,
    tenantId: string,
    patch: Partial<{
      name: string;
      level: LoyaltyTierLevel;
      points_required: number;
      discount_pct: number;
      description: string | null;
    }>,
  ): Promise<LoyaltyTier | null> {
    const sets: string[] = ["updated_at = @now"];
    const params: Record<string, unknown> = { id, tenantId, now: Date.now() };
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = @${k}`);
      params[k] = v;
    }
    await this.db.query(
      `UPDATE loyalty_tiers SET ${sets.join(", ")} WHERE id = @id AND tenant_id = @tenantId`,
      params,
    );
    return this.getTier(id, tenantId);
  }

  async deleteTier(id: string, tenantId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `DELETE FROM loyalty_tiers WHERE id = @id AND tenant_id = @tenantId RETURNING id`,
      { id, tenantId },
    );
    return rows.length > 0;
  }

  // ── Members ────────────────────────────────────────────────────────────────

  async listMembers(
    tenantId: string,
    opts: { tier_id?: string; limit?: number; offset?: number } = {},
  ): Promise<{ items: LoyaltyMember[]; total: number }> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    const conditions = ["m.tenant_id = @tenantId"];
    const params: Record<string, unknown> = { tenantId, limit, offset };
    if (opts.tier_id) {
      conditions.push("m.tier_id = @tier_id");
      params["tier_id"] = opts.tier_id;
    }
    const where = conditions.join(" AND ");
    const [items, countRow] = await Promise.all([
      this.db.query<LoyaltyMember>(
        `SELECT m.*,
                c.name AS customer_name, c.email AS customer_email,
                t.name AS tier_name, t.level AS tier_level
         FROM loyalty_members m
         JOIN customers c ON c.id = m.customer_id AND c.tenant_id = m.tenant_id
         LEFT JOIN loyalty_tiers t ON t.id = m.tier_id AND t.tenant_id = m.tenant_id
         WHERE ${where}
         ORDER BY m.points_lifetime DESC
         LIMIT @limit OFFSET @offset`,
        params,
      ),
      this.db.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM loyalty_members m WHERE ${where}`,
        params,
      ),
    ]);
    return { items, total: countRow[0]?.n ?? 0 };
  }

  async getMember(id: string, tenantId: string): Promise<LoyaltyMember | null> {
    const rows = await this.db.query<LoyaltyMember>(
      `SELECT m.*,
              c.name AS customer_name, c.email AS customer_email,
              t.name AS tier_name, t.level AS tier_level
       FROM loyalty_members m
       JOIN customers c ON c.id = m.customer_id AND c.tenant_id = m.tenant_id
       LEFT JOIN loyalty_tiers t ON t.id = m.tier_id AND t.tenant_id = m.tenant_id
       WHERE m.id = @id AND m.tenant_id = @tenantId`,
      { id, tenantId },
    );
    return rows[0] ?? null;
  }

  async adjustPoints(
    id: string,
    tenantId: string,
    delta: number,
    events: EventBus,
  ): Promise<LoyaltyMember | null> {
    const now = Date.now();
    await this.db.query(
      `UPDATE loyalty_members
       SET points_balance  = GREATEST(0, points_balance + @delta),
           points_lifetime = CASE WHEN @delta > 0 THEN points_lifetime + @delta ELSE points_lifetime END,
           last_activity_at = @now
       WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId, delta, now },
    );
    const member = await this.getMember(id, tenantId);
    if (!member) return null;

    // Auto-upgrade tier based on lifetime points.
    const tiers = await this.listTiers(tenantId);
    const eligible = tiers
      .filter((t) => t.points_required <= member.points_lifetime)
      .sort((a, b) => b.points_required - a.points_required);
    const bestTier = eligible[0];
    if (bestTier && bestTier.id !== member.tier_id) {
      await this.db.query(
        `UPDATE loyalty_members SET tier_id = @tierId, updated_at = @now WHERE id = @id AND tenant_id = @tenantId`,
        { tierId: bestTier.id, now, id, tenantId },
      );
      await events.publish("loyalty.tier_upgraded", {
        tenantId,
        customerId: member.customer_id,
        tierName: bestTier.name,
      });
      return this.getMember(id, tenantId);
    }
    return member;
  }

  // ── Rewards ────────────────────────────────────────────────────────────────

  async listRewards(
    tenantId: string,
    opts: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<{ items: LoyaltyReward[]; total: number }> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    const conditions = ["tenant_id = @tenantId"];
    const params: Record<string, unknown> = { tenantId, limit, offset };
    if (opts.status) {
      conditions.push("status = @status");
      params["status"] = opts.status;
    }
    const where = conditions.join(" AND ");
    const [items, countRow] = await Promise.all([
      this.db.query<LoyaltyReward>(
        `SELECT * FROM loyalty_rewards WHERE ${where} ORDER BY points_cost ASC LIMIT @limit OFFSET @offset`,
        params,
      ),
      this.db.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM loyalty_rewards WHERE ${where}`,
        params,
      ),
    ]);
    return { items, total: countRow[0]?.n ?? 0 };
  }

  async getReward(id: string, tenantId: string): Promise<LoyaltyReward | null> {
    const rows = await this.db.query<LoyaltyReward>(
      `SELECT * FROM loyalty_rewards WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId },
    );
    return rows[0] ?? null;
  }

  async createReward(
    tenantId: string,
    input: {
      name: string;
      description?: string | null;
      points_cost: number;
      discount_cents: number;
      status?: LoyaltyRewardStatus;
    },
  ): Promise<LoyaltyReward> {
    const now = Date.now();
    const id = `lrwd_${uuidv7()}`;
    await this.db.query(
      `INSERT INTO loyalty_rewards
         (id, tenant_id, name, description, points_cost, discount_cents, status, redemption_count, created_at, updated_at)
       VALUES (@id, @tenantId, @name, @description, @points_cost, @discount_cents, @status, 0, @now, @now)`,
      {
        id,
        tenantId,
        name: input.name,
        description: input.description ?? null,
        points_cost: input.points_cost,
        discount_cents: input.discount_cents,
        status: input.status ?? "active",
        now,
      },
    );
    return (await this.getReward(id, tenantId))!;
  }

  async updateReward(
    id: string,
    tenantId: string,
    patch: Partial<{
      name: string;
      description: string | null;
      points_cost: number;
      discount_cents: number;
      status: LoyaltyRewardStatus;
    }>,
  ): Promise<LoyaltyReward | null> {
    const sets: string[] = ["updated_at = @now"];
    const params: Record<string, unknown> = { id, tenantId, now: Date.now() };
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = @${k}`);
      params[k] = v;
    }
    await this.db.query(
      `UPDATE loyalty_rewards SET ${sets.join(", ")} WHERE id = @id AND tenant_id = @tenantId`,
      params,
    );
    return this.getReward(id, tenantId);
  }

  async deleteReward(id: string, tenantId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `DELETE FROM loyalty_rewards WHERE id = @id AND tenant_id = @tenantId RETURNING id`,
      { id, tenantId },
    );
    return rows.length > 0;
  }
}
