import type { DB } from "../../shared/db.js";

/**
 * Global search (ERP benchmark #15) — a unified, read-only lookup across the
 * core entities for the ⌘K command palette. Each group is capped; the frontend
 * renders results grouped by type. Tenant-scoped, case-insensitive contains.
 */

export interface SearchHit {
  type: "product" | "customer" | "vendor" | "invoice" | "sales_order" | "quotation" | "purchase_order";
  id: string;
  label: string;
  sublabel?: string;
}

export type SearchResults = Record<string, SearchHit[]>;

/** Typed row shapes for each search query — keeps DB rows out of `any` land. */
interface ProductRow {
  id: string;
  name: string;
  sku: string;
}

interface CustomerRow {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
}

interface VendorRow {
  id: string;
  name: string;
  company: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
}

interface SalesOrderRow {
  id: string;
  so_number: string;
}

interface QuotationRow {
  id: string;
  quote_number: string;
}

interface PurchaseOrderRow {
  id: string;
}

export class SearchService {
  constructor(private readonly db: DB) {}

  async search(q: string, tenantId: string, type?: string, perGroup = 8): Promise<SearchResults> {
    const term = `%${q.trim()}%`;
    const lim = Math.min(Math.max(perGroup, 1), 25);
    const out: SearchResults = {};
    const want = (t: string) => !type || type === t;

    if (want("product")) {
      const rows = await this.db.query<ProductRow>(
        `SELECT id, name, sku FROM products WHERE tenant_id = @t AND (name ILIKE @q OR sku ILIKE @q OR COALESCE(barcode,'') ILIKE @q) ORDER BY name LIMIT @l`,
        { t: tenantId, q: term, l: lim },
      );
      out.products = rows.map((r): SearchHit => ({ type: "product", id: r.id, label: r.name, sublabel: r.sku }));
    }
    if (want("customer")) {
      const rows = await this.db.query<CustomerRow>(
        `SELECT id, name, company, email FROM customers WHERE tenant_id = @t AND (name ILIKE @q OR COALESCE(company,'') ILIKE @q OR COALESCE(email,'') ILIKE @q) ORDER BY name LIMIT @l`,
        { t: tenantId, q: term, l: lim },
      );
      out.customers = rows.map((r): SearchHit => ({ type: "customer", id: r.id, label: r.name, sublabel: r.company ?? r.email ?? undefined }));
    }
    if (want("vendor")) {
      const rows = await this.db.query<VendorRow>(
        `SELECT id, name, company FROM suppliers WHERE tenant_id = @t AND (name ILIKE @q OR COALESCE(company,'') ILIKE @q) ORDER BY name LIMIT @l`,
        { t: tenantId, q: term, l: lim },
      ).catch((): VendorRow[] => []);
      out.vendors = rows.map((r): SearchHit => ({ type: "vendor", id: r.id, label: r.name, sublabel: r.company ?? undefined }));
    }
    if (want("invoice")) {
      const rows = await this.db.query<InvoiceRow>(
        `SELECT id, invoice_number FROM invoices WHERE tenant_id = @t AND invoice_number ILIKE @q ORDER BY issued_at DESC LIMIT @l`,
        { t: tenantId, q: term, l: lim },
      );
      out.invoices = rows.map((r): SearchHit => ({ type: "invoice", id: r.id, label: r.invoice_number }));
    }
    if (want("sales_order")) {
      const rows = await this.db.query<SalesOrderRow>(
        `SELECT id, so_number FROM sales_orders WHERE tenant_id = @t AND so_number ILIKE @q ORDER BY created_at DESC LIMIT @l`,
        { t: tenantId, q: term, l: lim },
      ).catch((): SalesOrderRow[] => []);
      out.salesOrders = rows.map((r): SearchHit => ({ type: "sales_order", id: r.id, label: r.so_number }));
    }
    if (want("quotation")) {
      const rows = await this.db.query<QuotationRow>(
        `SELECT id, quote_number FROM quotations WHERE tenant_id = @t AND quote_number ILIKE @q ORDER BY created_at DESC LIMIT @l`,
        { t: tenantId, q: term, l: lim },
      ).catch((): QuotationRow[] => []);
      out.quotations = rows.map((r): SearchHit => ({ type: "quotation", id: r.id, label: r.quote_number }));
    }
    if (want("purchase_order")) {
      const rows = await this.db.query<PurchaseOrderRow>(
        `SELECT id FROM purchase_orders WHERE tenant_id = @t AND id ILIKE @q ORDER BY created_at DESC LIMIT @l`,
        { t: tenantId, q: term, l: lim },
      ).catch((): PurchaseOrderRow[] => []);
      out.purchaseOrders = rows.map((r): SearchHit => ({ type: "purchase_order", id: r.id, label: r.id }));
    }
    return out;
  }
}
