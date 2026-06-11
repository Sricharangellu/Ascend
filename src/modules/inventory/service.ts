import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import type { Page } from "../../shared/types.js";

export type MovementReason = "receiving" | "sale" | "adjustment" | "return";

export interface InventoryRow {
  product_id: string;
  stock_qty: number;
  reorder_pt: number;
  updated_at: number;
}

export interface MovementRow {
  id: string;
  product_id: string;
  delta: number;
  reason: MovementReason;
  ref: string | null;
  created_at: number;
}

export interface ListInventoryQuery {
  lowStock?: boolean;
  limit?: number;
  offset?: number;
}

export class InventoryService {
  constructor(
    private readonly db: DB,
    private readonly events: EventBus,
  ) {}

  /**
   * Current stock for a product. Returns a zeroed row when no inventory row
   * exists yet (we treat "never stocked" as 0/0 rather than 404).
   */
  async getStock(productId: string): Promise<InventoryRow> {
    const row = await this.db.one<InventoryRow>(
      "SELECT * FROM inventory WHERE product_id = ?",
      [productId],
    );
    return row ?? { product_id: productId, stock_qty: 0, reorder_pt: 0, updated_at: 0 };
  }

  async setReorderPoint(productId: string, reorderPt: number): Promise<InventoryRow> {
    return this.db.tx(async (tdb) => {
      const now = Date.now();
      const existing = await tdb.one<InventoryRow>(
        "SELECT * FROM inventory WHERE product_id = ?",
        [productId],
      );

      if (existing) {
        await tdb.query(
          "UPDATE inventory SET reorder_pt = @reorder_pt, updated_at = @updated_at WHERE product_id = @product_id",
          { product_id: productId, reorder_pt: reorderPt, updated_at: now },
        );
      } else {
        await tdb.query(
          "INSERT INTO inventory (product_id, stock_qty, reorder_pt, updated_at) VALUES (@product_id, 0, @reorder_pt, @updated_at)",
          { product_id: productId, reorder_pt: reorderPt, updated_at: now },
        );
      }

      return (await tdb.one<InventoryRow>(
        "SELECT * FROM inventory WHERE product_id = ?",
        [productId],
      ))!;
    });
  }

  /**
   * Central stock mutation. Upserts the inventory row (creating it at 0 when
   * absent), applies `delta`, clamps stock at >= 0 (never negative), records a
   * movement row, bumps updated_at, and emits `inventory.adjusted`. All inside
   * a single transaction.
   */
  async adjust(
    productId: string,
    delta: number,
    reason: MovementReason,
    ref?: string,
  ): Promise<InventoryRow> {
    const result = await this.db.tx(async (tdb) => {
      const now = Date.now();
      const existing = await tdb.one<InventoryRow>(
        "SELECT * FROM inventory WHERE product_id = ?",
        [productId],
      );

      const currentQty = existing ? existing.stock_qty : 0;
      const reorderPt = existing ? existing.reorder_pt : 0;
      // Clamp at >= 0 so stock never goes negative.
      const nextQty = Math.max(0, currentQty + delta);
      // The movement ledger and event record the delta ACTUALLY applied, which
      // differs from the requested delta whenever the clamp floors stock at 0.
      const appliedDelta = nextQty - currentQty;

      if (existing) {
        await tdb.query(
          "UPDATE inventory SET stock_qty = @stock_qty, updated_at = @updated_at WHERE product_id = @product_id",
          { product_id: productId, stock_qty: nextQty, updated_at: now },
        );
      } else {
        await tdb.query(
          "INSERT INTO inventory (product_id, stock_qty, reorder_pt, updated_at) VALUES (@product_id, @stock_qty, @reorder_pt, @updated_at)",
          { product_id: productId, stock_qty: nextQty, reorder_pt: reorderPt, updated_at: now },
        );
      }

      await tdb.query(
        `INSERT INTO inventory_movements (id, product_id, delta, reason, ref, created_at)
         VALUES (@id, @product_id, @delta, @reason, @ref, @created_at)`,
        {
          id: `mov_${uuidv7()}`,
          product_id: productId,
          delta: appliedDelta,
          reason,
          ref: ref ?? null,
          created_at: now,
        },
      );

      return {
        row: { product_id: productId, stock_qty: nextQty, reorder_pt: reorderPt, updated_at: now },
        appliedDelta,
        nextQty,
      };
    });

    // Publish AFTER commit so subscribers (outbox) observe a durable change.
    await this.events.publish(
      "inventory.adjusted",
      { productId, delta: result.appliedDelta, reason, stockQty: result.nextQty },
      productId,
    );

    return result.row;
  }

  async list(query: ListInventoryQuery = {}): Promise<Page<InventoryRow>> {
    const limit = clampLimit(query.limit);
    const offset = query.offset && query.offset > 0 ? Math.floor(query.offset) : 0;
    const whereSql = query.lowStock ? "WHERE stock_qty <= reorder_pt" : "";

    const totalRow = await this.db.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM inventory ${whereSql}`,
    );
    const total = totalRow?.n ?? 0;

    const items = await this.db.query<InventoryRow>(
      `SELECT * FROM inventory ${whereSql}
       ORDER BY updated_at DESC, product_id DESC
       LIMIT @limit OFFSET @offset`,
      { limit, offset },
    );

    return { items, total, limit, offset };
  }

  async movements(productId: string): Promise<MovementRow[]> {
    return this.db.query<MovementRow>(
      "SELECT * FROM inventory_movements WHERE product_id = ? ORDER BY created_at DESC, id DESC",
      [productId],
    );
  }

  /**
   * Restock for a refund. The `order.refunded` event payload carries no line
   * data, so we reverse the 'sale' movements recorded for this order ref.
   * Idempotent: if a 'return' movement already exists for this order ref, no-op.
   */
  async restockFromOrderRef(orderId: string): Promise<void> {
    const alreadyRow = await this.db.one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM inventory_movements WHERE ref = ? AND reason = 'return'",
      [orderId],
    );
    if ((alreadyRow?.n ?? 0) > 0) return;

    const sales = await this.db.query<MovementRow>(
      "SELECT * FROM inventory_movements WHERE ref = ? AND reason = 'sale' ORDER BY created_at ASC, id ASC",
      [orderId],
    );

    for (const sale of sales) {
      // sale.delta was negative (e.g. -2); reverse it to restock (+2).
      await this.adjust(sale.product_id, -sale.delta, "return", orderId);
    }
  }
}

function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return 50;
  return Math.min(Math.floor(limit), 200);
}
