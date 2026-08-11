import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import type { Cents } from "../../shared/money.js";
import type { Page } from "../../shared/types.js";
import { notFound, conflict, badRequest } from "../../shared/http.js";
import { writeAudit } from "../../shared/audit.js";
import { recordUomBarcodeLookupFailed, recordPosBarcodeScan, recordPosBarcodeScanFailure, recordPosScanUnit } from "../../gateway/metrics.js";

export type TaxClass = "standard" | "exempt";
export type ProductStatus = "active" | "draft" | "archived";

export interface ProductImage {
  id: string;
  tenant_id: string;
  product_id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: number;
}

export interface ProductAttribute {
  id: string;
  tenant_id: string;
  name: string;
  data_type: string;
  is_filterable: boolean;
  is_variant_option: boolean;
  created_at: number;
  updated_at: number;
}

/** Sales channel a variant order applies to (independent online vs offline order). */
export type VariantChannel = "online" | "offline";
/** How a master's variants are ordered for a channel. */
export type VariantSortMode = "default" | "manual" | "price_asc" | "price_desc" | "name_asc" | "name_desc";

export const VARIANT_SORT_MODES: readonly VariantSortMode[] = ["default", "manual", "price_asc", "price_desc", "name_asc", "name_desc"];

/** Which money field a bulk price adjustment targets. */
export type PriceTarget = "selling" | "cost";
/** Bulk price adjustment operation. `value` is a percent (pct ops), cents (amount/set), or unused (round). */
export type PriceOp = "inc_pct" | "dec_pct" | "inc_amount" | "dec_amount" | "set" | "round_99" | "round_95";
export const PRICE_OPS: readonly PriceOp[] = ["inc_pct", "dec_pct", "inc_amount", "dec_amount", "set", "round_99", "round_95"];

// Price-op math lives in SQL now (priceOpExpr) so bulk adjustments run as one
// set-based UPDATE — semantics unchanged: round to nearest cent, clamp >= 0.

/** SQL ORDER BY clause for each sort mode. `manual` uses the channel's sort_order column. */
function variantOrderBy(mode: VariantSortMode, orderCol: string): string {
  switch (mode) {
    case "manual": return `${orderCol} ASC, variant_label ASC, sku ASC`;
    case "price_asc": return "price_cents ASC, variant_label ASC";
    case "price_desc": return "price_cents DESC, variant_label ASC";
    case "name_asc": return "name ASC, sku ASC";
    case "name_desc": return "name DESC, sku ASC";
    default: return "variant_label ASC, sku ASC";
  }
}

const UNIT_DISPLAY_NAME: Record<string, string> = { each: "Each", box: "Box", case: "Case", pallet: "Pallet", alt: "Alternate" };

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
  // Core descriptive fields
  description: string | null;
  short_description: string | null;
  full_description: string | null;
  alternative_name: string | null;
  model_name: string | null;
  manufacturer: string | null;
  brand: string | null;
  tags: string | null;             // comma-separated
  url_alias: string | null;
  // Pricing
  msrp_cents: Cents | null;
  min_selling_price_cents: Cents | null;
  raw_cost_price_cents: Cents | null;
  wholesale_price_cents: Cents | null;
  enterprise_price_cents: Cents | null;
  // Physical dimensions
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  weight_grams: number | null;
  size: string | null;
  unit_description: string | null;  // "each", "pack of 12", etc.
  nicotine_strength_mg: number | null;
  volume_ml: number | null;
  oz_per_product_x100: number | null; // ounces × 100 (supports 1.5oz = 150)
  // Images & media
  image_url: string | null;
  // Compliance / regulatory
  state_description: string | null;
  federal_description: string | null;
  msa_category_code: string | null;
  msa_promotion_indicator: number;  // 1|0
  msa_promotion_description: string | null;
  msa_manufacturer_description: string | null;
  // SEO
  meta_title: string | null;
  meta_keywords: string | null;
  meta_description: string | null;
  // Vendor / supply chain
  preferred_vendor_id: string | null;
  preferred_vendor_name: string | null;
  primary_vendor: string | null;
  vendor_upc: string | null;
  drop_shipment: number;    // 1|0
  reorder_quantity: number | null;
  // Qty limits
  min_qty_to_sell: number | null;
  max_qty_to_sell: number | null;
  qty_increment: number;
  // Variant / master
  parent_product_id: string | null;
  variant_label: string | null;
  variant_options: string | null; // canonical JSON of the attribute map, e.g. {"Size":"S"}
  // BE-22: regulated product compliance
  tobacco_type: string | null;
  flavored: number;        // 1|0
  menthol: number;         // 1|0
  msa_reportable: number;  // 1|0
  restricted_states: string | null;  // JSON array e.g. '["CA","MA"]'
  // Operational flags (1|0)
  age_restricted: number;
  returnable: number;
  service_product: number;
  customer_specific: number;
  exclude_from_po: number;
  composite_product: number;
  track_inventory: number;
  track_inventory_by_imei: number;
  // Ecommerce visibility (owned by ecommerce module, stored on products)
  ecommerce: number;
  // Variant sorting — manual drag order per channel; sort mode lives on the master.
  online_sort_order: number;
  offline_sort_order: number;
  online_variant_sort: VariantSortMode;
  offline_variant_sort: VariantSortMode;
  // Expiry — denormalized MIN(lot.expiry_date) written by InventoryService.syncProductExpiry()
  expiry_date: number | null;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  price_cents: Cents;
  category?: string;
  tax_class?: TaxClass;
  barcode?: string | null;
  status?: ProductStatus;
  // Descriptive
  description?: string | null;
  short_description?: string | null;
  full_description?: string | null;
  alternative_name?: string | null;
  model_name?: string | null;
  manufacturer?: string | null;
  brand?: string | null;
  tags?: string | null;
  url_alias?: string | null;
  // Pricing
  msrp_cents?: Cents | null;
  min_selling_price_cents?: Cents | null;
  raw_cost_price_cents?: Cents | null;
  wholesale_price_cents?: Cents | null;
  enterprise_price_cents?: Cents | null;
  // Physical
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  weight_grams?: number | null;
  size?: string | null;
  unit_description?: string | null;
  nicotine_strength_mg?: number | null;
  volume_ml?: number | null;
  oz_per_product_x100?: number | null;
  // Media
  image_url?: string | null;
  // Compliance
  state_description?: string | null;
  federal_description?: string | null;
  msa_category_code?: string | null;
  msa_promotion_indicator?: boolean;
  msa_promotion_description?: string | null;
  msa_manufacturer_description?: string | null;
  // SEO
  meta_title?: string | null;
  meta_keywords?: string | null;
  meta_description?: string | null;
  // Vendor
  preferred_vendor_id?: string | null;
  preferred_vendor_name?: string | null;
  primary_vendor?: string | null;
  vendor_upc?: string | null;
  drop_shipment?: boolean;
  reorder_quantity?: number | null;
  // Qty limits
  min_qty_to_sell?: number | null;
  max_qty_to_sell?: number | null;
  qty_increment?: number;
  // Variant
  parent_product_id?: string | null;
  variant_label?: string | null;
  variant_options?: string | null;
  // Flags
  age_restricted?: boolean;
  returnable?: boolean;
  service_product?: boolean;
  customer_specific?: boolean;
  exclude_from_po?: boolean;
  composite_product?: boolean;
  track_inventory?: boolean;
  track_inventory_by_imei?: boolean;
  // Ecommerce visibility flag
  ecommerce?: boolean;
}

export interface CreateVariantInput {
  variant_label: string;
  upc: string;
  sku: string;
  selling_price_cents: Cents;
  category: string;
}

// UpdateProductInput mirrors CreateProductInput, all fields optional. `sku` may be
// changed (guarded by the tenant-unique constraint) — needed for the variant setup
// wizard's SKU assignment step.
export type UpdateProductInput = Partial<CreateProductInput>;

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

/**
 * Where a product sits in the master/variant tree. `master` = has at least one
 * child; `variant` = has a parent; `standalone` = neither. Derived, not stored —
 * the list computes it in SQL so the filter is catalog-wide rather than
 * page-wide (the frontend used to derive it from the loaded page, which made a
 * master whose children happened to be on another page read as standalone).
 */
export type ProductTypeFilter = "standalone" | "master" | "variant";
export const PRODUCT_TYPE_FILTERS: readonly ProductTypeFilter[] = ["standalone", "master", "variant"];

/**
 * Sort columns the product list exposes. `relevance` is only meaningful with a
 * search term and falls back to `name` without one. Whitelisted rather than
 * interpolated so a sort key can never reach SQL unchecked.
 */
export type ProductSort =
  | "relevance" | "name" | "sku" | "price_cents" | "category" | "brand"
  | "status" | "created_at" | "updated_at" | "cost";
export const PRODUCT_SORTS: readonly ProductSort[] = [
  "relevance", "name", "sku", "price_cents", "category", "brand",
  "status", "created_at", "updated_at", "cost",
];

export type SortDir = "asc" | "desc";

export interface ListProductsQuery {
  category?: string;
  status?: ProductStatus;
  limit?: number;
  offset?: number;
  /** Exclude master/variant-parent rows (products referenced by another
   *  product's parent_product_id) — for sellable/browse lists (FE-7). */
  excludeMasters?: boolean;
  /** Free-text search across identity, brand and every registered barcode. */
  q?: string;
  /**
   * Narrow `q` to one column ("Search → SKU"). Defaults to `all`.
   *
   * Without this the list UI's column selector would be decorative — the
   * server would search every column whatever the user picked.
   */
  searchField?: ProductSearchField;
  brand?: string;
  taxClass?: TaxClass;
  ageRestricted?: boolean;
  minPriceCents?: number;
  maxPriceCents?: number;
  productType?: ProductTypeFilter;
  /** Matches the preferred vendor id/name or any linked supplier id. */
  supplier?: string;
  /**
   * Only products with no parent — masters and standalone products, never a
   * child variant. The complement of `excludeMasters`, and what a browse grid
   * wants: one card per product family. Without it, paginating a catalog can
   * separate a variant from its master, and a card built by grouping children
   * under their parent drops the orphan silently.
   */
  topLevel?: boolean;
  /** Only products flagged for the online storefront. */
  ecommerce?: boolean;
  sort?: ProductSort;
  dir?: SortDir;
}

/**
 * A product row as the list returns it: the stored product plus how many
 * variants hang off it.
 *
 * The count is here because "is this a master?" is not answerable from a single
 * row, and the catalog UI previously guessed by looking at which other products
 * shared the loaded page — so a master whose children sorted onto page 2
 * displayed as a standalone product.
 */
export interface ProductListItem extends Product {
  variant_count: number;
}

/** One facet bucket: a value the catalog actually contains, and how many rows have it. */
export interface FacetBucket {
  value: string;
  count: number;
}

/**
 * Data-driven filter options for the *current* query context. Every bucket is
 * computed from the rows that match the other active filters, so the filter UI
 * can only ever offer refinements that return something, and the counts are
 * catalog-wide instead of page-wide.
 */
export interface ProductFacets {
  total: number;
  status: FacetBucket[];
  productType: FacetBucket[];
  category: FacetBucket[];
  brand: FacetBucket[];
  supplier: FacetBucket[];
  taxClass: FacetBucket[];
  ageRestricted: number;
  ecommerce: number;
  priceRange: { min: number; max: number } | null;
}

export interface VariantAttributeInput {
  name: string;
  values: string[];
}

/** One price change (selling or cost), written by update(); append-only. */
export interface PriceHistoryEntry {
  id: string;
  tenant_id: string;
  product_id: string;
  field: "selling" | "cost";
  old_price_cents: number | null;
  new_price_cents: number;
  changed_at: number;
}

interface MutationOptions {
  publishEvent?: boolean;
  /** User id for the audit trail (product-detail Audit Log tab). Defaults to
   *  "system" for internal/non-interactive callers (e.g. variant cascades). */
  actorId?: string;
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

function variantCombinations(groups: string[][]): string[][] {
  return groups.reduce<string[][]>(
    (acc, group) => acc.flatMap((combo) => group.map((value) => [...combo, value])),
    [[]],
  );
}

/**
 * The one separator used between variant attribute values everywhere in the app
 * (labels and generated names). A single space — values read together with no
 * dash/slash/pipe. A variant's display name is `${master.name}${SEP}${values.join(SEP)}`,
 * e.g. "Tee Small Red".
 */
export const VARIANT_SEPARATOR = " ";

/** Ordered attribute name -> value map that identifies a variant (e.g. {Size:"S"}). */
export type VariantOptions = Record<string, string>;

/** Build the display label for an attribute-value combination, in attribute order. */
function variantLabelFrom(values: string[]): string {
  return values.join(VARIANT_SEPARATOR);
}

/** Full variant name: master name joined to the value label by the shared separator. */
function variantNameFrom(masterName: string, values: string[]): string {
  return values.length ? `${masterName}${VARIANT_SEPARATOR}${variantLabelFrom(values)}` : masterName;
}

/**
 * Order-independent identity for a variant: the sorted (name,value) pairs as JSON.
 * Two combos with the same attribute→value mapping share a signature regardless of
 * attribute order, so re-ordering attributes never spawns a duplicate variant.
 */
function optionsSignature(options: VariantOptions): string {
  const entries = Object.entries(options)
    .map(([k, v]) => [k.trim().toLowerCase(), String(v).trim().toLowerCase()] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(entries);
}

/** Fallback identity for legacy variants that predate `variant_options`: the sorted,
 *  lowercased set of values parsed from the display label (old separators included). */
function valuesKey(values: string[]): string {
  return JSON.stringify(values.map((v) => v.trim().toLowerCase()).sort());
}

/** Parse a legacy variant_label ("S / Red", "S - Red", "S | Red") into its values. */
function parseLegacyLabel(label: string | null): string[] {
  if (!label) return [];
  return label.split(/\s*[/|\-]\s*/).map((s) => s.trim()).filter(Boolean);
}

function parseVariantOptions(raw: string | null): VariantOptions | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as VariantOptions;
    }
  } catch { /* malformed — treat as absent */ }
  return null;
}

function skuToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export class CatalogService {
  constructor(
    private readonly db: DB,
    private readonly events: EventBus,
  ) {}

  async create(input: CreateProductInput, tenantId: string, options: MutationOptions = {}): Promise<Product> {
    const existing = await this.db.one(
      "SELECT id FROM products WHERE tenant_id = @tenantId AND sku = @sku",
      { tenantId, sku: input.sku },
    );
    if (existing) {
      throw conflict(`product with sku '${input.sku}' already exists`);
    }

    const now = Date.now();
    const category = input.category ?? "general";
    const id = `prod_${uuidv7()}`;
    await this.assertCanBecomeVariant(id, input.parent_product_id ?? null, tenantId);
    const product: Product = {
      id,
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
      // Descriptive
      description: input.description ?? null,
      short_description: input.short_description ?? null,
      full_description: input.full_description ?? null,
      alternative_name: input.alternative_name ?? null,
      model_name: input.model_name ?? null,
      manufacturer: input.manufacturer ?? null,
      brand: input.brand ?? null,
      tags: input.tags ?? null,
      url_alias: input.url_alias ?? null,
      // Pricing
      msrp_cents: input.msrp_cents ?? null,
      min_selling_price_cents: input.min_selling_price_cents ?? null,
      raw_cost_price_cents: input.raw_cost_price_cents ?? null,
      wholesale_price_cents: input.wholesale_price_cents ?? null,
      enterprise_price_cents: input.enterprise_price_cents ?? null,
      // Physical
      length_mm: input.length_mm ?? null,
      width_mm: input.width_mm ?? null,
      height_mm: input.height_mm ?? null,
      weight_grams: input.weight_grams ?? null,
      size: input.size ?? null,
      unit_description: input.unit_description ?? null,
      nicotine_strength_mg: input.nicotine_strength_mg ?? null,
      volume_ml: input.volume_ml ?? null,
      oz_per_product_x100: input.oz_per_product_x100 ?? null,
      // Media
      image_url: input.image_url ?? null,
      // Compliance
      state_description: input.state_description ?? null,
      federal_description: input.federal_description ?? null,
      msa_category_code: input.msa_category_code ?? null,
      msa_promotion_indicator: input.msa_promotion_indicator ? 1 : 0,
      msa_promotion_description: input.msa_promotion_description ?? null,
      msa_manufacturer_description: input.msa_manufacturer_description ?? null,
      // SEO
      meta_title: input.meta_title ?? null,
      meta_keywords: input.meta_keywords ?? null,
      meta_description: input.meta_description ?? null,
      // Vendor
      preferred_vendor_id: input.preferred_vendor_id ?? null,
      preferred_vendor_name: input.preferred_vendor_name ?? null,
      primary_vendor: input.primary_vendor ?? null,
      vendor_upc: input.vendor_upc ?? null,
      drop_shipment: input.drop_shipment ? 1 : 0,
      reorder_quantity: input.reorder_quantity ?? null,
      // Qty limits
      min_qty_to_sell: input.min_qty_to_sell ?? null,
      max_qty_to_sell: input.max_qty_to_sell ?? null,
      qty_increment: input.qty_increment ?? 1,
      // Variant
      parent_product_id: input.parent_product_id ?? null,
      variant_label: input.variant_label ?? null,
      variant_options: input.variant_options ?? null,
      online_sort_order: 0,
      offline_sort_order: 0,
      online_variant_sort: "default",
      offline_variant_sort: "default",
      // BE-22: regulated compliance
      tobacco_type: null,
      flavored: 0,
      menthol: 0,
      msa_reportable: 0,
      restricted_states: null,
      // Flags
      age_restricted: input.age_restricted ? 1 : 0,
      returnable: input.returnable !== false ? 1 : 0,
      service_product: input.service_product ? 1 : 0,
      customer_specific: input.customer_specific ? 1 : 0,
      exclude_from_po: input.exclude_from_po ? 1 : 0,
      composite_product: input.composite_product ? 1 : 0,
      track_inventory: input.track_inventory !== false ? 1 : 0,
      track_inventory_by_imei: input.track_inventory_by_imei ? 1 : 0,
      ecommerce: input.ecommerce ? 1 : 0,
      // Expiry cache — null on create; written by InventoryService.syncProductExpiry()
      expiry_date: null,
    };

    try {
      await this.db.query(
        `INSERT INTO products
           (id, tenant_id, sku, name, price_cents, category, tax_class, barcode, status, created_at, updated_at,
            description, short_description, full_description, alternative_name, model_name, manufacturer, brand, tags, url_alias,
            msrp_cents, min_selling_price_cents, raw_cost_price_cents, wholesale_price_cents, enterprise_price_cents,
            length_mm, width_mm, height_mm, weight_grams, size, unit_description, nicotine_strength_mg, volume_ml, oz_per_product_x100,
            image_url,
            state_description, federal_description, msa_category_code, msa_promotion_indicator, msa_promotion_description, msa_manufacturer_description,
            meta_title, meta_keywords, meta_description,
            preferred_vendor_id, preferred_vendor_name, primary_vendor, vendor_upc, drop_shipment, reorder_quantity,
            min_qty_to_sell, max_qty_to_sell, qty_increment,
            parent_product_id, variant_label, variant_options,
            age_restricted, returnable, service_product, customer_specific, exclude_from_po, composite_product, track_inventory, track_inventory_by_imei, ecommerce,
            tobacco_type, flavored, menthol, msa_reportable, restricted_states)
         VALUES
           (@id, @tenant_id, @sku, @name, @price_cents, @category, @tax_class, @barcode, @status, @created_at, @updated_at,
            @description, @short_description, @full_description, @alternative_name, @model_name, @manufacturer, @brand, @tags, @url_alias,
            @msrp_cents, @min_selling_price_cents, @raw_cost_price_cents, @wholesale_price_cents, @enterprise_price_cents,
            @length_mm, @width_mm, @height_mm, @weight_grams, @size, @unit_description, @nicotine_strength_mg, @volume_ml, @oz_per_product_x100,
            @image_url,
            @state_description, @federal_description, @msa_category_code, @msa_promotion_indicator, @msa_promotion_description, @msa_manufacturer_description,
            @meta_title, @meta_keywords, @meta_description,
            @preferred_vendor_id, @preferred_vendor_name, @primary_vendor, @vendor_upc, @drop_shipment, @reorder_quantity,
            @min_qty_to_sell, @max_qty_to_sell, @qty_increment,
            @parent_product_id, @variant_label, @variant_options,
            @age_restricted, @returnable, @service_product, @customer_specific, @exclude_from_po, @composite_product, @track_inventory, @track_inventory_by_imei, @ecommerce,
            @tobacco_type, @flavored, @menthol, @msa_reportable, @restricted_states)`,
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

    if (options.publishEvent !== false) {
      await this.publishProductCreated(product);
    }

    await writeAudit(this.db, {
      tenantId, actorId: options.actorId ?? "system", action: "product.created",
      entityType: "product", entityId: id, after: { sku: product.sku, name: product.name, price_cents: product.price_cents },
    });

    return product;
  }

  private async publishProductCreated(product: Product): Promise<void> {
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
    await this.db.withTenant(tenantId).tx(async (tdb) => {
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
   *  falling back to the legacy products.barcode column. Active products only.
   *  Includes which unit the scanned code was (`kind`) and its pack size, so a
   *  caller (e.g. the POS terminal) can multiply the sale quantity by pack size
   *  instead of always selling 1 each — a scan of a case barcode previously
   *  resolved to the right product but discarded the fact it was a case. */
  async getByBarcode(barcode: string, tenantId: string): Promise<(Product & { scanned_unit_kind: string; scanned_pack_size: number }) | undefined> {
    const viaTable = await this.db.one<Product & { scanned_unit_kind: string; scanned_pack_size: number }>(
      `SELECT p.*, pb.kind AS scanned_unit_kind, pb.pack_size AS scanned_pack_size
         FROM products p
         JOIN product_barcodes pb ON pb.product_id = p.id AND pb.tenant_id = p.tenant_id
        WHERE pb.tenant_id = @tenantId AND pb.barcode = @barcode AND p.status = 'active'
        LIMIT 1`,
      { tenantId, barcode },
    );
    if (viaTable) return viaTable;
    const viaLegacy = await this.db.one<Product>(
      "SELECT * FROM products WHERE tenant_id = @tenantId AND barcode = @barcode AND status = 'active' LIMIT 1",
      { tenantId, barcode },
    );
    if (viaLegacy) return { ...viaLegacy, scanned_unit_kind: "each", scanned_pack_size: 1 };
    recordUomBarcodeLookupFailed();
    return undefined;
  }

  /**
   * POS scan resolution (ADR-006/POS-v1): everything the terminal needs to
   * add a cart line and price it, fully resolved server-side — the terminal
   * does no conversion or pricing math itself. Wraps getByBarcode (product +
   * scanned unit) with the unit's selling price (each price × pack size —
   * no tiered/promotional pricing here, that's explicitly out of scope) and
   * current stock (a cross-domain read of `inventory`, the accepted ADR-002
   * pattern). When no packaging unit was scanned (legacy/each barcode), this
   * reduces to today's implicit behavior: packaging.unit "each", packSize 1,
   * pricing = the product's normal price — existing barcode workflows are
   * unaffected.
   */
  async resolvePosBarcode(barcode: string, tenantId: string): Promise<(Product & {
    packaging: { unit: string; displayName: string; packSize: number };
    pricing: { unitPriceCents: number };
    inventory: { baseQuantityPerUnit: number; stockOnHandEach: number; availableForSale: boolean };
  }) | undefined> {
    recordPosBarcodeScan();
    const product = await this.getByBarcode(barcode, tenantId);
    if (!product) {
      recordPosBarcodeScanFailure();
      return undefined;
    }
    recordPosScanUnit(product.scanned_unit_kind);
    const stockRow = await this.db.one<{ stock_qty: number }>(
      "SELECT stock_qty FROM inventory WHERE tenant_id = @tenantId AND product_id = @productId",
      { tenantId, productId: product.id },
    );
    const stockOnHandEach = stockRow ? Number(stockRow.stock_qty) : 0;
    // Full product fields (age/tax/status/etc.) stay flat, exactly like the
    // plain /barcode/:code response the terminal already knows how to read —
    // packaging/pricing/inventory are additive, POS-specific enrichment.
    return {
      ...product,
      packaging: {
        unit: product.scanned_unit_kind,
        displayName: UNIT_DISPLAY_NAME[product.scanned_unit_kind] ?? product.scanned_unit_kind,
        packSize: product.scanned_pack_size,
      },
      pricing: {
        unitPriceCents: product.price_cents * product.scanned_pack_size,
      },
      inventory: {
        baseQuantityPerUnit: product.scanned_pack_size,
        stockOnHandEach,
        availableForSale: stockOnHandEach >= product.scanned_pack_size,
      },
    };
  }

  private async assertBarcodeAvailable(barcode: string, tenantId: string, exceptProductId?: string): Promise<void> {
    const normalized = barcode.trim();
    if (!normalized) return;
    const existing = await this.db.one<{ id: string }>(
      `SELECT p.id
         FROM products p
        WHERE p.tenant_id = @tenantId
          AND p.barcode = @barcode
          AND (@exceptProductId::text IS NULL OR p.id <> @exceptProductId)
        UNION
       SELECT pb.product_id AS id
         FROM product_barcodes pb
        WHERE pb.tenant_id = @tenantId
          AND pb.barcode = @barcode
          AND (@exceptProductId::text IS NULL OR pb.product_id <> @exceptProductId)
        LIMIT 1`,
      { tenantId, barcode: normalized, exceptProductId: exceptProductId ?? null },
    );
    if (existing) {
      throw conflict(`barcode '${normalized}' is already assigned to another product`);
    }
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

  /**
   * Compose the WHERE clause shared by `list()` and `listFacets()`.
   *
   * Both must read the same rows or the counts shown beside a result set would
   * describe a different set than the one on screen. `omit` lets the facet pass
   * drop one dimension so that dimension's own buckets stay visible — the
   * standard faceted-search behaviour where picking "Beverages" still shows you
   * how many Snacks there are to switch to.
   */
  private buildListWhere(
    query: ListProductsQuery,
    tenantId: string,
    omit?: keyof ListProductsQuery,
  ): { whereSql: string; params: Record<string, unknown>; rank: string | null } {
    const where: string[] = ["products.tenant_id = @tenantId"];
    const params: Record<string, unknown> = { tenantId };
    const use = (field: keyof ListProductsQuery) => omit !== field;

    let rank: string | null = null;
    if (query.q && use("q")) {
      const search = buildProductSearch(query.q, tenantId, params, query.searchField ?? "all");
      if (search) {
        where.push(`(${search.predicate})`);
        rank = search.rank;
      }
    }
    if (query.category && use("category")) {
      where.push("products.category = @category");
      params.category = query.category;
    }
    if (query.status && use("status")) {
      where.push("products.status = @status");
      params.status = query.status;
    }
    if (query.brand && use("brand")) {
      where.push("products.brand ILIKE @brand");
      params.brand = `%${escapeLike(query.brand)}%`;
    }
    if (query.taxClass && use("taxClass")) {
      where.push("products.tax_class = @taxClass");
      params.taxClass = query.taxClass;
    }
    if (query.ageRestricted && use("ageRestricted")) {
      where.push("products.age_restricted = 1");
    }
    if (query.ecommerce && use("ecommerce")) {
      where.push("products.ecommerce = 1");
    }
    if (query.minPriceCents !== undefined && use("minPriceCents")) {
      where.push("products.price_cents >= @minPriceCents");
      params.minPriceCents = query.minPriceCents;
    }
    if (query.maxPriceCents !== undefined && use("maxPriceCents")) {
      where.push("products.price_cents <= @maxPriceCents");
      params.maxPriceCents = query.maxPriceCents;
    }
    if (query.productType && use("productType")) {
      where.push(`(${productTypePredicate(query.productType)})`);
    }
    if (query.supplier && use("supplier")) {
      where.push(
        `(products.preferred_vendor_id = @supplierId
          OR products.preferred_vendor_name ILIKE @supplierLike
          OR products.primary_vendor ILIKE @supplierLike
          OR EXISTS (SELECT 1 FROM product_suppliers psf
                      WHERE psf.tenant_id = products.tenant_id
                        AND psf.product_id = products.id
                        AND psf.supplier_id = @supplierId))`,
      );
      params.supplierId = query.supplier;
      params.supplierLike = `%${escapeLike(query.supplier)}%`;
    }
    if (query.topLevel && use("topLevel")) {
      where.push("products.parent_product_id IS NULL");
    }
    if (query.excludeMasters && use("excludeMasters")) {
      where.push("NOT EXISTS (SELECT 1 FROM products c WHERE c.tenant_id = products.tenant_id AND c.parent_product_id = products.id)");
    }

    return { whereSql: `WHERE ${where.join(" AND ")}`, params, rank };
  }

  async list(query: ListProductsQuery = {}, tenantId: string): Promise<Page<ProductListItem>> {
    const limit = clampLimit(query.limit);
    const offset = query.offset && query.offset > 0 ? Math.floor(query.offset) : 0;

    const { whereSql, params, rank } = this.buildListWhere(query, tenantId);

    const totalRow = await this.db.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM products ${whereSql}`,
      params,
    );
    const total = totalRow?.n ?? 0;

    // The rank expression is inlined into ORDER BY rather than selected, so the
    // rows keep their table shape apart from the one column we mean to add — no
    // internal scoring value leaks into the API response. The variant count is a
    // correlated subquery over products_tenant_parent_idx, bounded by LIMIT.
    const rows = await this.db.query<ProductListItem>(
      `SELECT products.*,
              (SELECT COUNT(*) FROM products kids
                WHERE kids.tenant_id = products.tenant_id
                  AND kids.parent_product_id = products.id) AS variant_count
         FROM products ${whereSql}
        ORDER BY ${productOrderBy(query.sort, query.dir, rank)}
        LIMIT @limit OFFSET @offset`,
      { ...params, limit, offset },
    );
    // COUNT() arrives as a string from node-postgres for BIGINT-typed results.
    const items = rows.map((r) => ({ ...r, variant_count: Number(r.variant_count) }));

    return { items, total, limit, offset };
  }

  /**
   * Filter options for the current query, counted over the whole matching set.
   *
   * This exists because the catalog header used to count statuses and product
   * types from the rows React happened to be holding — correct only while the
   * catalog fit on one page, and quietly wrong after that. Each dimension omits
   * its own filter (see `buildListWhere`) so selecting a value doesn't collapse
   * that facet to a single bucket.
   */
  async listFacets(query: ListProductsQuery, tenantId: string): Promise<ProductFacets> {
    const base = this.buildListWhere(query, tenantId);

    const bucketsFor = async (
      column: string,
      omit: keyof ListProductsQuery,
      limit: number,
    ): Promise<FacetBucket[]> => {
      const scoped = this.buildListWhere(query, tenantId, omit);
      const rows = await this.db.query<{ value: string | null; n: number }>(
        `SELECT ${column} AS value, COUNT(*) AS n
           FROM products ${scoped.whereSql}
          GROUP BY ${column}
          HAVING ${column} IS NOT NULL AND ${column} <> ''
          ORDER BY COUNT(*) DESC, ${column} ASC
          LIMIT ${limit}`,
        scoped.params,
      );
      return rows.map((r) => ({ value: String(r.value), count: Number(r.n) }));
    };

    const typeScoped = this.buildListWhere(query, tenantId, "productType");
    const [totalRow, status, category, brand, supplier, taxClass, flags, price, typeRow] = await Promise.all([
      this.db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM products ${base.whereSql}`, base.params),
      bucketsFor("products.status", "status", 10),
      bucketsFor("products.category", "category", 40),
      bucketsFor("products.brand", "brand", 40),
      bucketsFor("products.preferred_vendor_name", "supplier", 40),
      bucketsFor("products.tax_class", "taxClass", 10),
      this.db.one<{ restricted: number; online: number }>(
        `SELECT COALESCE(SUM(CASE WHEN products.age_restricted = 1 THEN 1 ELSE 0 END), 0) AS restricted,
                COALESCE(SUM(CASE WHEN products.ecommerce = 1 THEN 1 ELSE 0 END), 0) AS online
           FROM products ${base.whereSql}`,
        base.params,
      ),
      this.db.one<{ lo: number | null; hi: number | null }>(
        `SELECT MIN(products.price_cents) AS lo, MAX(products.price_cents) AS hi FROM products ${base.whereSql}`,
        base.params,
      ),
      this.db.one<{ standalone: number; master: number; variant: number }>(
        `SELECT
           COALESCE(SUM(CASE WHEN ${productTypePredicate("standalone")} THEN 1 ELSE 0 END), 0) AS standalone,
           COALESCE(SUM(CASE WHEN ${productTypePredicate("master")}     THEN 1 ELSE 0 END), 0) AS master,
           COALESCE(SUM(CASE WHEN ${productTypePredicate("variant")}    THEN 1 ELSE 0 END), 0) AS variant
         FROM products ${typeScoped.whereSql}`,
        typeScoped.params,
      ),
    ]);

    const productType: FacetBucket[] = [
      { value: "standalone", count: Number(typeRow?.standalone ?? 0) },
      { value: "master", count: Number(typeRow?.master ?? 0) },
      { value: "variant", count: Number(typeRow?.variant ?? 0) },
    ];

    return {
      total: Number(totalRow?.n ?? 0),
      status,
      productType,
      category,
      brand,
      supplier,
      taxClass,
      ageRestricted: Number(flags?.restricted ?? 0),
      ecommerce: Number(flags?.online ?? 0),
      priceRange: price?.lo != null && price?.hi != null
        ? { min: Number(price.lo), max: Number(price.hi) }
        : null,
    };
  }

  async update(id: string, input: UpdateProductInput, tenantId: string, options: MutationOptions = {}): Promise<Product> {
    const current = await this.getOrThrow(id, tenantId);

    const next: Product = { ...current };
    const changed: Partial<Product> = {};

    // SKU may be reassigned (e.g. the variant setup wizard). Guard against collisions
    // with a pre-check; the (tenant_id, sku) UNIQUE constraint is the real backstop.
    if (input.sku !== undefined && input.sku.trim() && input.sku !== current.sku) {
      const clash = await this.db.one<{ id: string }>(
        "SELECT id FROM products WHERE tenant_id = @t AND sku = @sku AND id <> @id",
        { t: tenantId, sku: input.sku, id },
      );
      if (clash) throw conflict(`product with sku '${input.sku}' already exists`);
      next.sku = input.sku;
      changed.sku = input.sku;
    }

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

    // Category. A child variant always inherits its master's category and cannot be
    // set to a different one — so if this product is (or is becoming) a variant,
    // coerce the category to the master's regardless of the requested value.
    const parentId = input.parent_product_id !== undefined ? (input.parent_product_id ?? null) : current.parent_product_id;
    let nextCategory = input.category ?? current.category;
    if (parentId) {
      const master = await this.db.one<{ category: string }>(
        "SELECT category FROM products WHERE id = @p AND tenant_id = @t",
        { p: parentId, t: tenantId },
      );
      if (master) nextCategory = master.category;
    }
    if (nextCategory !== current.category) {
      next.category = nextCategory;
      changed.category = nextCategory;
    }
    const resolvedTax = resolveTaxClass(nextCategory, input.tax_class ?? current.tax_class);
    if (resolvedTax !== current.tax_class) {
      next.tax_class = resolvedTax;
      changed.tax_class = resolvedTax;
    }

    if (input.parent_product_id !== undefined) {
      await this.assertCanBecomeVariant(id, input.parent_product_id ?? null, tenantId);
    }

    // Boolean flag fields — convert boolean input → integer storage.
    const boolFlags: Array<[keyof UpdateProductInput, keyof Product]> = [
      ["age_restricted", "age_restricted"],
      ["msa_promotion_indicator", "msa_promotion_indicator"],
      ["drop_shipment", "drop_shipment"],
      ["returnable", "returnable"],
      ["service_product", "service_product"],
      ["customer_specific", "customer_specific"],
      ["exclude_from_po", "exclude_from_po"],
      ["composite_product", "composite_product"],
      ["track_inventory", "track_inventory"],
      ["track_inventory_by_imei", "track_inventory_by_imei"],
      ["ecommerce", "ecommerce"],
    ];
    for (const [inputKey, productKey] of boolFlags) {
      const value = input[inputKey];
      if (value !== undefined) {
        const nextVal = value ? 1 : 0;
        if (nextVal !== (current as unknown as Record<string, unknown>)[productKey]) {
          (next as unknown as Record<string, unknown>)[productKey] = nextVal;
          (changed as unknown as Record<string, unknown>)[productKey] = nextVal;
        }
      }
    }

    // Nullable text + numeric fields — pass through as-is.
    const detailFields = [
      "description", "short_description", "full_description", "alternative_name",
      "model_name", "manufacturer", "brand", "tags", "url_alias",
      "msrp_cents", "min_selling_price_cents", "raw_cost_price_cents", "wholesale_price_cents", "enterprise_price_cents",
      "length_mm", "width_mm", "height_mm", "weight_grams",
      "size", "unit_description", "nicotine_strength_mg", "volume_ml", "oz_per_product_x100",
      "image_url",
      "state_description", "federal_description",
      "msa_category_code", "msa_promotion_description", "msa_manufacturer_description",
      "meta_title", "meta_keywords", "meta_description",
      "preferred_vendor_id", "preferred_vendor_name", "primary_vendor",
      "vendor_upc", "reorder_quantity",
      "min_qty_to_sell", "max_qty_to_sell", "qty_increment",
      "parent_product_id", "variant_label", "variant_options",
    ] as const;
    for (const field of detailFields) {
      const value = (input as Record<string, unknown>)[field];
      if (value !== undefined && value !== (current as unknown as Record<string, unknown>)[field]) {
        (next as unknown as Record<string, unknown>)[field] = value;
        (changed as unknown as Record<string, unknown>)[field] = value;
      }
    }

    // #4: when a variant's attribute values change (variant_options), refresh its
    // display label + name from the master, unless the caller set them explicitly.
    // Everything else (id, sku, upc, inventory, pricing, images) is preserved — the
    // variant is edited in place, never recreated.
    if (input.variant_options !== undefined && input.name === undefined && input.variant_label === undefined && parentId) {
      const opts = parseVariantOptions(next.variant_options);
      if (opts) {
        const values = Object.values(opts).map((v) => String(v)).filter(Boolean);
        const master = await this.db.one<{ name: string }>(
          "SELECT name FROM products WHERE id = @p AND tenant_id = @t",
          { p: parentId, t: tenantId },
        );
        if (master) {
          const label = variantLabelFrom(values);
          const name = variantNameFrom(master.name, values);
          if (label !== current.variant_label) { next.variant_label = label; changed.variant_label = label; }
          if (name !== current.name) { next.name = name; changed.name = name; }
        }
      }
    }

    if (Object.keys(changed).length === 0) {
      return current;
    }

    next.updated_at = Date.now();

    try {
    await this.db.query(
      `UPDATE products SET
         sku = @sku,
         name = @name, price_cents = @price_cents, category = @category, tax_class = @tax_class,
         barcode = @barcode, status = @status,
         description = @description, short_description = @short_description, full_description = @full_description,
         alternative_name = @alternative_name, model_name = @model_name, manufacturer = @manufacturer,
         brand = @brand, tags = @tags, url_alias = @url_alias,
         msrp_cents = @msrp_cents, min_selling_price_cents = @min_selling_price_cents, raw_cost_price_cents = @raw_cost_price_cents,
         wholesale_price_cents = @wholesale_price_cents, enterprise_price_cents = @enterprise_price_cents,
         length_mm = @length_mm, width_mm = @width_mm, height_mm = @height_mm, weight_grams = @weight_grams,
         size = @size, unit_description = @unit_description, nicotine_strength_mg = @nicotine_strength_mg,
         volume_ml = @volume_ml, oz_per_product_x100 = @oz_per_product_x100,
         image_url = @image_url,
         state_description = @state_description, federal_description = @federal_description,
         msa_category_code = @msa_category_code, msa_promotion_indicator = @msa_promotion_indicator,
         msa_promotion_description = @msa_promotion_description, msa_manufacturer_description = @msa_manufacturer_description,
         meta_title = @meta_title, meta_keywords = @meta_keywords, meta_description = @meta_description,
         preferred_vendor_id = @preferred_vendor_id, preferred_vendor_name = @preferred_vendor_name,
         primary_vendor = @primary_vendor, vendor_upc = @vendor_upc,
         drop_shipment = @drop_shipment, reorder_quantity = @reorder_quantity,
         min_qty_to_sell = @min_qty_to_sell, max_qty_to_sell = @max_qty_to_sell, qty_increment = @qty_increment,
         parent_product_id = @parent_product_id, variant_label = @variant_label, variant_options = @variant_options,
         age_restricted = @age_restricted, returnable = @returnable, service_product = @service_product,
         customer_specific = @customer_specific, exclude_from_po = @exclude_from_po,
         composite_product = @composite_product, track_inventory = @track_inventory,
         track_inventory_by_imei = @track_inventory_by_imei,
         ecommerce = @ecommerce,
         updated_at = @updated_at
       WHERE id = @id`,
      next as unknown as Record<string, unknown>,
    );
    } catch (err) {
      // Concurrent sku reassignment can still collide despite the pre-check.
      if (isUniqueViolation(err)) throw conflict(`product with sku '${next.sku}' already exists`);
      throw err;
    }

    // Append-only price history — written here (not from events) because only
    // update() knows both the old and new values. Covers every path that
    // changes prices: direct PATCH, bulk-update, and bulkAdjustPrice.
    const priceChanges: Array<{ field: string; oldVal: number | null; newVal: number }> = [];
    if (changed.price_cents !== undefined) {
      priceChanges.push({ field: "selling", oldVal: current.price_cents, newVal: next.price_cents });
    }
    if (changed.raw_cost_price_cents !== undefined && next.raw_cost_price_cents != null) {
      priceChanges.push({ field: "cost", oldVal: current.raw_cost_price_cents, newVal: next.raw_cost_price_cents });
    }
    for (const pc of priceChanges) {
      await this.db.query(
        `INSERT INTO product_price_history (id, tenant_id, product_id, field, old_price_cents, new_price_cents, changed_at)
         VALUES (@id, @t, @p, @field, @oldVal, @newVal, @now)`,
        { id: `pph_${uuidv7()}`, t: tenantId, p: id, field: pc.field, oldVal: pc.oldVal, newVal: pc.newVal, now: next.updated_at },
      );
    }

    if (options.publishEvent !== false) {
      await this.publishProductUpdated(next, changed);
    }

    // Audit trail (product-detail Audit Log tab): one row per update() call
    // carrying only the fields that actually changed, before AND after —
    // read side (CatalogDetailViewsService in detail-views.ts) flattens this
    // into one entry per field. status -> "archived" is classified as an
    // "archive" action at read time (archive() is just update() under the
    // hood, so it needs no separate audit call here).
    if (Object.keys(changed).length > 0) {
      const before: Record<string, unknown> = {};
      for (const key of Object.keys(changed)) before[key] = (current as unknown as Record<string, unknown>)[key];
      await writeAudit(this.db, {
        tenantId, actorId: options.actorId ?? "system",
        action: changed.status === "archived" ? "product.archived" : "product.updated",
        entityType: "product", entityId: id, before, after: changed,
      });
    }

    // Cascade a master product's category change to all its child variants, which
    // inherit it. Children have no children, so this recurses at most one level.
    if (changed.category !== undefined) {
      const children = await this.listVariants(id, tenantId);
      for (const child of children) {
        if (child.category !== next.category) {
          await this.update(child.id, { category: next.category }, tenantId, { publishEvent: options.publishEvent });
        }
      }
    }

    return next;
  }

  private async publishProductUpdated(product: Product, changed: Partial<Product>): Promise<void> {
    await this.events.publish("product.updated", { id: product.id, ...changed }, product.id);
  }

  /** Soft delete: archive the product. */
  async archive(id: string, tenantId: string, actorId?: string): Promise<Product> {
    return this.update(id, { status: "archived" }, tenantId, { actorId });
  }

  /** BE-22: update regulated-product compliance fields (manager-gated at route level). */
  async updateCompliance(
    id: string,
    input: {
      tobacco_type?: string | null;
      flavored?: boolean;
      menthol?: boolean;
      msa_reportable?: boolean;
      restricted_states?: string[];
    },
    tenantId: string,
    actorId = "system",
  ): Promise<Product> {
    const current = await this.getOrThrow(id, tenantId);
    const now = Date.now();

    const tobacco_type = input.tobacco_type !== undefined ? (input.tobacco_type ?? null) : current.tobacco_type;
    const flavored = input.flavored !== undefined ? (input.flavored ? 1 : 0) : current.flavored;
    const menthol = input.menthol !== undefined ? (input.menthol ? 1 : 0) : current.menthol;
    const msa_reportable = input.msa_reportable !== undefined ? (input.msa_reportable ? 1 : 0) : current.msa_reportable;
    const restricted_states =
      input.restricted_states !== undefined
        ? JSON.stringify(input.restricted_states)
        : current.restricted_states;

    await this.db.query(
      `UPDATE products
       SET tobacco_type = @tobacco_type,
           flavored = @flavored,
           menthol = @menthol,
           msa_reportable = @msa_reportable,
           restricted_states = @restricted_states,
           updated_at = @now
       WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId, tobacco_type, flavored, menthol, msa_reportable, restricted_states, now },
    );

    await this.events.publish("product.updated", { id, tobacco_type, flavored, menthol, msa_reportable, restricted_states }, id);

    await writeAudit(this.db, {
      tenantId, actorId, action: "product.updated", entityType: "product", entityId: id,
      before: { tobacco_type: current.tobacco_type, flavored: current.flavored, menthol: current.menthol, msa_reportable: current.msa_reportable, restricted_states: current.restricted_states },
      after: { tobacco_type, flavored, menthol, msa_reportable, restricted_states },
    });

    return {
      ...current,
      tobacco_type,
      flavored,
      menthol,
      msa_reportable,
      restricted_states,
      updated_at: now,
    };
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
      { sku: "APP-TSHIRT-001", name: "Ascend Logo T-Shirt", price_cents: 2200, category: "apparel", barcode: "0123456789036" },
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

  /** Bulk price/cost adjustment computed per product (bulkUpdate can only set one
   *  value for all). `target` is the selling price or the raw cost; each result is
   *  clamped to >= 0. Reuses update() so events/validation still fire. */
  /** SQL expression for one price op over the given column (cents). The SQL
   *  comes ONLY from this hardcoded whitelist keyed by the PriceOp enum; the
   *  user-supplied value is always bound as @value, never interpolated. */
  private priceOpExpr(op: PriceOp, col: string): string {
    const cur = `COALESCE(${col}, 0)`;
    switch (op) {
      case "inc_pct":    return `ROUND(${cur} * (1 + @value / 100.0))`;
      case "dec_pct":    return `ROUND(${cur} * (1 - @value / 100.0))`;
      case "inc_amount": return `${cur} + @value`;
      case "dec_amount": return `${cur} - @value`;
      case "set":        return `@value`;
      case "round_99":   return `FLOOR(${cur} / 100.0) * 100 + 99`;
      case "round_95":   return `FLOOR(${cur} / 100.0) * 100 + 95`;
    }
  }

  /** Set-based bulk price/cost adjustment (ACPA M2 — batch bulk ops).
   *  One UPDATE + one history INSERT regardless of selection size, replacing
   *  the per-product SELECT/UPDATE/INSERT loop (~4 × N round-trips). Contract
   *  preserved: 404 if any id is foreign/missing, append-only price history
   *  for real changes, per-row product.updated events for consumers. */
  async bulkAdjustPrice(ids: string[], target: PriceTarget, op: PriceOp, value: number, tenantId: string): Promise<Product[]> {
    const unique = [...new Set(ids)];
    const field = target === "cost" ? "raw_cost_price_cents" : "price_cents";
    const historyField = target === "cost" ? "cost" : "selling";
    // Contract: every id must exist and belong to the tenant (single round-trip).
    const found = await this.db.query<{ id: string }>(
      "SELECT id FROM products WHERE tenant_id = @t AND id = ANY(@ids)",
      { t: tenantId, ids: unique },
    );
    if (found.length !== unique.length) {
      const have = new Set(found.map((r) => r.id));
      const missing = unique.find((id) => !have.has(id));
      throw notFound(`product '${missing}' not found`);
    }

    const expr = this.priceOpExpr(op, `old.${field}`);
    const now = Date.now();
    const changed: Array<Product & { old_value: number | null }> = [];
    await this.db.withTenant(tenantId).tx(async (tdb) => {
      // Self-join exposes the pre-update value so history + events see old→new.
      const rows = await tdb.query<Product & { old_value: number | null }>(
        `UPDATE products p
            SET ${field} = GREATEST(0, ROUND((${expr}))::bigint),
                updated_at = @now
           FROM products old
          WHERE p.tenant_id = @t AND p.id = ANY(@ids)
            AND old.id = p.id AND old.tenant_id = p.tenant_id
        RETURNING p.*, old.${field} AS old_value`,
        { t: tenantId, ids: unique, value, now },
      );
      const realChanges = rows.filter((r) => (r.old_value ?? 0) !== (r as unknown as Record<string, number>)[field]);
      changed.push(...realChanges);
      if (realChanges.length > 0) {
        // Batched append-only history — one INSERT for the whole selection.
        const values = realChanges
          .map((_, i) => `(@id${i}, @t, @p${i}, @f, @old${i}, @new${i}, @now)`)
          .join(", ");
        const params: Record<string, unknown> = { t: tenantId, f: historyField, now };
        realChanges.forEach((r, i) => {
          params[`id${i}`] = `pph_${uuidv7()}`;
          params[`p${i}`] = r.id;
          params[`old${i}`] = r.old_value;
          params[`new${i}`] = (r as unknown as Record<string, number>)[field];
        });
        await tdb.query(
          `INSERT INTO product_price_history (id, tenant_id, product_id, field, old_price_cents, new_price_cents, changed_at)
           VALUES ${values}`,
          params,
        );
      }
    });

    // Per-row events for changed products — sync/ecommerce consumers unchanged.
    for (const r of changed) {
      await this.publishProductUpdated(r, { [field]: (r as unknown as Record<string, number>)[field] } as Partial<Product>);
    }

    // Return the full selection in the caller's shape (updated rows).
    return this.db.query<Product>(
      "SELECT * FROM products WHERE tenant_id = @t AND id = ANY(@ids)",
      { t: tenantId, ids: unique },
    );
  }

  /** Append-only price-change timeline for a product, newest first. */
  async listPriceHistory(productId: string, tenantId: string, limit = 100): Promise<PriceHistoryEntry[]> {
    await this.getOrThrow(productId, tenantId);
    return this.db.query<PriceHistoryEntry>(
      `SELECT * FROM product_price_history WHERE tenant_id = @t AND product_id = @p
       ORDER BY changed_at DESC, id DESC LIMIT @limit`,
      { t: tenantId, p: productId, limit: Math.min(Math.max(limit, 1), 500) },
    );
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

  private async assertCanBeMaster(masterId: string, tenantId: string): Promise<Product> {
    const master = await this.getOrThrow(masterId, tenantId);
    if (master.parent_product_id) {
      throw conflict("a variant product cannot be used as a master product");
    }
    return master;
  }

  private async hasChildVariants(productId: string, tenantId: string): Promise<boolean> {
    const row = await this.db.one(
      "SELECT 1 FROM products WHERE tenant_id = @tenantId AND parent_product_id = @productId LIMIT 1",
      { tenantId, productId },
    );
    return Boolean(row);
  }

  private async assertCanBecomeVariant(childId: string, parentId: string | null, tenantId: string): Promise<void> {
    if (!parentId) return;
    if (parentId === childId) throw conflict("a product cannot be its own variant parent");
    await this.assertCanBeMaster(parentId, tenantId);
    if (await this.hasChildVariants(childId, tenantId)) {
      throw conflict("a master product cannot be assigned as a child variant");
    }
  }

  /** Child products (variants) assigned to a master product. */
  /** List a master's variants. With `channel`, order them by that channel's stored
   *  sort mode (default | manual | price | name); without it, the default order. */
  async listVariants(masterId: string, tenantId: string, channel?: VariantChannel): Promise<Product[]> {
    const master = await this.getOrThrow(masterId, tenantId);
    const mode: VariantSortMode = channel === "online" ? master.online_variant_sort : channel === "offline" ? master.offline_variant_sort : "default";
    const orderCol = channel === "online" ? "online_sort_order" : "offline_sort_order";
    return this.db.query<Product>(
      `SELECT * FROM products WHERE tenant_id = @tenantId AND parent_product_id = @masterId ORDER BY ${variantOrderBy(mode, orderCol)}`,
      { tenantId, masterId },
    );
  }

  /** Persist a manual drag order of a master's variants for one channel (online or
   *  offline), independently of the other. Switches that channel's sort mode to
   *  `manual`. `orderedIds` must be exactly the master's current variants. */
  async reorderVariants(masterId: string, channel: VariantChannel, orderedIds: string[], tenantId: string): Promise<Product[]> {
    await this.getOrThrow(masterId, tenantId);
    const orderCol = channel === "online" ? "online_sort_order" : "offline_sort_order";
    const modeCol = channel === "online" ? "online_variant_sort" : "offline_variant_sort";
    const current = await this.db.query<{ id: string }>(
      "SELECT id FROM products WHERE tenant_id = @t AND parent_product_id = @m",
      { t: tenantId, m: masterId },
    );
    const currentIds = new Set(current.map((r) => r.id));
    const uniqueOrdered = [...new Set(orderedIds)];
    if (uniqueOrdered.length !== currentIds.size || uniqueOrdered.some((id) => !currentIds.has(id))) {
      throw badRequest("orderedIds must be exactly the master's current variant ids");
    }
    await this.db.withTenant(tenantId).tx(async (tdb) => {
      for (let i = 0; i < uniqueOrdered.length; i++) {
        await tdb.query(`UPDATE products SET ${orderCol} = @pos, updated_at = @now WHERE id = @id AND tenant_id = @t`, { pos: i, now: Date.now(), id: uniqueOrdered[i], t: tenantId });
      }
      await tdb.query(`UPDATE products SET ${modeCol} = 'manual', updated_at = @now WHERE id = @m AND tenant_id = @t`, { now: Date.now(), m: masterId, t: tenantId });
    });
    return this.listVariants(masterId, tenantId, channel);
  }

  /** Set the sort mode for a master's variants on one channel. */
  async setVariantSort(masterId: string, channel: VariantChannel, mode: VariantSortMode, tenantId: string): Promise<Product[]> {
    await this.getOrThrow(masterId, tenantId);
    const modeCol = channel === "online" ? "online_variant_sort" : "offline_variant_sort";
    await this.db.query(`UPDATE products SET ${modeCol} = @mode, updated_at = @now WHERE id = @m AND tenant_id = @t`, { mode, now: Date.now(), m: masterId, t: tenantId });
    return this.listVariants(masterId, tenantId, channel);
  }

  /** Bulk-assign the given products as children (variants) of a master product. */
  async assignVariants(
    masterId: string,
    productIds: string[],
    tenantId: string,
    variantLabel?: string | null,
  ): Promise<Product[]> {
    const updatedProducts = await this.db.withTenant(tenantId).tx(async (tdb) => {
      const catalog = new CatalogService(tdb, this.events);
      const updated: Product[] = [];
      const master = await catalog.assertCanBeMaster(masterId, tenantId);
      for (const productId of [...new Set(productIds)]) {
        if (productId === masterId) throw conflict("a product cannot be its own variant parent");
        updated.push(
          await catalog.update(
            productId,
            {
              parent_product_id: masterId,
              // A variant always belongs to its master's category (also enforced in update()).
              category: master.category,
              ...(variantLabel !== undefined ? { variant_label: variantLabel } : {}),
            },
            tenantId,
            { publishEvent: false },
          ),
        );
      }
      return updated;
    });

    for (const product of updatedProducts) {
      await this.publishProductUpdated(product, {
        parent_product_id: product.parent_product_id,
        ...(variantLabel !== undefined ? { variant_label: product.variant_label } : {}),
      });
    }

    return this.listVariants(masterId, tenantId);
  }

  async unlinkVariant(masterId: string, childId: string, tenantId: string): Promise<Product> {
    await this.assertCanBeMaster(masterId, tenantId);
    const child = await this.getOrThrow(childId, tenantId);
    if (child.parent_product_id !== masterId) {
      throw conflict("product is not a child variant of this master product");
    }
    return this.update(childId, { parent_product_id: null, variant_label: null }, tenantId);
  }

  async createVariant(masterId: string, input: CreateVariantInput, tenantId: string): Promise<Product> {
    const master = await this.assertCanBeMaster(masterId, tenantId);
    const label = input.variant_label.trim();
    const upc = input.upc.trim();
    await this.assertBarcodeAvailable(upc, tenantId);
    const product = await this.create(
      {
        sku: input.sku.trim(),
        name: `${master.name} - ${label}`,
        price_cents: input.selling_price_cents,
        category: input.category.trim(),
        tax_class: master.tax_class,
        barcode: upc,
        status: master.status,
        description: master.description,
        brand: master.brand,
        image_url: master.image_url,
        parent_product_id: masterId,
        variant_label: label,
        age_restricted: master.age_restricted === 1,
        returnable: master.returnable === 1,
        service_product: master.service_product === 1,
        track_inventory: master.track_inventory === 1,
        ecommerce: master.ecommerce === 1,
      },
      tenantId,
    );
    return product;
  }

  /**
   * Non-destructive matrix generation. For each attribute-value combination the
   * caller requests, we match against the master's current variants by attribute
   * signature (order-independent) and:
   *   - update the matched variant in place — refreshing its options, label and
   *     name while preserving id, sku, upc, inventory, pricing and images;
   *   - or create a new variant when no combination matches.
   * Combinations the caller no longer lists are left untouched — variants are never
   * deleted, unlinked, or duplicated. Legacy variants without stored options are
   * matched by their parsed label so a first re-generate backfills them cleanly.
   */
  async generateVariants(masterId: string, attributes: VariantAttributeInput[], tenantId: string, exclude?: string[][]): Promise<Product[]> {
    // Combinations the caller removed/disabled in the preview — matched order-independently.
    const excludeKeys = new Set((exclude ?? []).map((values) => valuesKey(values.map((v) => v.trim()).filter(Boolean))));
    const touched = await this.db.withTenant(tenantId).tx(async (tdb) => {
      const catalog = new CatalogService(tdb, this.events);
      const created: Product[] = [];
      const updated: Product[] = [];
      const master = await catalog.assertCanBeMaster(masterId, tenantId);
      const normalized = attributes
        .map((attr) => ({
          name: attr.name.trim(),
          values: [...new Set(attr.values.map((value) => value.trim()).filter(Boolean))],
        }))
        .filter((attr) => attr.name && attr.values.length > 0);

      if (normalized.length === 0) {
        throw conflict("variant generation requires at least one attribute with values");
      }

      const combinations = variantCombinations(normalized.map((attr) => attr.values));
      if (combinations.length > 200) {
        throw conflict("variant generation is limited to 200 combinations");
      }

      // Index existing variants by both their structured signature and (for legacy
      // rows without options) their parsed value set, so we match and never dup.
      const existing = await catalog.listVariants(masterId, tenantId);
      const bySignature = new Map<string, Product>();
      const byValues = new Map<string, Product>();
      for (const variant of existing) {
        const opts = parseVariantOptions(variant.variant_options);
        if (opts) {
          bySignature.set(optionsSignature(opts), variant);
          byValues.set(valuesKey(Object.values(opts).map(String)), variant);
        } else {
          byValues.set(valuesKey(parseLegacyLabel(variant.variant_label)), variant);
        }
      }
      const claimed = new Set<string>();

      for (const combo of combinations) {
        if (excludeKeys.has(valuesKey(combo))) continue; // removed/disabled in the preview
        const options: VariantOptions = {};
        normalized.forEach((attr, i) => { options[attr.name] = combo[i]; });
        const label = variantLabelFrom(combo);
        const name = variantNameFrom(master.name, combo);
        const optionsJson = JSON.stringify(options);
        const sig = optionsSignature(options);
        const vKey = valuesKey(combo);

        const match = bySignature.get(sig) ?? byValues.get(vKey);
        if (match && !claimed.has(match.id)) {
          claimed.add(match.id);
          // Update in place — only label/name/options; everything else is preserved.
          const changedNeeded = match.variant_label !== label || match.name !== name || match.variant_options !== optionsJson;
          if (changedNeeded) {
            updated.push(await catalog.update(
              match.id,
              { name, variant_label: label, variant_options: optionsJson },
              tenantId,
              { publishEvent: false },
            ));
          }
          continue;
        }

        created.push(await catalog.create(
          {
            sku: await catalog.nextVariantSku(master.sku, label, tenantId),
            name,
            price_cents: master.price_cents,
            category: master.category,
            tax_class: master.tax_class,
            status: master.status,
            description: master.description,
            brand: master.brand,
            image_url: master.image_url,
            parent_product_id: masterId,
            variant_label: label,
            variant_options: optionsJson,
            age_restricted: master.age_restricted === 1,
            returnable: master.returnable === 1,
            service_product: master.service_product === 1,
            track_inventory: master.track_inventory === 1,
            ecommerce: master.ecommerce === 1,
          },
          tenantId,
          { publishEvent: false },
        ));
      }

      return { created, updated };
    });

    for (const product of touched.created) await this.publishProductCreated(product);
    for (const product of touched.updated) await this.publishProductUpdated(product, { name: product.name, variant_label: product.variant_label });

    return this.listVariants(masterId, tenantId);
  }

  private async nextVariantSku(masterSku: string, variantLabel: string, tenantId: string): Promise<string> {
    const suffix = skuToken(variantLabel) || "VARIANT";
    const base = `${masterSku}-${suffix}`;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.db.one(
        "SELECT id FROM products WHERE tenant_id = @tenantId AND sku = @sku",
        { tenantId, sku: candidate },
      );
      if (!existing) return candidate;
    }
    throw conflict("could not generate a unique variant SKU");
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
    await this.db.withTenant(tenantId).tx(async (tdb) => {
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
    await this.db.withTenant(tenantId).tx(async (tdb) => {
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

  // ── Product Images ───────────────────────────────────────────────────────────

  async listImages(productId: string, tenantId: string): Promise<ProductImage[]> {
    return this.db.query<ProductImage>(
      "SELECT * FROM product_images WHERE tenant_id = @tenantId AND product_id = @productId ORDER BY sort_order ASC, created_at ASC",
      { tenantId, productId },
    );
  }

  async addImage(
    productId: string,
    tenantId: string,
    input: { imageUrl: string; altText?: string | null; sortOrder?: number; isPrimary?: boolean },
  ): Promise<ProductImage> {
    const now = Date.now();
    const img: ProductImage = {
      id: `pimg_${uuidv7()}`,
      tenant_id: tenantId,
      product_id: productId,
      image_url: input.imageUrl,
      alt_text: input.altText ?? null,
      sort_order: input.sortOrder ?? 0,
      is_primary: input.isPrimary ?? false,
      created_at: now,
    };
    await this.db.query(
      `INSERT INTO product_images (id, tenant_id, product_id, image_url, alt_text, sort_order, is_primary, created_at)
       VALUES (@id, @tenant_id, @product_id, @image_url, @alt_text, @sort_order, @is_primary, @created_at)`,
      img as unknown as Record<string, unknown>,
    );
    return img;
  }

  async deleteImage(imageId: string, tenantId: string): Promise<void> {
    await this.db.query(
      "DELETE FROM product_images WHERE id = @id AND tenant_id = @tenantId",
      { id: imageId, tenantId },
    );
  }

  // ── Product Attributes ───────────────────────────────────────────────────────

  async listAttributes(tenantId: string): Promise<ProductAttribute[]> {
    return this.db.query<ProductAttribute>(
      "SELECT * FROM product_attributes WHERE tenant_id = @tenantId ORDER BY name ASC",
      { tenantId },
    );
  }

  async createAttribute(
    tenantId: string,
    input: { name: string; dataType?: string; isFilterable?: boolean; isVariantOption?: boolean },
  ): Promise<ProductAttribute> {
    const now = Date.now();
    const attr: ProductAttribute = {
      id: `pattr_${uuidv7()}`,
      tenant_id: tenantId,
      name: input.name,
      data_type: input.dataType ?? "text",
      is_filterable: input.isFilterable ?? false,
      is_variant_option: input.isVariantOption ?? false,
      created_at: now,
      updated_at: now,
    };
    await this.db.query(
      `INSERT INTO product_attributes (id, tenant_id, name, data_type, is_filterable, is_variant_option, created_at, updated_at)
       VALUES (@id, @tenant_id, @name, @data_type, @is_filterable, @is_variant_option, @created_at, @updated_at)`,
      attr as unknown as Record<string, unknown>,
    );
    return attr;
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

// ── Product search / filter / sort SQL ────────────────────────────────────────
// All of this used to live in the browser, over whatever page happened to be
// loaded. It is here now so a filter means the same thing on row 1 and row
// 100,000. Two constraints shaped it:
//   1. `compile()` in shared/db.ts binds `undefined` for an @name with no
//      matching key — silently, as NULL. Every fragment below therefore writes
//      its own params, and nothing references a placeholder it did not set.
//   2. Contains-matching uses bare-column ILIKE (not `lower(col) LIKE`) so the
//      gin_trgm_ops indexes stay eligible; `lower()` appears only in the rank
//      expression, which is evaluated on already-filtered rows.

/** Columns a free-text term is matched against, in the product row itself. */
const SEARCH_COLUMNS: readonly string[] = [
  "name", "sku", "barcode", "brand", "manufacturer",
  "alternative_name", "model_name", "tags", "vendor_upc", "category",
];

/**
 * Column-scoped search: what each selectable field actually matches.
 *
 * The list UI lets the user narrow a search to one column ("Search → SKU").
 * That control is only honest if the narrowing happens in SQL, so each option
 * maps here to the concrete product columns it searches. `all` is the default
 * and keeps the historical behaviour (every column in SEARCH_COLUMNS plus the
 * alternate-barcode table).
 *
 * `barcode` is deliberately more than `products.barcode`: alternate, case and
 * vendor UPCs live in `product_barcodes`, and a user who scopes a search to
 * "UPC" means any of them — scoping to the column would make scanning a case
 * UPC return nothing while "All columns" found it, which reads as a bug.
 */
const SEARCH_FIELD_COLUMNS = {
  name: ["name", "alternative_name", "model_name"],
  sku: ["sku"],
  barcode: ["barcode", "vendor_upc"],
  brand: ["brand", "manufacturer"],
  category: ["category"],
  tags: ["tags"],
} as const satisfies Record<string, readonly string[]>;

/** Search fields the catalog list accepts, `all` plus every scoped column. */
export const PRODUCT_SEARCH_FIELDS = [
  "all",
  ...(Object.keys(SEARCH_FIELD_COLUMNS) as (keyof typeof SEARCH_FIELD_COLUMNS)[]),
] as const;

export type ProductSearchField = (typeof PRODUCT_SEARCH_FIELDS)[number];

/** Fields whose scope includes the alternate-barcode table. */
const FIELDS_SEARCHING_BARCODE_TABLE: readonly ProductSearchField[] = ["all", "barcode"];

/** More tokens than this stops adding signal and starts costing scans. */
const MAX_SEARCH_TOKENS = 5;

interface SearchSql {
  /** Restricts to rows matching every token (AND across tokens, OR across columns). */
  predicate: string;
  /** Integer relevance, lower is better. See RANK_* ordering in the CASE below. */
  rank: string;
}

/**
 * Build the search predicate and relevance ranking for a raw query string.
 *
 * Token semantics are AND: "coke 12" means both "coke" and "12" appear
 * somewhere on the product, which is what makes `12 pack coke` resolve to a
 * 12-pack of Coca-Cola rather than to everything containing "coke".
 *
 * Ranking follows the documented precedence — exact barcode, then exact SKU,
 * then exact supplier SKU, then prefix matches, then name contains, then
 * anything else — so scanning `049000028904` resolves the product rather than
 * burying it under name matches.
 *
 * Returns null for a blank query (caller then applies no search at all).
 *
 * `field` narrows which columns are matched. It only changes the predicate —
 * ranking is left alone, because relevance ordering within a scoped result set
 * is still the ordering the user wants (an exact SKU hit above a prefix one).
 */
function buildProductSearch(
  raw: string,
  tenantId: string,
  params: Record<string, unknown>,
  field: ProductSearchField = "all",
): SearchSql | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // The barcode sub-select below binds @tenantId. Set it here rather than
  // relying on the caller having done so: `compile()` binds a missing @name as
  // NULL without complaining, which would silently turn that clause into "no
  // alternate barcode ever matches" — a wrong result, not an error.
  params.tenantId = tenantId;

  const tokens = trimmed.split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_TOKENS);
  if (tokens.length === 0) return null;

  const searchColumns: readonly string[] =
    field === "all" ? SEARCH_COLUMNS : SEARCH_FIELD_COLUMNS[field];
  const searchesBarcodeTable = FIELDS_SEARCHING_BARCODE_TABLE.includes(field);

  const clauses: string[] = [];
  tokens.forEach((token, i) => {
    const key = `sq${i}`;
    params[key] = `%${escapeLike(token)}%`;
    const cols = searchColumns.map((c) => `products.${c} ILIKE @${key}`);
    // Alternate/case/vendor UPCs live in their own table; a scan of any of them
    // has to find the product, not just a scan of products.barcode.
    //
    // `IN (subquery)` rather than a correlated `EXISTS`: inside an OR, Postgres
    // cannot flatten EXISTS into a semi-join and runs it as a per-row SubPlan,
    // so it re-queries product_barcodes for every row the column predicates
    // did not already match. The IN form evaluates the inner scan once against
    // pbarcodes_barcode_trgm_idx and hashes the (small) result. Measured on a
    // 50k catalog: 202ms → 122ms for the row query, 182ms → 163ms for the
    // count. Identical results, including for a term that matches only an
    // alternate barcode — see the barcode tests in catalog.test.ts.
    if (searchesBarcodeTable) {
      cols.push(
        `products.id IN (SELECT pbs.product_id FROM product_barcodes pbs
                          WHERE pbs.tenant_id = @tenantId
                            AND pbs.barcode ILIKE @${key})`,
      );
    }
    clauses.push(`(${cols.join(" OR ")})`);
  });

  const lower = trimmed.toLowerCase();
  params.sxEq = lower;
  params.sxPrefix = `${escapeLike(lower)}%`;
  params.sxContains = `%${escapeLike(lower)}%`;
  // Scanners and pasted UPCs arrive with spaces or dashes; compare a digits-only
  // form too. NULL when the term has no digits — `col = NULL` is simply never true.
  const digits = lower.replace(/\D/g, "");
  params.sxDigits = digits.length >= 6 ? digits : null;

  const rank = `CASE
      WHEN lower(products.barcode) = @sxEq OR lower(products.barcode) = @sxDigits THEN 0
      WHEN EXISTS (SELECT 1 FROM product_barcodes pbr
                    WHERE pbr.tenant_id = products.tenant_id
                      AND pbr.product_id = products.id
                      AND (lower(pbr.barcode) = @sxEq OR lower(pbr.barcode) = @sxDigits)) THEN 0
      WHEN lower(products.sku) = @sxEq THEN 1
      WHEN lower(products.vendor_upc) = @sxEq OR lower(products.vendor_upc) = @sxDigits THEN 2
      WHEN lower(products.sku) LIKE @sxPrefix THEN 3
      WHEN lower(products.name) LIKE @sxPrefix THEN 4
      WHEN lower(products.brand) LIKE @sxPrefix OR lower(products.manufacturer) LIKE @sxPrefix THEN 5
      WHEN lower(products.name) LIKE @sxContains THEN 6
      ELSE 7
    END`;

  return { predicate: clauses.join(" AND "), rank };
}

/** Neutralize LIKE wildcards in user input so `50%` is a literal, not a match-all. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** SQL for the derived master/variant/standalone position of a product. */
function productTypePredicate(type: ProductTypeFilter): string {
  const hasChild = `EXISTS (SELECT 1 FROM products kids
                             WHERE kids.tenant_id = products.tenant_id
                               AND kids.parent_product_id = products.id)`;
  if (type === "variant") return "products.parent_product_id IS NOT NULL";
  if (type === "master") return `products.parent_product_id IS NULL AND ${hasChild}`;
  return `products.parent_product_id IS NULL AND NOT ${hasChild}`;
}

const SORT_COLUMNS: Record<Exclude<ProductSort, "relevance">, string> = {
  name: "products.name",
  sku: "products.sku",
  price_cents: "products.price_cents",
  category: "products.category",
  brand: "products.brand",
  status: "products.status",
  created_at: "products.created_at",
  updated_at: "products.updated_at",
  cost: "products.raw_cost_price_cents",
};

/**
 * ORDER BY for the product list. Whitelisted columns only — `sort` never
 * reaches SQL as text. Every ordering ends in `products.id` so paging through a
 * catalog with duplicate sort values can't repeat or skip a row.
 */
function productOrderBy(sort: ProductSort | undefined, dir: SortDir | undefined, rank: string | null): string {
  const direction = dir === "desc" ? "DESC" : "ASC";
  const effective: ProductSort = sort ?? (rank ? "relevance" : "created_at");

  if (effective === "relevance") {
    if (!rank) return "products.name ASC, products.id ASC";
    // Within a relevance tier, prefer what the user can actually sell today.
    return `${rank} ASC, (products.status = 'active') DESC, products.name ASC, products.id ASC`;
  }

  const column = SORT_COLUMNS[effective];
  // NULLS LAST in both directions: an unset brand or cost is missing data, not
  // the "smallest" value, and shouldn't fill the first page of an ascending sort.
  const nulls = effective === "brand" || effective === "cost" ? " NULLS LAST" : "";
  const fallback = effective === "created_at" ? "" : ", products.created_at DESC";
  return `${column} ${direction}${nulls}${fallback}, products.id ASC`;
}

/** Postgres signals a unique-constraint breach with SQLSTATE 23505. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "23505"
  );
}
