import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import { HttpError } from "../../shared/http.js";

/** Purchasing — suppliers + purchase orders + receiving. Tenant-scoped.
 *  Receiving publishes `purchase_order.received`; the inventory module listens
 *  and increments stock (modules stay decoupled via events). Unit costs are
 *  captured into `product_costs` so the inventory grid can show cost. */

export type POStatus = "ordered" | "received" | "cancelled";

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  created_at: number;
}

export interface POLineInput {
  productId: string;
  quantity: number;
  unitCostCents: number;
}

export interface PurchaseOrderLine {
  id: string;
  tenant_id: string;
  po_id: string;
  product_id: string;
  quantity: number;
  unit_cost_cents: number;
  line_cost_cents: number;
}

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  supplier_id: string;
  status: POStatus;
  total_cost_cents: number;
  created_at: number;
  received_at: number | null;
}

export interface PurchaseOrderWithLines extends PurchaseOrder {
  lines: PurchaseOrderLine[];
}

export class PurchasingService {
  constructor(
    private readonly db: DB,
    private readonly events: EventBus,
  ) {}

  async createSupplier(name: string, email: string | undefined, tenantId: string): Promise<Supplier> {
    const s: Supplier = { id: `sup_${uuidv7()}`, tenant_id: tenantId, name, email: email ?? null, created_at: Date.now() };
    await this.db.query(
      "INSERT INTO suppliers (id, tenant_id, name, email, created_at) VALUES (@id,@tenant_id,@name,@email,@created_at)",
      s as unknown as Record<string, unknown>,
    );
    return s;
  }

  async listSuppliers(tenantId: string): Promise<Supplier[]> {
    return this.db.query<Supplier>("SELECT * FROM suppliers WHERE tenant_id = @tenantId ORDER BY created_at DESC", { tenantId });
  }

  async createOrder(supplierId: string, lines: POLineInput[], tenantId: string): Promise<PurchaseOrderWithLines> {
    if (lines.length === 0) throw new HttpError(400, "bad_request", "at least one line is required");
    const supplier = await this.db.one("SELECT id FROM suppliers WHERE id = @supplierId AND tenant_id = @tenantId", { supplierId, tenantId });
    if (!supplier) throw new HttpError(404, "not_found", `supplier '${supplierId}' not found`);
    const now = Date.now();
    const poId = `po_${uuidv7()}`;
    const poLines: PurchaseOrderLine[] = lines.map((l) => ({
      id: `pol_${uuidv7()}`,
      tenant_id: tenantId,
      po_id: poId,
      product_id: l.productId,
      quantity: l.quantity,
      unit_cost_cents: l.unitCostCents,
      line_cost_cents: l.quantity * l.unitCostCents,
    }));
    const total = poLines.reduce((s, l) => s + l.line_cost_cents, 0);
    await this.db.tx(async (tdb) => {
      await tdb.query(
        "INSERT INTO purchase_orders (id, tenant_id, supplier_id, status, total_cost_cents, created_at, received_at) VALUES (@id,@tenant_id,@supplier_id,'ordered',@total,@created_at,NULL)",
        { id: poId, tenant_id: tenantId, supplier_id: supplierId, total, created_at: now },
      );
      for (const l of poLines) {
        await tdb.query(
          "INSERT INTO purchase_order_lines (id, tenant_id, po_id, product_id, quantity, unit_cost_cents, line_cost_cents) VALUES (@id,@tenant_id,@po_id,@product_id,@quantity,@unit_cost_cents,@line_cost_cents)",
          l as unknown as Record<string, unknown>,
        );
      }
    });
    return { id: poId, tenant_id: tenantId, supplier_id: supplierId, status: "ordered", total_cost_cents: total, created_at: now, received_at: null, lines: poLines };
  }

  async listOrders(tenantId: string): Promise<PurchaseOrder[]> {
    return this.db.query<PurchaseOrder>("SELECT * FROM purchase_orders WHERE tenant_id = @tenantId ORDER BY created_at DESC LIMIT 200", { tenantId });
  }

  async getOrder(id: string, tenantId: string): Promise<PurchaseOrderWithLines> {
    const po = await this.db.one<PurchaseOrder>("SELECT * FROM purchase_orders WHERE id = @id AND tenant_id = @tenantId", { id, tenantId });
    if (!po) throw new HttpError(404, "not_found", `purchase order '${id}' not found`);
    const lines = await this.db.query<PurchaseOrderLine>("SELECT * FROM purchase_order_lines WHERE po_id = @id AND tenant_id = @tenantId", { id, tenantId });
    return { ...po, lines };
  }

  /** Receive a PO: capture unit costs, mark received, and emit an event so the
   *  inventory module increments stock. Idempotent-ish: rejects if already received. */
  async receive(id: string, tenantId: string): Promise<PurchaseOrderWithLines> {
    const po = await this.getOrder(id, tenantId);
    if (po.status === "received") throw new HttpError(409, "already_received", "purchase order already received");
    if (po.status === "cancelled") throw new HttpError(409, "cancelled", "purchase order is cancelled");
    const now = Date.now();
    await this.db.tx(async (tdb) => {
      await tdb.query("UPDATE purchase_orders SET status = 'received', received_at = @now WHERE id = @id AND tenant_id = @tenantId", { now, id, tenantId });
      for (const l of po.lines) {
        await tdb.query(
          `INSERT INTO product_costs (tenant_id, product_id, cost_cents, updated_at) VALUES (@tenant_id,@product_id,@cost,@now)
           ON CONFLICT (tenant_id, product_id) DO UPDATE SET cost_cents = EXCLUDED.cost_cents, updated_at = EXCLUDED.updated_at`,
          { tenant_id: tenantId, product_id: l.product_id, cost: l.unit_cost_cents, now },
        );
      }
    });
    await this.events.publish(
      "purchase_order.received",
      { tenantId, poId: id, lines: po.lines.map((l) => ({ productId: l.product_id, quantity: l.quantity, unitCostCents: l.unit_cost_cents })) },
      id,
    );
    return { ...po, status: "received", received_at: now };
  }
}
