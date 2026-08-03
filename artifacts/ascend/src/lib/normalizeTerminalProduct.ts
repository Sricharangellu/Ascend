import type { TerminalProduct, Order, OrderLine, Payment } from "@/api-client/types";

/**
 * Normalize a catalog product from either wire shape into TerminalProduct.
 *
 * The real backend returns the canonical snake_case product (price_cents,
 * tax_class, …). The MSW mock layer historically returned a camelCase
 * "terminal" shape and later both shapes at once. The terminal components
 * were built against camelCase, so hitting the real backend rendered $NaN
 * prices and broke add-to-cart. Normalizing at the fetch boundary makes the
 * terminal indifferent to which layer served the product.
 */
export function normalizeTerminalProduct(raw: unknown): TerminalProduct {
  const r = raw as Record<string, unknown>;
  const pick = <T>(...vals: unknown[]): T | undefined =>
    vals.find((v) => v !== undefined && v !== null) as T | undefined;

  return {
    id: String(r.id ?? ""),
    sku: String(r.sku ?? ""),
    name: String(r.name ?? ""),
    priceCents: Number(pick(r.priceCents, r.price_cents) ?? 0),
    category: String(pick(r.category) ?? "general"),
    taxClass: (pick<string>(r.taxClass, r.tax_class) ?? "standard") as TerminalProduct["taxClass"],
    barcode: pick<string>(r.barcode) ?? undefined,
    status: (pick<string>(r.status) ?? "active") as TerminalProduct["status"],
    ageRestricted: Boolean(pick(r.ageRestricted, r.age_restricted) ?? false),
    restrictedStates: pick<string[]>(r.restrictedStates, r.restricted_states),
    tobaccoType: pick<string>(r.tobaccoType, r.tobacco_type) ?? null,
    flavored: Boolean(pick(r.flavored) ?? false),
    menthol: Boolean(pick(r.menthol) ?? false),
    msaReportable: Boolean(pick(r.msaReportable, r.msa_reportable) ?? false),
    lotTracked: Boolean(pick(r.lotTracked, r.lot_tracked) ?? false),
    createdAt: Number(pick(r.createdAt, r.created_at) ?? 0),
    updatedAt: Number(pick(r.updatedAt, r.updated_at) ?? 0),
  };
}

function pickField<T>(...vals: unknown[]): T | undefined {
  return vals.find((v) => v !== undefined && v !== null) as T | undefined;
}

/** Normalize an order from either wire shape (backend snake_case rows or
 *  mock camelCase) into the terminal's Order type. */
export function normalizeTerminalOrder(raw: unknown): Order {
  const r = raw as Record<string, unknown>;
  const rawLines = (pickField<unknown[]>(r.lines) ?? []) as Array<Record<string, unknown>>;
  const lines: OrderLine[] = rawLines.map((l) => ({
    id: String(l.id ?? ""),
    orderId: String(pickField(l.orderId, l.order_id) ?? r.id ?? ""),
    productId: String(pickField(l.productId, l.product_id) ?? ""),
    name: String(l.name ?? ""),
    quantity: Number(l.quantity ?? 0),
    unitCents: Number(pickField(l.unitCents, l.unit_cents) ?? 0),
    taxCents: Number(pickField(l.taxCents, l.tax_cents) ?? 0),
    lineCents: Number(pickField(l.lineCents, l.line_cents) ?? 0),
  } as OrderLine));

  return {
    id: String(r.id ?? ""),
    orderNumber: String(pickField(r.orderNumber, r.order_number) ?? ""),
    stateCode: (pickField<string>(r.stateCode, r.state_code) ?? "CA") as Order["stateCode"],
    status: (pickField<string>(r.status) ?? "open") as Order["status"],
    subtotalCents: Number(pickField(r.subtotalCents, r.subtotal_cents) ?? 0),
    discountCents: Number(pickField(r.discountCents, r.discount_cents) ?? 0),
    taxCents: Number(pickField(r.taxCents, r.tax_cents) ?? 0),
    totalCents: Number(pickField(r.totalCents, r.total_cents) ?? 0),
    customerId: pickField<string>(r.customerId, r.customer_id),
    lines,
    createdAt: Number(pickField(r.createdAt, r.created_at) ?? 0),
  } as Order;
}

/** Normalize a payment from either wire shape into the terminal's Payment type. */
export function normalizeTerminalPayment(raw: unknown): Payment {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    orderId: String(pickField(r.orderId, r.order_id) ?? ""),
    method: (pickField<string>(r.method) ?? "cash") as Payment["method"],
    amountCents: Number(pickField(r.amountCents, r.amount_cents) ?? 0),
    cashCents: Number(pickField(r.cashCents, r.cash_cents) ?? 0),
    cardCents: Number(pickField(r.cardCents, r.card_cents) ?? 0),
    changeCents: Number(pickField(r.changeCents, r.change_cents) ?? 0),
    cardLast4: pickField<string>(r.cardLast4, r.card_last4),
    authCode: pickField<string>(r.authCode, r.auth_code),
    status: (pickField<string>(r.status) ?? "captured") as Payment["status"],
    createdAt: Number(pickField(r.createdAt, r.created_at) ?? 0),
  } as Payment;
}
