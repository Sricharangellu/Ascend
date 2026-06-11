import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import type { Cents } from "../../shared/money.js";
import type { Page } from "../../shared/types.js";
import { notFound, conflict } from "../../shared/http.js";

export type TaxClass = "standard" | "exempt";
export type ProductStatus = "active" | "draft" | "archived";

export interface Product {
  id: string;
  sku: string;
  name: string;
  price_cents: Cents;
  category: string;
  tax_class: TaxClass;
  barcode: string | null;
  status: ProductStatus;
  created_at: number;
  updated_at: number;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  price_cents: Cents;
  category?: string;
  tax_class?: TaxClass;
  barcode?: string | null;
  status?: ProductStatus;
}

export interface UpdateProductInput {
  name?: string;
  price_cents?: Cents;
  category?: string;
  tax_class?: TaxClass;
  barcode?: string | null;
  status?: ProductStatus;
}

export interface ListProductsQuery {
  category?: string;
  status?: ProductStatus;
  limit?: number;
  offset?: number;
}

/**
 * Tax rule from CONTRACTS.md: products in the 'groceries' category are always
 * tax-exempt. Otherwise the caller's tax_class is respected, defaulting to
 * 'standard' (caller may explicitly choose 'exempt').
 */
function resolveTaxClass(category: string, requested?: TaxClass): TaxClass {
  if (category === "groceries") return "exempt";
  return requested ?? "standard";
}

export class CatalogService {
  constructor(
    private readonly db: DB,
    private readonly events: EventBus,
  ) {}

  async create(input: CreateProductInput): Promise<Product> {
    const existing = await this.db.one("SELECT id FROM products WHERE sku = ?", [input.sku]);
    if (existing) {
      throw conflict(`product with sku '${input.sku}' already exists`);
    }

    const now = Date.now();
    const category = input.category ?? "general";
    const product: Product = {
      id: `prod_${uuidv7()}`,
      sku: input.sku,
      name: input.name,
      price_cents: input.price_cents,
      category,
      tax_class: resolveTaxClass(category, input.tax_class),
      barcode: input.barcode ?? null,
      status: input.status ?? "active",
      created_at: now,
      updated_at: now,
    };

    await this.db.query(
      `INSERT INTO products
         (id, sku, name, price_cents, category, tax_class, barcode, status, created_at, updated_at)
       VALUES
         (@id, @sku, @name, @price_cents, @category, @tax_class, @barcode, @status, @created_at, @updated_at)`,
      product as unknown as Record<string, unknown>,
    );

    await this.events.publish(
      "product.created",
      {
        id: product.id,
        sku: product.sku,
        name: product.name,
        priceCents: product.price_cents,
        category: product.category,
        taxClass: product.tax_class,
      },
      product.id,
    );

    return product;
  }

  async get(id: string): Promise<Product | undefined> {
    return this.db.one<Product>("SELECT * FROM products WHERE id = ?", [id]);
  }

  async getOrThrow(id: string): Promise<Product> {
    const product = await this.get(id);
    if (!product) throw notFound(`product '${id}' not found`);
    return product;
  }

  async list(query: ListProductsQuery = {}): Promise<Page<Product>> {
    const limit = clampLimit(query.limit);
    const offset = query.offset && query.offset > 0 ? Math.floor(query.offset) : 0;

    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (query.category) {
      where.push("category = @category");
      params.category = query.category;
    }
    if (query.status) {
      where.push("status = @status");
      params.status = query.status;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalRow = await this.db.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM products ${whereSql}`,
      params,
    );
    const total = totalRow?.n ?? 0;

    const items = await this.db.query<Product>(
      `SELECT * FROM products ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT @limit OFFSET @offset`,
      { ...params, limit, offset },
    );

    return { items, total, limit, offset };
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const current = await this.getOrThrow(id);

    const next: Product = { ...current };
    const changed: Partial<Product> = {};

    if (input.name !== undefined && input.name !== current.name) {
      next.name = input.name;
      changed.name = input.name;
    }
    if (input.price_cents !== undefined && input.price_cents !== current.price_cents) {
      next.price_cents = input.price_cents;
      changed.price_cents = input.price_cents;
    }
    if (input.barcode !== undefined && (input.barcode ?? null) !== current.barcode) {
      next.barcode = input.barcode ?? null;
      changed.barcode = next.barcode;
    }
    if (input.status !== undefined && input.status !== current.status) {
      next.status = input.status;
      changed.status = input.status;
    }

    const nextCategory = input.category ?? current.category;
    if (input.category !== undefined && input.category !== current.category) {
      next.category = input.category;
      changed.category = input.category;
    }
    const resolvedTax = resolveTaxClass(nextCategory, input.tax_class ?? current.tax_class);
    if (resolvedTax !== current.tax_class) {
      next.tax_class = resolvedTax;
      changed.tax_class = resolvedTax;
    }

    if (Object.keys(changed).length === 0) {
      return current;
    }

    next.updated_at = Date.now();

    await this.db.query(
      `UPDATE products SET
         name = @name,
         price_cents = @price_cents,
         category = @category,
         tax_class = @tax_class,
         barcode = @barcode,
         status = @status,
         updated_at = @updated_at
       WHERE id = @id`,
      next as unknown as Record<string, unknown>,
    );

    await this.events.publish("product.updated", { id: next.id, ...changed }, next.id);

    return next;
  }

  /** Soft delete: archive the product. */
  async archive(id: string): Promise<Product> {
    return this.update(id, { status: "archived" });
  }

  async count(): Promise<number> {
    const row = await this.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM products");
    return row?.n ?? 0;
  }

  /** Seed realistic demo products on first init. Idempotent: only seeds when empty. */
  async seed(): Promise<void> {
    if ((await this.count()) > 0) return;
    const demo: CreateProductInput[] = [
      { sku: "GRO-COFFEE-001", name: "Organic Dark Roast Beans", price_cents: 1499, category: "groceries", barcode: "0123456789012" },
      { sku: "GRO-HONEY-001", name: "Wildflower Honey", price_cents: 899, category: "groceries", barcode: "0123456789029" },
      { sku: "APP-TSHIRT-001", name: "Finder Logo T-Shirt", price_cents: 2200, category: "apparel", barcode: "0123456789036" },
      { sku: "HOME-MUG-001", name: "Ceramic Coffee Mug", price_cents: 1200, category: "home", barcode: "0123456789043" },
    ];
    for (const p of demo) {
      try {
        await this.create(p);
      } catch {
        // Tolerate a concurrent seeder racing on the same SKU (cold-start races).
      }
    }
  }
}

function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return 50;
  return Math.min(Math.floor(limit), 200);
}
