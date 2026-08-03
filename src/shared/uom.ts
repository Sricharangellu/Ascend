import type { DB } from "./db.js";
import { HttpError } from "./http.js";
import { recordUomUnitNotConfigured } from "../gateway/metrics.js";

/**
 * Resolves a purchasing/selling unit ("case", "box", ...) to its pack size via
 * the product's matching `product_barcodes` row (ADR-006: units live on the
 * barcode, not a separate per-product-less table). Shared by any module that
 * needs to convert a human-entered unit count into base (each) units — each
 * caller does its own conversion at its own API boundary; this only resolves
 * the pack size, it never touches quantity/cost math itself.
 *
 * Note: `purchasing/service.ts` has its own copy of this exact query,
 * predating this shared helper — left as-is rather than refactored in the
 * same pass that adds a new consumer (orders), to avoid touching already-
 * tested purchasing code for a refactor-only reason.
 */
export async function resolveUnitPackSize(db: DB, tenantId: string, productId: string, kind: string): Promise<number> {
  const row = await db.one<{ pack_size: number }>(
    `SELECT pack_size FROM product_barcodes WHERE tenant_id = @tenantId AND product_id = @productId AND kind = @kind LIMIT 1`,
    { tenantId, productId, kind },
  );
  if (!row) {
    recordUomUnitNotConfigured(kind);
    throw new HttpError(
      400,
      "unit_not_configured",
      `No '${kind}' unit is configured for this product — add a '${kind}' barcode with a pack size first.`,
    );
  }
  return Number(row.pack_size);
}
