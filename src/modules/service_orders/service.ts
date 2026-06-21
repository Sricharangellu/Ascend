import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import { notFound, badRequest } from "../../shared/http.js";

export type ServiceOrderStatus = "draft" | "open" | "in_progress" | "ready" | "closed";

const NEXT_STATUS: Record<ServiceOrderStatus, ServiceOrderStatus | null> = {
  draft: "open",
  open: "in_progress",
  in_progress: "ready",
  ready: "closed",
  closed: null,
};

export interface ServiceOrder {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  title: string;
  description: string;
  status: ServiceOrderStatus;
  assigned_to: string | null;
  estimate_cents: number;
  actual_cents: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateServiceOrderInput {
  customer_id?: string | null;
  title: string;
  description?: string;
  assigned_to?: string | null;
  estimate_cents?: number;
  notes?: string | null;
}

export interface UpdateServiceOrderInput {
  title?: string;
  description?: string;
  assigned_to?: string | null;
  estimate_cents?: number;
  actual_cents?: number | null;
  notes?: string | null;
}

export type ServiceOrdersService = ReturnType<typeof serviceOrdersService>;

export function serviceOrdersService(db: DB, events: EventBus) {
  return {
    async list(tenantId: string, opts: {
      limit?: number; offset?: number; status?: ServiceOrderStatus; q?: string;
    } = {}) {
      const { limit = 50, offset = 0, status, q } = opts;
      const where: string[] = ["tenant_id = @tenantId"];
      const params: Record<string, unknown> = { tenantId, limit, offset };
      if (status) { where.push("status = @status"); params["status"] = status; }
      if (q) { where.push("(title ILIKE @q OR description ILIKE @q)"); params["q"] = `%${q}%`; }
      const cond = where.join(" AND ");
      const [items, countRows] = await Promise.all([
        db.query<ServiceOrder>(
          `SELECT * FROM service_orders WHERE ${cond} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`,
          params
        ),
        db.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM service_orders WHERE ${cond}`,
          params
        ),
      ]);
      return { items, total: countRows[0]?.n ?? 0, limit, offset };
    },

    async get(tenantId: string, id: string): Promise<ServiceOrder> {
      const row = await db.one<ServiceOrder>(
        "SELECT * FROM service_orders WHERE id = @id AND tenant_id = @tenantId",
        { id, tenantId }
      );
      if (!row) throw notFound("service_order");
      return row;
    },

    async create(tenantId: string, input: CreateServiceOrderInput): Promise<ServiceOrder> {
      const now = Date.now();
      const row: ServiceOrder = {
        id: `svo_${uuidv7()}`,
        tenant_id: tenantId,
        customer_id: input.customer_id ?? null,
        title: input.title,
        description: input.description ?? "",
        status: "draft",
        assigned_to: input.assigned_to ?? null,
        estimate_cents: input.estimate_cents ?? 0,
        actual_cents: null,
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now,
      };
      await db.query(
        `INSERT INTO service_orders
           (id, tenant_id, customer_id, title, description, status, assigned_to,
            estimate_cents, actual_cents, notes, created_at, updated_at)
         VALUES
           (@id, @tenant_id, @customer_id, @title, @description, @status, @assigned_to,
            @estimate_cents, @actual_cents, @notes, @created_at, @updated_at)`,
        { ...row }
      );
      return row;
    },

    async update(tenantId: string, id: string, input: UpdateServiceOrderInput): Promise<ServiceOrder> {
      const row = await this.get(tenantId, id);
      const now = Date.now();
      const updated = { ...row, ...input, updated_at: now };
      await db.query(
        `UPDATE service_orders
         SET title=@title, description=@description, assigned_to=@assigned_to,
             estimate_cents=@estimate_cents, actual_cents=@actual_cents,
             notes=@notes, updated_at=@updated_at
         WHERE id=@id AND tenant_id=@tenant_id`,
        updated
      );
      return updated;
    },

    async transition(tenantId: string, id: string, toStatus: ServiceOrderStatus): Promise<ServiceOrder> {
      const row = await this.get(tenantId, id);
      const allowed = NEXT_STATUS[row.status];
      if (allowed !== toStatus) {
        throw badRequest(`Cannot transition from '${row.status}' to '${toStatus}'`);
      }
      const now = Date.now();
      await db.query(
        "UPDATE service_orders SET status=@toStatus, updated_at=@now WHERE id=@id AND tenant_id=@tenantId",
        { toStatus, now, id, tenantId }
      );
      const updated = { ...row, status: toStatus, updated_at: now };
      await events.publish("service_order.status_changed", {
        tenantId, id, from: row.status, to: toStatus,
      });
      return updated;
    },
  };
}
