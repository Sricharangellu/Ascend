/**
 * Rounds a raw suggested reorder quantity up to a quantity a supplier can
 * actually fulfil, given that supplier's MOQ (minimum order quantity) and
 * case/pack multiple (`product_suppliers.moq` / `product_suppliers.case_pack`).
 *
 * Pure function, no DB access — shared by `catalog/detail-views.ts`
 * (`reorderSuggestions`, per-product) and `inventory/pipeline-views.ts`
 * (`reorderAlerts`, tenant-wide) so both surfaces round identically instead
 * of duplicating the logic. See `WORK/audits/
 * AUDIT_2026-07-28T184729Z-erp-procurement-demand-planning-gap.md` §13 item 1
 * and `WORK/FORWARD_PLAN.md` Phase 6 for why this exists: the MOQ/case_pack
 * data already existed on `product_suppliers` but no suggestion logic read
 * it, so a "suggested" quantity could be one the supplier would reject.
 *
 * Rules, in order:
 *   1. Never suggest less than 1 unit.
 *   2. If a case/pack size is configured, round up to the next multiple of it
 *      (you can't order 7 units of something sold in cases of 12).
 *   3. If an MOQ is configured and the case-rounded quantity is still below
 *      it, raise to the MOQ — itself rounded up to the next case multiple, so
 *      the MOQ floor never produces a non-orderable partial-case quantity.
 */
export function roundToOrderQuantity(
  rawQty: number,
  supplier?: { moq?: number | null; casePack?: number | null } | null,
): number {
  const moq = supplier?.moq != null && supplier.moq > 0 ? supplier.moq : null;
  const casePack = supplier?.casePack != null && supplier.casePack > 1 ? supplier.casePack : null;

  let qty = Math.max(1, Math.ceil(rawQty));
  if (casePack) qty = Math.ceil(qty / casePack) * casePack;
  if (moq && qty < moq) {
    qty = casePack ? Math.ceil(moq / casePack) * casePack : moq;
  }
  return qty;
}
