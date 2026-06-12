import type { DB } from "../../shared/db.js";

/** Tenant-scoped sales analytics. Read-only over the orders + payments tables
 *  (a lightweight read model / CQRS-lite — reports owns no tables of its own). */

export interface SalesSummary {
  orders: {
    open: number;
    completed: number;
    refunded: number;
    voided: number;
    total: number;
  };
  /** Revenue recognised from completed orders. */
  revenue: {
    grossCents: number;
    taxCents: number;
    netCents: number;
  };
  payments: {
    capturedCount: number;
    capturedCents: number;
    byMethod: Record<string, number>;
  };
}

export class ReportsService {
  constructor(private readonly db: DB) {}

  async salesSummary(tenantId: string): Promise<SalesSummary> {
    const orderRows = await this.db.query<{ status: string; n: number }>(
      "SELECT status, COUNT(*)::int AS n FROM orders WHERE tenant_id = @tenantId GROUP BY status",
      { tenantId },
    );
    const orders = { open: 0, completed: 0, refunded: 0, voided: 0, total: 0 };
    for (const r of orderRows) {
      const n = Number(r.n);
      if (r.status in orders) (orders as Record<string, number>)[r.status] = n;
      orders.total += n;
    }

    const rev = await this.db.one<{ gross: number; tax: number }>(
      `SELECT COALESCE(SUM(total_cents), 0) AS gross, COALESCE(SUM(tax_cents), 0) AS tax
         FROM orders WHERE tenant_id = @tenantId AND status = 'completed'`,
      { tenantId },
    );
    const grossCents = Number(rev?.gross ?? 0);
    const taxCents = Number(rev?.tax ?? 0);

    const payRows = await this.db.query<{ method: string; amt: number; n: number }>(
      `SELECT method, COALESCE(SUM(amount_cents), 0) AS amt, COUNT(*)::int AS n
         FROM payments WHERE tenant_id = @tenantId AND status = 'captured'
        GROUP BY method`,
      { tenantId },
    );
    const byMethod: Record<string, number> = {};
    let capturedCount = 0;
    let capturedCents = 0;
    for (const r of payRows) {
      byMethod[r.method] = Number(r.amt);
      capturedCount += Number(r.n);
      capturedCents += Number(r.amt);
    }

    return {
      orders,
      revenue: { grossCents, taxCents, netCents: grossCents - taxCents },
      payments: { capturedCount, capturedCents, byMethod },
    };
  }
}
