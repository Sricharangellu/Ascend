import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import type { Cents } from "../../shared/money.js";
import type { Page, StateCode } from "../../shared/types.js";
import { notFound, badRequest, conflict } from "../../shared/http.js";
import { computeOrderTax, type TaxableLine } from "./tax.js";

export type OrderStatus = "open" | "completed" | "refunded" | "voided";

export interface OrderRow {
  id: string;
  order_number: string;
  state_code: StateCode;
  status: OrderStatus;
  subtotal_cents: Cents;
  discount_cents: Cents;
  tax_cents: Cents;
  total_cents: Cents;
  customer_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface OrderLineRow {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_cents: Cents;
  tax_cents: Cents;
  line_cents: Cents;
  taxable: number; // 1|0
}

export interface OrderWithLines extends OrderRow {
  lines: OrderLineRow[];
}

export interface CreateOrderLineInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  stateCode: StateCode;
  lines: CreateOrderLineInput[];
  discountCents?: Cents;
  customerId?: string | null;
}

export interface ListOrdersQuery {
  status?: OrderStatus;
  limit?: number;
  offset?: number;
}

/** product columns owned by the catalog module (read-only, by id). */
interface ProductRow {
  id: string;
  name: string;
  price_cents: Cents;
  tax_class: string;
  status: string;
}

const VOIDABLE_STATUSES = new Set<OrderStatus>(["open", "completed"]);

export class OrdersService {
  constructor(
    private readonly db: DB,
    private readonly events: EventBus,
  ) {}

  async create(input: CreateOrderInput): Promise<OrderWithLines> {
    if (input.lines.length === 0) {
      throw badRequest("an order requires at least one line");
    }

    interface Resolved {
      input: CreateOrderLineInput;
      product: ProductRow;
      taxable: boolean;
      lineGross: Cents;
    }

    const resolved: Resolved[] = [];
    for (const line of input.lines) {
      if (line.quantity <= 0) {
        throw badRequest(`line quantity must be positive for ${line.productId}`);
      }
      const product = await this.db.one<ProductRow>(
        "SELECT id, name, price_cents, tax_class, status FROM products WHERE id = ?",
        [line.productId],
      );
      if (!product) {
        throw badRequest(`product '${line.productId}' not found`);
      }
      if (product.status !== "active") {
        // Only published (active) products are sellable. A draft product is not
        // yet released and an archived one is retired; neither can be rung up.
        throw badRequest(
          `product '${line.productId}' is ${product.status} and cannot be sold`,
        );
      }
      const taxable = product.tax_class !== "exempt";
      const lineGross = product.price_cents * line.quantity;
      resolved.push({ input: line, product, taxable, lineGross });
    }

    const taxInputs: TaxableLine[] = resolved.map((r) => ({
      lineGross: r.lineGross,
      taxable: r.taxable,
    }));

    const computed = computeOrderTax(taxInputs, input.stateCode, input.discountCents ?? 0);

    const now = Date.now();
    const orderId = `ord_${uuidv7()}`;
    const orderNumber = `FP-${orderId.slice(-8).toUpperCase()}`;

    const order: OrderRow = {
      id: orderId,
      order_number: orderNumber,
      state_code: input.stateCode,
      status: "open",
      subtotal_cents: computed.subtotalCents,
      discount_cents: computed.discountCents,
      tax_cents: computed.taxCents,
      total_cents: computed.totalCents,
      customer_id: input.customerId ?? null,
      created_at: now,
      updated_at: now,
    };

    const lines: OrderLineRow[] = resolved.map((r, i) => ({
      id: `oln_${uuidv7()}`,
      order_id: orderId,
      product_id: r.product.id,
      name: r.product.name,
      quantity: r.input.quantity,
      unit_cents: r.product.price_cents,
      tax_cents: computed.lines[i].taxCents,
      line_cents: computed.lines[i].lineCents,
      taxable: r.taxable ? 1 : 0,
    }));

    await this.db.tx(async (tdb) => {
      await tdb.query(
        `INSERT INTO orders
           (id, order_number, state_code, status, subtotal_cents,
            discount_cents, tax_cents, total_cents, customer_id,
            created_at, updated_at)
         VALUES
           (@id, @order_number, @state_code, @status, @subtotal_cents,
            @discount_cents, @tax_cents, @total_cents, @customer_id,
            @created_at, @updated_at)`,
        order as unknown as Record<string, unknown>,
      );
      for (const line of lines) {
        await tdb.query(
          `INSERT INTO order_lines
             (id, order_id, product_id, name, quantity, unit_cents,
              tax_cents, line_cents, taxable)
           VALUES
             (@id, @order_id, @product_id, @name, @quantity, @unit_cents,
              @tax_cents, @line_cents, @taxable)`,
          line as unknown as Record<string, unknown>,
        );
      }
    });

    await this.events.publish(
      "order.created",
      {
        id: order.id,
        orderNumber: order.order_number,
        stateCode: order.state_code,
        totalCents: order.total_cents,
        lines: lines.map((l) => ({
          productId: l.product_id,
          quantity: l.quantity,
          unitCents: l.unit_cents,
        })),
      },
      order.id,
    );

    return { ...order, lines };
  }

  /**
   * Transition an order to 'completed' (on payment.captured). No-op if missing
   * or already in a terminal/non-open state, so a late event can't resurrect it.
   */
  async markCompleted(orderId: string): Promise<void> {
    const order = await this.db.one<{ status: OrderStatus }>(
      "SELECT status FROM orders WHERE id = ?",
      [orderId],
    );
    if (!order || order.status !== "open") return;
    await this.db.query("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", [
      "completed",
      Date.now(),
      orderId,
    ]);
  }

  async get(id: string): Promise<OrderWithLines | undefined> {
    const order = await this.db.one<OrderRow>("SELECT * FROM orders WHERE id = ?", [id]);
    if (!order) return undefined;
    const lines = await this.db.query<OrderLineRow>(
      "SELECT * FROM order_lines WHERE order_id = ? ORDER BY id ASC",
      [id],
    );
    return { ...order, lines };
  }

  async getOrThrow(id: string): Promise<OrderWithLines> {
    const order = await this.get(id);
    if (!order) throw notFound(`order '${id}' not found`);
    return order;
  }

  async list(query: ListOrdersQuery = {}): Promise<Page<OrderRow>> {
    const limit = clampLimit(query.limit);
    const offset = query.offset && query.offset > 0 ? Math.floor(query.offset) : 0;

    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (query.status) {
      where.push("status = @status");
      params.status = query.status;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalRow = await this.db.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM orders ${whereSql}`,
      params,
    );
    const total = totalRow?.n ?? 0;

    const items = await this.db.query<OrderRow>(
      `SELECT * FROM orders ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT @limit OFFSET @offset`,
      { ...params, limit, offset },
    );

    return { items, total, limit, offset };
  }

  async refund(id: string): Promise<OrderWithLines> {
    const order = await this.getOrThrow(id);
    if (order.status === "refunded") {
      throw conflict(`order '${id}' is already refunded`);
    }
    if (order.status === "voided") {
      throw conflict(`voided order '${id}' cannot be refunded`);
    }

    const updatedAt = Date.now();
    await this.db.query("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", [
      "refunded",
      updatedAt,
      id,
    ]);

    await this.events.publish(
      "order.refunded",
      {
        id: order.id,
        orderNumber: order.order_number,
        totalCents: order.total_cents,
      },
      order.id,
    );

    return { ...order, status: "refunded", updated_at: updatedAt };
  }

  async void(id: string): Promise<OrderWithLines> {
    const order = await this.getOrThrow(id);
    if (!VOIDABLE_STATUSES.has(order.status)) {
      throw conflict(`order '${id}' is ${order.status} and cannot be voided`);
    }

    const updatedAt = Date.now();
    await this.db.query("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", [
      "voided",
      updatedAt,
      id,
    ]);

    return { ...order, status: "voided", updated_at: updatedAt };
  }
}

function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return 50;
  return Math.min(Math.floor(limit), 200);
}
