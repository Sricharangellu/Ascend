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
  tenant_id: string;
  sku: string;
  name: string;
  price_cents: Cents;
  category: string;
  tax_class: TaxClass;
  barcode: string | null;
  status: ProductStatus;
  created_at: number;
  updated_at: number;
  description: string | null;
  brand: string | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  weight_grams: number | null;
  image_url: string | null;
  preferred_vendor_id: string | null;
  vendor_upc: string | null;
  min_qty_to_sell: number | null;
  max_qty_to_sell: number | null;
  qty_increment: number;
  parent_product_id: string | null;
  variant_label: string | null;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  price_cents: Cents;
  category?: string;
  tax_class?: TaxClass;
  barcode?: string | null;
  status?: ProductStatus;
  description?: string | null;
  brand?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  weight_grams?: number | null;
  image_url?: string | null;
  preferred_vendor_id?: string | null;
  vendor_upc?: string | null;
  min_qty_to_sell?: number | null;
  max_qty_to_sell?: number | null;
  qty_increment?: number;
  parent_product_id?: string | null;
  variant_label?: string | null;
}

export interface UpdateProductInput {
  name?: string;
  price_cents?: Cents;
  category?: string;
  tax_class?: TaxClass;
  barcode?: string | null;
  status?: ProductStatus;
  description?: string | null;
  brand?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  weight_grams?: number | null;
  image_url?: string | null;
  preferred_vendor_id?: string | null;
  vendor_upc?: string | null;
  min_qty_to_sell?: number | null;
  max_qty_to_sell?: number | null;
  qty_increment?: number;
  parent_product_id?: string | null;
  variant_label?: string | null;
}

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateCategoryInput {
  name: string;
  parent_id?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
  parent_id?: string | null;
}

export interface ListProductsQuery {
  category?: string;
  status?: ProductStatus;
  limit?: number;
  offset?: number;
  /** Exclude master/variant-parent rows (products referenced by another
   *  product's parent_product_id) — for sellable/browse lists (FE-7). */
  excludeMasters?: boolean;
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

  async create(input: CreateProductInput, tenantId: string): Promise<Product> {
    const existing = await this.db.one(
      "SELECT id FROM products WHERE tenant_id = @tenantId AND sku = @sku",
      { tenantId, sku: input.sku },
    );
    if (existing) {
      throw conflict(`product with sku '${input.sku}' already exists`);
    }

    if (input.parent_product_id) {
      await this.getOrThrow(input.parent_product_id, tenantId);
    }

    const now = Date.now();
    const category = input.category ?? "general";
    const product: Product = {
      id: `prod_${uuidv7()}`,
      tenant_id: tenantId,
      sku: input.sku,
      name: input.name,
      price_cents: input.price_cents,
      category,
      tax_class: resolveTaxClass(category, input.tax_class),
      barcode: input.barcode ?? null,
      status: input.status ?? "active",
      created_at: now,
      updated_at: now,
      description: input.description ?? null,
      brand: input.brand ?? null,
      length_mm: input.length_mm ?? null,
      width_mm: input.width_mm ?? null,
      height_mm: input.height_mm ?? null,
      weight_grams: input.weight_grams ?? null,
      image_url: input.image_url ?? null,
      preferred_vendor_id: input.preferred_vendor_id ?? null,
      vendor_upc: input.vendor_upc ?? null,
      min_qty_to_sell: input.min_qty_to_sell ?? null,
      max_qty_to_sell: input.max_qty_to_sell ?? null,
      qty_increment: input.qty_increment ?? 1,
      parent_product_id: input.parent_product_id ?? null,
      variant_label: input.variant_label ?? null,
    };

    try {
      await this.db.query(
        `INSERT INTO products
           (id, tenant_id, sku, name, price_cents, category, tax_class, barcode, status, created_at, updated_at,
            description, brand, length_mm, width_mm, height_mm, weight_grams, image_url,
            preferred_vendor_id, vendor_upc, min_qty_to_sell, max_qty_to_sell, qty_increment,
            parent_product_id, variant_label)
         VALUES
           (@id, @tenant_id, @sku, @name, @price_cents, @category, @tax_class, @barcode, @status, @created_at, @updated_at,
            @description, @brand, @length_mm, @width_mm, @height_mm, @weight_grams, @image_url,
            @preferred_vendor_id, @vendor_upc, @min_qty_to_sell, @max_qty_to_sell, @qty_increment,
            @parent_product_id, @variant_label)`,
        product as unknown as Record<string, unknown>,
      );
    } catch (err) {
      // The pre-check above handles the common case, but two concurrent creates
      // can both pass it and race to INSERT. The (tenant_id, sku) UNIQUE constraint
      // is the real guard: translate its violation (Postgres code 23505) into a clean
      // 409 instead of leaking a raw driver error as a 500.
      if (isUniqueViolation(err)) {
        throw conflict(`product with sku '${input.sku}' already exists`);
      }
      throw err;
    }

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

  async get(id: string, tenantId: string): Promise<Product | undefined> {
    return this.db.one<Product>(
      "SELECT * FROM products WHERE id = @id AND tenant_id = @tenantId",
      { id, tenantId },
    );
  }

  async getOrThrow(id: string, tenantId: string): Promise<Product> {
    const product = await this.get(id, tenantId);
    if (!product) throw notFound(`product '${id}' not found`);
    return product;
  }

  /** Bulk upsert products by (tenant_id, sku). Used for catalog import.
   *  Updates name/price/barcode/category on conflict; tenant-scoped. */
  async bulkImport(
    items: Array<{
      sku: string; name: string; priceCents: number; barcode?: string | null; category?: string;
      barcodes?: Array<{ barcode: string; kind?: string; packSize?: number }>;
    }>,
    tenantId: string,
  ): Promise<{ imported: number; barcodes: number }> {
    if (items.length === 0) return { imported: 0, barcodes: 0 };
    const now = Date.now();
    let barcodeCount = 0;
    await this.db.tx(async (tdb) => {
      for (const it of items) {
        const category = it.category && it.category.trim() ? it.category.trim() : "general";
        const taxClass = category.toLowerCase() === "groceries" ? "exempt" : "standard";
        const rows = await tdb.query<{ id: string }>(
          `INSERT INTO products (id, tenant_id, sku, name, price_cents, category, tax_class, barcode, status, created_at, updated_at)
           VALUES (@id, @t, @sku, @name, @price, @category, @tax, @barcode, 'active', @now, @now)
           ON CONFLICT (tenant_id, sku) DO UPDATE SET
             name = EXCLUDED.name, price_cents = EXCLUDED.price_cents,
             barcode = EXCLUDED.barcode, category = EXCLUDED.category, updated_at = EXCLUDED.updated_at
           RETURNING id`,
          { id: `prod_${uuidv7()}`, t: tenantId, sku: it.sku, name: it.name, price: Math.max(0, Math.round(it.priceCents)), category, tax: taxClass, barcode: it.barcode ?? null, now },
        );
        const productId = rows[0]?.id;
        if (!productId) continue;
        const allBarcodes = [
          ...(it.barcode ? [{ barcode: it.barcode, kind: "each", packSize: 1 }] : []),
          ...(it.barcodes ?? []),
        ];
        for (const b of allBarcodes) {
          if (!b.barcode) continue;
          const r = await tdb.query<{ barcode: string }>(
            `INSERT INTO product_barcodes (tenant_id, product_id, barcode, kind, pack_size)
             VALUES (@t, @pid, @bc, @kind, @ps)
             ON CONFLICT (tenant_id, barcode) DO NOTHING RETURNING barcode`,
            { t: tenantId, pid: productId, bc: b.barcode, kind: b.kind ?? "alt", ps: b.packSize ?? 1 },
          );
          barcodeCount += r.length;
        }
      }
    });
    return { imported: items.length, barcodes: barcodeCount };
  }

  /** Look up a sellable product by ANY of its UPCs (each/single/box/case/vendor),
   *  falling back to the legacy products.barcode column. Active products only. */
  async getByBarcode(barcode: string, tenantId: string): Promise<Product | undefined> {
    const viaTable = await this.db.one<Product>(
      `SELECT p.* FROM products p
         JOIN product_barcodes pb ON pb.product_id = p.id AND pb.tenant_id = p.tenant_id
        WHERE pb.tenant_id = @tenantId AND pb.barcode = @barcode AND p.status = 'active'
        LIMIT 1`,
      { tenantId, barcode },
    );
    if (viaTable) return viaTable;
    return this.db.one<Product>(
      "SELECT * FROM products WHERE tenant_id = @tenantId AND barcode = @barcode AND status = 'active' LIMIT 1",
      { tenantId, barcode },
    );
  }

  /** All UPCs registered for a product. */
  async listBarcodes(productId: string, tenantId: string): Promise<Array<{ barcode: string; kind: string; pack_size: number }>> {
    return this.db.query("SELECT barcode, kind, pack_size FROM product_barcodes WHERE tenant_id = @tenantId AND product_id = @productId ORDER BY kind", { tenantId, productId });
  }

  /** Register an additional UPC for a product. */
  async addBarcode(productId: string, barcode: string, kind: string, packSize: number, tenantId: string): Promise<void> {
    await this.getOrThrow(productId, tenantId); // ensure product exists in-tenant
    await this.db.query(
      `INSERT INTO product_barcodes (tenant_id, product_id, barcode, kind, pack_size) VALUES (@t,@pid,@bc,@kind,@ps)
       ON CONFLICT (tenant_id, barcode) DO UPDATE SET product_id = EXCLUDED.product_id, kind = EXCLUDED.kind, pack_size = EXCLUDED.pack_size`,
      { t: tenantId, pid: productId, bc: barcode, kind, ps: packSize },
    );
  }

  async list(query: ListProductsQuery = {}, tenantId: string): Promise<Page<Product>> {
    const limit = clampLimit(query.limit);
    const offset = query.offset && query.offset > 0 ? Math.floor(query.offset) : 0;

    const where: string[] = ["tenant_id = @tenantId"];
    const params: Record<string, unknown> = { tenantId };
    if (query.category) {
      where.push("category = @category");
      params.category = query.category;
    }
    if (query.status) {
      where.push("status = @status");
      params.status = query.status;
    }
    if (query.excludeMasters) {
      where.push("NOT EXISTS (SELECT 1 FROM products c WHERE c.tenant_id = products.tenant_id AND c.parent_product_id = products.id)");
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

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

  async update(id: string, input: UpdateProductInput, tenantId: string): Promise<Product> {
    const current = await this.getOrThrow(id, tenantId);

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

    if (input.parent_product_id) {
      if (input.parent_product_id === id) throw conflict("a product cannot be its own variant parent");
      await this.getOrThrow(input.parent_product_id, tenantId);
    }

    const detailFields = [
      "description", "brand", "length_mm", "width_mm", "height_mm", "weight_grams",
      "image_url", "preferred_vendor_id", "vendor_upc", "min_qty_to_sell", "max_qty_to_sell", "qty_increment",
      "parent_product_id", "variant_label",
    ] as const;
    for (const field of detailFields) {
      const value = input[field];
      if (value !== undefined && value !== current[field]) {
        (next as unknown as Record<string, unknown>)[field] = value;
        (changed as unknown as Record<string, unknown>)[field] = value;
      }
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
         description = @description,
         brand = @brand,
         length_mm = @length_mm,
         width_mm = @width_mm,
         height_mm = @height_mm,
         weight_grams = @weight_grams,
         image_url = @image_url,
         preferred_vendor_id = @preferred_vendor_id,
         vendor_upc = @vendor_upc,
         min_qty_to_sell = @min_qty_to_sell,
         max_qty_to_sell = @max_qty_to_sell,
         qty_increment = @qty_increment,
         parent_product_id = @parent_product_id,
         variant_label = @variant_label,
         updated_at = @updated_at
       WHERE id = @id`,
      next as unknown as Record<string, unknown>,
    );

    await this.events.publish("product.updated", { id: next.id, ...changed }, next.id);

    return next;
  }

  /** Soft delete: archive the product. */
  async archive(id: string, tenantId: string): Promise<Product> {
    return this.update(id, { status: "archived" }, tenantId);
  }

  async count(tenantId: string): Promise<number> {
    const row = await this.db.one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM products WHERE tenant_id = @tenantId",
      { tenantId },
    );
    return row?.n ?? 0;
  }

  /** Seed realistic demo products for tnt_demo on first init. Idempotent: only seeds when empty. */
  async seed(): Promise<void> {
    const DEMO_TENANT_ID = "tnt_demo";
    if ((await this.count(DEMO_TENANT_ID)) > 0) return;
    const demo: CreateProductInput[] = [
      { sku: "GRO-COFFEE-001", name: "Organic Dark Roast Beans", price_cents: 1499, category: "groceries", barcode: "0123456789012" },
      { sku: "GRO-HONEY-001", name: "Wildflower Honey", price_cents: 899, category: "groceries", barcode: "0123456789029" },
      { sku: "APP-TSHIRT-001", name: "Finder Logo T-Shirt", price_cents: 2200, category: "apparel", barcode: "0123456789036" },
      { sku: "HOME-MUG-001", name: "Ceramic Coffee Mug", price_cents: 1200, category: "home", barcode: "0123456789043" },
    ];
    for (const p of demo) {
      try {
        await this.create(p, DEMO_TENANT_ID);
      } catch {
        // Tolerate a concurrent seeder racing on the same SKU (cold-start races).
      }
    }
  }

  // ---- Bulk operations (BE-7) ----

  /** Apply the same field update to many products by id (manager-gated route). */
  async bulkUpdate(ids: string[], input: UpdateProductInput, tenantId: string): Promise<Product[]> {
    const updated: Product[] = [];
    for (const id of ids) {
      updated.push(await this.update(id, input, tenantId));
    }
    return updated;
  }

  /** All products for a tenant, for CSV export. Unpaginated (catalogs are small per tenant). */
  async listAll(tenantId: string): Promise<Product[]> {
    return this.db.query<Product>(
      "SELECT * FROM products WHERE tenant_id = @tenantId ORDER BY sku",
      { tenantId },
    );
  }

  /** Generate and register a barcode for each product that has none. Returns the
   *  ids that were assigned a new barcode (products that already had one are skipped). */
  async generateBarcodes(ids: string[], tenantId: string): Promise<Array<{ id: string; barcode: string }>> {
    const generated: Array<{ id: string; barcode: string }> = [];
    for (const id of ids) {
      const product = await this.getOrThrow(id, tenantId);
      const existing = await this.listBarcodes(id, tenantId);
      if (product.barcode || existing.length > 0) continue;
      const barcode = await this.nextBarcode(tenantId);
      await this.update(id, { barcode }, tenantId);
      await this.addBarcode(id, barcode, "each", 1, tenantId);
      generated.push({ id, barcode });
    }
    return generated;
  }

  /** Generate a fresh EAN-13 (GS1 "2" restricted-circulation prefix + random body + check digit),
   *  retrying on the rare collision with an existing barcode for this tenant. */
  private async nextBarcode(tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const body = `2${String(Math.floor(Math.random() * 1e11)).padStart(11, "0")}`;
      const candidate = body + ean13CheckDigit(body);
      const taken = await this.db.one(
        "SELECT 1 FROM product_barcodes WHERE tenant_id = @tenantId AND barcode = @barcode",
        { tenantId, barcode: candidate },
      );
      if (!taken) return candidate;
    }
    throw conflict("could not generate a unique barcode, try again");
  }

  // ---- Master/child variants (BE-8) ----

  /** Child products (variants) assigned to a master product. */
  async listVariants(masterId: string, tenantId: string): Promise<Product[]> {
    await this.getOrThrow(masterId, tenantId);
    return this.db.query<Product>(
      "SELECT * FROM products WHERE tenant_id = @tenantId AND parent_product_id = @masterId ORDER BY variant_label, sku",
      { tenantId, masterId },
    );
  }

  /** Bulk-assign the given products as children (variants) of a master product. */
  async assignVariants(masterId: string, productIds: string[], tenantId: string): Promise<void> {
    await this.getOrThrow(masterId, tenantId);
    for (const productId of productIds) {
      if (productId === masterId) throw conflict("a product cannot be its own variant parent");
      await this.update(productId, { parent_product_id: masterId }, tenantId);
    }
  }

  // ---- Category tree (BE-6) ----

  async listCategories(tenantId: string): Promise<Category[]> {
    return this.db.query<Category>(
      "SELECT * FROM categories WHERE tenant_id = @tenantId ORDER BY name",
      { tenantId },
    );
  }

  async getCategoryOrThrow(id: string, tenantId: string): Promise<Category> {
    const category = await this.db.one<Category>(
      "SELECT * FROM categories WHERE id = @id AND tenant_id = @tenantId",
      { id, tenantId },
    );
    if (!category) throw notFound(`category '${id}' not found`);
    return category;
  }

  async createCategory(input: CreateCategoryInput, tenantId: string): Promise<Category> {
    if (input.parent_id) await this.getCategoryOrThrow(input.parent_id, tenantId);
    const now = Date.now();
    const category: Category = {
      id: `cat_${uuidv7()}`,
      tenant_id: tenantId,
      name: input.name,
      parent_id: input.parent_id ?? null,
      created_at: now,
      updated_at: now,
    };
    await this.db.query(
      `INSERT INTO categories (id, tenant_id, name, parent_id, created_at, updated_at)
       VALUES (@id, @tenant_id, @name, @parent_id, @created_at, @updated_at)`,
      category as unknown as Record<string, unknown>,
    );
    return category;
  }

  async updateCategory(id: string, input: UpdateCategoryInput, tenantId: string): Promise<Category> {
    const current = await this.getCategoryOrThrow(id, tenantId);
    if (input.parent_id) {
      if (input.parent_id === id) throw conflict("a category cannot be its own parent");
      await this.getCategoryOrThrow(input.parent_id, tenantId);
    }
    const next: Category = {
      ...current,
      name: input.name ?? current.name,
      parent_id: input.parent_id !== undefined ? input.parent_id : current.parent_id,
      updated_at: Date.now(),
    };
    await this.db.query(
      `UPDATE categories SET name = @name, parent_id = @parent_id, updated_at = @updated_at WHERE id = @id`,
      next as unknown as Record<string, unknown>,
    );
    return next;
  }

  async deleteCategory(id: string, tenantId: string): Promise<void> {
    await this.getCategoryOrThrow(id, tenantId);
    await this.db.tx(async (tdb) => {
      await tdb.query("UPDATE categories SET parent_id = NULL WHERE tenant_id = @tenantId AND parent_id = @id", { tenantId, id });
      await tdb.query("DELETE FROM product_categories WHERE tenant_id = @tenantId AND category_id = @id", { tenantId, id });
      await tdb.query("DELETE FROM categories WHERE tenant_id = @tenantId AND id = @id", { tenantId, id });
    });
  }

  /** Category ids assigned to a product. */
  async listProductCategories(productId: string, tenantId: string): Promise<string[]> {
    const rows = await this.db.query<{ category_id: string }>(
      "SELECT category_id FROM product_categories WHERE tenant_id = @tenantId AND product_id = @productId",
      { tenantId, productId },
    );
    return rows.map((r) => r.category_id);
  }

  /** Replace the full set of categories assigned to a product. */
  async setProductCategories(productId: string, categoryIds: string[], tenantId: string): Promise<void> {
    await this.getOrThrow(productId, tenantId);
    for (const categoryId of categoryIds) {
      await this.getCategoryOrThrow(categoryId, tenantId);
    }
    await this.db.tx(async (tdb) => {
      await tdb.query("DELETE FROM product_categories WHERE tenant_id = @tenantId AND product_id = @productId", { tenantId, productId });
      for (const categoryId of categoryIds) {
        await tdb.query(
          `INSERT INTO product_categories (tenant_id, product_id, category_id) VALUES (@tenantId, @productId, @categoryId)
           ON CONFLICT DO NOTHING`,
          { tenantId, productId, categoryId },
        );
      }
    });
  }
}

/** EAN-13 check digit: sum digits from the right, alternating x1/x3 weights. */
function ean13CheckDigit(body12: string): string {
  let sum = 0;
  for (let i = 0; i < body12.length; i++) {
    const digit = Number(body12[body12.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return String((10 - (sum % 10)) % 10);
}

function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return 50;
  return Math.min(Math.floor(limit), 200);
}

/** Postgres signals a unique-constraint breach with SQLSTATE 23505. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "23505"
  );
}
