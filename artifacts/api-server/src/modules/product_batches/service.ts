import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import { notFound } from "../../shared/http.js";

export type ExpiryStatus = "expired" | "critical" | "warning" | "ok";

export interface ProductBatch {
  id: string;
  tenant_id: string;
  product_id: string;
  batch_number: string;
  expiry_date: number | null;
  qty: number;
  cost_cents: number;
  received_at: number;
  supplier_name: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
  // Joined
  product_name?: string;
  product_sku?: string;
  category?: string;
  expiry_status?: ExpiryStatus;
  days_until_expiry?: number | null;
}

export interface CreateBatchInput {
  product_id: string;
  batch_number?: string;
  expiry_date?: number | null;
  qty: number;
  cost_cents?: number;
  received_at?: number;
  supplier_name?: string | null;
  notes?: string | null;
}

function expiryStatus(expiryDate: number | null): ExpiryStatus | undefined {
  if (expiryDate == null) return undefined;
  const days = Math.floor((expiryDate - Date.now()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "warning";
  return "ok";
}

function daysUntilExpiry(expiryDate: number | null): number | null {
  if (expiryDate == null) return null;
  return Math.floor((expiryDate - Date.now()) / 86400000);
}

export function productBatchesService(db: DB, events: EventBus) {
  return {
    async listBatches(tenantId: string, opts: { product_id?: string; status?: ExpiryStatus; days?: number }): Promise<ProductBatch[]> {
      let whereExtra = "";
      const now = Date.now();
      if (opts.status === "expired") {
        whereExtra = "AND pb.expiry_date < @now";
      } else if (opts.status === "critical") {
        whereExtra = "AND pb.expiry_date >= @now AND pb.expiry_date < @nowPlus7";
      } else if (opts.status === "warning") {
        whereExtra = "AND pb.expiry_date >= @now AND pb.expiry_date < @nowPlus30";
      } else if (opts.status === "ok") {
        whereExtra = "AND (pb.expiry_date IS NULL OR pb.expiry_date >= @nowPlus30)";
      }
      if (opts.days != null) {
        whereExtra = `AND pb.expiry_date >= @now AND pb.expiry_date < @nowPlusDays`;
      }

      const rows = await db.query<ProductBatch>(
        `SELECT pb.*, p.name AS product_name, p.sku AS product_sku, p.category
         FROM product_batches pb
         JOIN products p ON p.id = pb.product_id AND p.tenant_id = pb.tenant_id
         WHERE pb.tenant_id = @tenantId
         ${opts.product_id ? "AND pb.product_id = @productId" : ""}
         ${whereExtra}
         AND pb.qty > 0
         ORDER BY pb.expiry_date ASC NULLS LAST, pb.received_at DESC`,
        {
          tenantId,
          productId: opts.product_id ?? null,
          now,
          nowPlus7: now + 7 * 86400000,
          nowPlus30: now + 30 * 86400000,
          nowPlusDays: opts.days != null ? now + opts.days * 86400000 : null,
        }
      );

      return rows.map((r) => ({
        ...r,
        expiry_status: expiryStatus(r.expiry_date),
        days_until_expiry: daysUntilExpiry(r.expiry_date),
      }));
    },

    async getBatch(id: string, tenantId: string): Promise<ProductBatch> {
      const row = await db.one<ProductBatch>(
        `SELECT pb.*, p.name AS product_name, p.sku AS product_sku
         FROM product_batches pb JOIN products p ON p.id = pb.product_id
         WHERE pb.id = @id AND pb.tenant_id = @tenantId`,
        { id, tenantId }
      );
      if (!row) throw notFound("product_batch");
      return { ...row, expiry_status: expiryStatus(row.expiry_date), days_until_expiry: daysUntilExpiry(row.expiry_date) };
    },

    async createBatch(input: CreateBatchInput, tenantId: string): Promise<ProductBatch> {
      const id = uuidv7();
      const now = Date.now();
      const [row] = await db.query<ProductBatch>(
        `INSERT INTO product_batches
           (id, tenant_id, product_id, batch_number, expiry_date, qty, cost_cents, received_at, supplier_name, notes, created_at, updated_at)
         VALUES (@id, @tenantId, @productId, @batchNumber, @expiryDate, @qty, @costCents, @receivedAt, @supplierName, @notes, @now, @now)
         RETURNING *`,
        {
          id, tenantId, productId: input.product_id,
          batchNumber: input.batch_number ?? "",
          expiryDate: input.expiry_date ?? null,
          qty: input.qty, costCents: input.cost_cents ?? 0,
          receivedAt: input.received_at ?? now,
          supplierName: input.supplier_name ?? null,
          notes: input.notes ?? null, now,
        }
      );
      events.publish("product_batch.created", { tenantId, batchId: id, productId: input.product_id, expiryDate: input.expiry_date });
      return { ...row, expiry_status: expiryStatus(row.expiry_date), days_until_expiry: daysUntilExpiry(row.expiry_date) };
    },

    async updateBatch(id: string, input: Partial<CreateBatchInput>, tenantId: string): Promise<ProductBatch> {
      await this.getBatch(id, tenantId);
      const now = Date.now();
      const [row] = await db.query<ProductBatch>(
        `UPDATE product_batches SET
           batch_number = COALESCE(@batchNumber, batch_number),
           expiry_date  = CASE WHEN @hasExpiry THEN @expiryDate ELSE expiry_date END,
           qty          = COALESCE(@qty, qty),
           cost_cents   = COALESCE(@costCents, cost_cents),
           supplier_name = COALESCE(@supplierName, supplier_name),
           notes        = COALESCE(@notes, notes),
           updated_at   = @now
         WHERE id = @id AND tenant_id = @tenantId RETURNING *`,
        {
          id, tenantId, now,
          batchNumber: input.batch_number ?? null,
          hasExpiry: "expiry_date" in input,
          expiryDate: input.expiry_date ?? null,
          qty: input.qty ?? null,
          costCents: input.cost_cents ?? null,
          supplierName: input.supplier_name ?? null,
          notes: input.notes ?? null,
        }
      );
      return { ...row, expiry_status: expiryStatus(row.expiry_date), days_until_expiry: daysUntilExpiry(row.expiry_date) };
    },

    async deleteBatch(id: string, tenantId: string): Promise<void> {
      await this.getBatch(id, tenantId);
      await db.query(`DELETE FROM product_batches WHERE id=@id AND tenant_id=@tenantId`, { id, tenantId });
    },

    async getExpirySummary(tenantId: string): Promise<{
      expired: number; critical: number; warning: number; ok: number;
      expired_qty: number; critical_qty: number; warning_qty: number;
    }> {
      const now = Date.now();
      const [row] = await db.query<{
        expired: number; critical: number; warning: number; ok_count: number;
        expired_qty: number; critical_qty: number; warning_qty: number;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE expiry_date < @now)                                           AS expired,
           COUNT(*) FILTER (WHERE expiry_date >= @now AND expiry_date < @now7)                  AS critical,
           COUNT(*) FILTER (WHERE expiry_date >= @now7 AND expiry_date < @now30)                AS warning,
           COUNT(*) FILTER (WHERE expiry_date IS NULL OR expiry_date >= @now30)                 AS ok_count,
           COALESCE(SUM(qty) FILTER (WHERE expiry_date < @now), 0)                             AS expired_qty,
           COALESCE(SUM(qty) FILTER (WHERE expiry_date >= @now AND expiry_date < @now7), 0)    AS critical_qty,
           COALESCE(SUM(qty) FILTER (WHERE expiry_date >= @now7 AND expiry_date < @now30), 0)  AS warning_qty
         FROM product_batches WHERE tenant_id = @tenantId AND qty > 0`,
        { tenantId, now, now7: now + 7 * 86400000, now30: now + 30 * 86400000 }
      );
      return {
        expired: Number(row?.expired ?? 0),
        critical: Number(row?.critical ?? 0),
        warning: Number(row?.warning ?? 0),
        ok: Number(row?.ok_count ?? 0),
        expired_qty: Number(row?.expired_qty ?? 0),
        critical_qty: Number(row?.critical_qty ?? 0),
        warning_qty: Number(row?.warning_qty ?? 0),
      };
    },
  };
}

export type ProductBatchesService = ReturnType<typeof productBatchesService>;
