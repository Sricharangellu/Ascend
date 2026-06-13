/**
 * MSW handlers for the Cycle-3 backend modules (customers, gift cards, webhooks,
 * inventory overview, team). Kept in a separate file so the backend agent can
 * add/maintain these without colliding with the frontend's edits to handlers.ts.
 * Wired into the main array via `...lightspeedHandlers`.
 *
 * Shapes mirror the live API (see orchestration/BACKEND_HANDOFF.md).
 */
import { http, HttpResponse, delay } from "msw";

const V1 = "*/api/v1";
const lat = () => delay(Math.floor(Math.random() * 120) + 60);
const rid = () => `mock-${Math.random().toString(36).slice(2, 10)}`;

// ── In-memory dev stores ────────────────────────────────────────────────────
const customers = new Map<string, any>();
const giftcards = new Map<string, any>();
let webhooks: any[] = [];
// Fulfillment / WMS dev stores
let locations: any[] = [];
const productLocations = new Map<string, string>(); // productId -> locationId
let pickLists: any[] = [];
const pickLines = new Map<string, any[]>(); // pickListId -> lines

function seed() {
  if (customers.size === 0) {
    customers.set("cus_demo_1", { id: "cus_demo_1", tenant_id: "tnt_demo", name: "Ada Lovelace", email: "ada@example.com", phone: null, points: 240, created_at: Date.now() });
    customers.set("cus_demo_2", { id: "cus_demo_2", tenant_id: "tnt_demo", name: "Grace Hopper", email: "grace@example.com", phone: null, points: 80, created_at: Date.now() });
  }
}
seed();

export const lightspeedHandlers = [
  // ── Inventory overview ────────────────────────────────────────────────────
  http.get(`${V1}/inventory/overview`, async () => {
    await lat();
    const items = [
      { id: "prod_1", sku: "GRO-COFFEE-001", name: "Organic Dark Roast Beans", price_cents: 1499, category: "groceries", status: "active", stock_qty: 42, reorder_pt: 10, low_stock: false },
      { id: "prod_2", sku: "GRO-HONEY-001", name: "Wildflower Honey", price_cents: 899, category: "groceries", status: "active", stock_qty: 6, reorder_pt: 8, low_stock: true },
      { id: "prod_3", sku: "APP-TSHIRT-001", name: "Finder Logo T-Shirt", price_cents: 2200, category: "apparel", status: "active", stock_qty: 17, reorder_pt: 5, low_stock: false },
      { id: "prod_4", sku: "HOME-MUG-001", name: "Ceramic Coffee Mug", price_cents: 1200, category: "home", status: "active", stock_qty: 0, reorder_pt: 4, low_stock: true },
    ];
    return HttpResponse.json({ items });
  }),

  // ── Reports: top products (best sellers by revenue) ───────────────────────
  http.get(`${V1}/reports/top-products`, async () => {
    await lat();
    return HttpResponse.json({
      items: [
        { productId: "prod_1", name: "Latte", units: 34, revenueCents: 16966 },
        { productId: "prod_4", name: "Butter Croissant", units: 21, revenueCents: 6825 },
        { productId: "prod_6", name: "Cold Brew", units: 18, revenueCents: 9882 },
        { productId: "prod_9", name: "Matcha Latte", units: 12, revenueCents: 6348 },
      ],
    });
  }),

  // ── Purchasing: suppliers + purchase orders ───────────────────────────────
  http.get(`${V1}/purchasing/suppliers`, async () => {
    await lat();
    return HttpResponse.json({ items: [
      { id: "sup_acme", tenant_id: "tnt_demo", name: "Acme Coffee Co", email: "orders@acme.example", created_at: Date.now() },
      { id: "sup_tea", tenant_id: "tnt_demo", name: "Tea Traders", email: null, created_at: Date.now() },
    ] });
  }),
  http.post(`${V1}/purchasing/suppliers`, async ({ request }) => {
    await lat();
    const b = (await request.json()) as { name?: string; email?: string };
    return HttpResponse.json({ id: `sup_${Math.random().toString(36).slice(2, 10)}`, tenant_id: "tnt_demo", name: b.name, email: b.email ?? null, created_at: Date.now() }, { status: 201 });
  }),
  http.get(`${V1}/purchasing/orders`, async () => {
    await lat();
    return HttpResponse.json({ items: [
      { id: "po_1", tenant_id: "tnt_demo", supplier_id: "sup_acme", status: "received", total_cost_cents: 24000, created_at: Date.now() - 86400000, received_at: Date.now() - 3600000 },
      { id: "po_2", tenant_id: "tnt_demo", supplier_id: "sup_tea", status: "ordered", total_cost_cents: 11250, created_at: Date.now() - 3600000, received_at: null },
    ] });
  }),
  http.post(`${V1}/purchasing/orders`, async ({ request }) => {
    await lat();
    const b = (await request.json()) as { supplierId: string; lines: Array<{ productId: string; quantity: number; unitCostCents: number }> };
    const lines = b.lines.map((l, i) => ({ id: `pol_${i}`, tenant_id: "tnt_demo", po_id: "po_new", product_id: l.productId, quantity: l.quantity, unit_cost_cents: l.unitCostCents, line_cost_cents: l.quantity * l.unitCostCents }));
    const total = lines.reduce((s, l) => s + l.line_cost_cents, 0);
    return HttpResponse.json({ id: "po_new", tenant_id: "tnt_demo", supplier_id: b.supplierId, status: "ordered", total_cost_cents: total, created_at: Date.now(), received_at: null, lines }, { status: 201 });
  }),
  http.post(`${V1}/purchasing/orders/:id/receive`, async ({ params }) => {
    await lat();
    return HttpResponse.json({ id: String(params.id), tenant_id: "tnt_demo", supplier_id: "sup_acme", status: "received", total_cost_cents: 24000, created_at: Date.now() - 3600000, received_at: Date.now(), lines: [] });
  }),

  // ── Inventory: near-expiry report ─────────────────────────────────────────
  http.get(`${V1}/inventory/expiring`, async () => {
    await lat();
    const D = 86400000, now = Date.now();
    return HttpResponse.json({ items: [
      { id: "lot_1", product_id: "prod_2", name: "Wildflower Honey", lot_code: "L-2401", expiry_date: now + 5 * D, qty_on_hand: 6, days_to_expiry: 5 },
      { id: "lot_2", product_id: "prod_1", name: "Organic Dark Roast Beans", lot_code: "L-2402", expiry_date: now + 12 * D, qty_on_hand: 18, days_to_expiry: 12 },
      { id: "lot_3", product_id: "prod_4", name: "Ceramic Coffee Mug", lot_code: "L-2403", expiry_date: now + 27 * D, qty_on_hand: 4, days_to_expiry: 27 },
    ] });
  }),

  // ── Inventory: already-expired + value-at-risk ────────────────────────────
  http.get(`${V1}/inventory/expired`, async () => {
    await lat();
    const D = 86400000, now = Date.now();
    return HttpResponse.json({ items: [
      { id: "lot_x1", product_id: "prod_2", name: "Wildflower Honey", lot_code: "L-2312", expiry_date: now - 3 * D, qty_on_hand: 4, unit_cost_cents: 500, po_id: null, received_at: now - 60 * D, days_overdue: 3 },
    ] });
  }),
  http.get(`${V1}/inventory/expiry-summary`, async () => {
    await lat();
    return HttpResponse.json({
      expired: { lots: 1, units: 4, valueCents: 2000 },
      expiringSoon: { lots: 3, units: 28, valueCents: 9400, withinDays: 30 },
    });
  }),

  // ── Vendors + AP credits (chargebacks / credit memos) ─────────────────────
  http.get(`${V1}/purchasing/vendors`, async () => {
    await lat();
    return HttpResponse.json({ items: [
      { id: "sup_acme", tenant_id: "tnt_demo", name: "Acme Coffee Co", email: "orders@acme.example", created_at: Date.now(), poCount: 6, totalSpentCents: 184200, openCreditsCents: 5000 },
      { id: "sup_tea", tenant_id: "tnt_demo", name: "Tea Traders", email: null, created_at: Date.now(), poCount: 2, totalSpentCents: 41250, openCreditsCents: 0 },
    ] });
  }),
  http.get(`${V1}/purchasing/vendor-credits`, async () => {
    await lat();
    return HttpResponse.json({ items: [
      { id: "vcr_1", tenant_id: "tnt_demo", supplier_id: "sup_acme", type: "chargeback", amount_cents: 5000, reason: "expired stock return", po_id: null, status: "open", created_at: Date.now() - 86400000, updated_at: Date.now() - 86400000 },
      { id: "vcr_2", tenant_id: "tnt_demo", supplier_id: "sup_acme", type: "credit_memo", amount_cents: 2200, reason: "price adjustment", po_id: null, status: "applied", created_at: Date.now() - 3 * 86400000, updated_at: Date.now() - 3 * 86400000 },
    ] });
  }),
  http.get(`${V1}/purchasing/returns`, async () => {
    await lat();
    return HttpResponse.json({ items: [
      { id: "ret_1", tenant_id: "tnt_demo", supplier_id: "sup_acme", reason: "expired", total_cost_cents: 1200, credit_id: "vcr_9", status: "recorded", created_at: Date.now() - 86400000 },
      { id: "ret_2", tenant_id: "tnt_demo", supplier_id: "sup_tea", reason: "damaged", total_cost_cents: 450, credit_id: null, status: "recorded", created_at: Date.now() - 2 * 86400000 },
    ] });
  }),
  http.post(`${V1}/purchasing/returns`, async ({ request }) => {
    await lat();
    const b = (await request.json()) as { supplierId?: string; reason: string; createCredit?: boolean; lines: Array<{ quantity: number; unitCostCents?: number }> };
    const total = b.lines.reduce((s, l) => s + l.quantity * (l.unitCostCents ?? 0), 0);
    return HttpResponse.json({ id: `ret_${Math.random().toString(36).slice(2, 10)}`, tenant_id: "tnt_demo", supplier_id: b.supplierId ?? null, reason: b.reason, total_cost_cents: total, credit_id: b.createCredit && b.supplierId ? `vcr_${Math.random().toString(36).slice(2, 8)}` : null, status: "recorded", created_at: Date.now() }, { status: 201 });
  }),
  http.post(`${V1}/purchasing/vendor-credits`, async ({ request }) => {
    await lat();
    const b = (await request.json()) as { supplierId: string; type: string; amountCents: number; reason?: string };
    return HttpResponse.json({ id: `vcr_${Math.random().toString(36).slice(2, 10)}`, tenant_id: "tnt_demo", supplier_id: b.supplierId, type: b.type, amount_cents: b.amountCents, reason: b.reason ?? null, po_id: null, status: "open", created_at: Date.now(), updated_at: Date.now() }, { status: 201 });
  }),

  // ── Billing: bills (AP) + invoices (AR) ───────────────────────────────────
  http.get(`${V1}/billing/bills`, async () => {
    await lat();
    return HttpResponse.json({ items: [
      { id: "bil_1", tenant_id: "tnt_demo", supplier_id: "sup_acme", po_id: "po_1", bill_number: "BILL-00001", status: "open", total_cents: 24000, paid_cents: 0, due_date: Date.now() + 30 * 86400000, issued_at: Date.now() - 2 * 86400000 },
      { id: "bil_2", tenant_id: "tnt_demo", supplier_id: "sup_tea", po_id: "po_2", bill_number: "BILL-00002", status: "partial", total_cents: 11250, paid_cents: 5000, due_date: Date.now() + 20 * 86400000, issued_at: Date.now() - 86400000 },
    ] });
  }),
  http.get(`${V1}/billing/invoices`, async () => {
    await lat();
    return HttpResponse.json({ items: [
      { id: "inv_1", tenant_id: "tnt_demo", customer_id: "cus_demo_1", order_id: "ord_a", invoice_number: "INV-00001", status: "paid", total_cents: 8600, paid_cents: 8600, due_date: Date.now() + 15 * 86400000, issued_at: Date.now() - 5 * 86400000 },
      { id: "inv_2", tenant_id: "tnt_demo", customer_id: "cus_demo_2", order_id: null, invoice_number: "INV-00002", status: "open", total_cents: 4200, paid_cents: 0, due_date: Date.now() + 30 * 86400000, issued_at: Date.now() },
    ] });
  }),

  // ── Reports: hourly sales rhythm ──────────────────────────────────────────
  http.get(`${V1}/reports/hourly`, async () => {
    await lat();
    const peak = [0,0,0,0,0,0,0,5,42,60,78,70,56,40,38,55,64,58,47,30,18,8,2,0];
    const max = Math.max(...peak);
    const fmt = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
    return HttpResponse.json({
      items: peak.map((rev, hour) => ({ hour, label: fmt(hour), orderCount: Math.round(rev / 8), revenueCents: rev * 100, value: Math.round((rev / max) * 100) })),
    });
  }),

  // ── Outlets + registers (store/register selector) ─────────────────────────
  http.get(`${V1}/outlets`, async () => {
    await lat();
    return HttpResponse.json({
      items: [
        { id: "otl_main", tenant_id: "tnt_demo", name: "Main Store", timezone: "America/Los_Angeles", created_at: Date.now(), updated_at: Date.now(),
          registers: [
            { id: "reg_1", tenant_id: "tnt_demo", outlet_id: "otl_main", name: "Register 1", status: "open", created_at: Date.now(), updated_at: Date.now() },
            { id: "reg_2", tenant_id: "tnt_demo", outlet_id: "otl_main", name: "Register 2", status: "closed", created_at: Date.now(), updated_at: Date.now() },
          ] },
        { id: "otl_dt", tenant_id: "tnt_demo", name: "Downtown", timezone: "America/Los_Angeles", created_at: Date.now(), updated_at: Date.now(),
          registers: [{ id: "reg_3", tenant_id: "tnt_demo", outlet_id: "otl_dt", name: "Till A", status: "closed", created_at: Date.now(), updated_at: Date.now() }] },
      ],
    });
  }),

  // ── Inventory levels (frontend-requested shape) ───────────────────────────
  http.get(`${V1}/inventory/levels`, async () => {
    await lat();
    const mk = (id: string, sku: string, name: string, category: string, priceCents: number, onHand: number, reorderPoint: number) => ({
      id, sku, name, category, status: "active", priceCents, onHand, committed: 0, available: onHand, reorderPoint, lowStock: reorderPoint > 0 && onHand <= reorderPoint, costCents: null, velocity: 0,
    });
    return HttpResponse.json({
      pageSize: 100,
      items: [
        mk("prod_1", "GRO-COFFEE-001", "Organic Dark Roast Beans", "groceries", 1499, 42, 10),
        mk("prod_2", "GRO-HONEY-001", "Wildflower Honey", "groceries", 899, 6, 8),
        mk("prod_3", "APP-TSHIRT-001", "Finder Logo T-Shirt", "apparel", 2200, 17, 5),
        mk("prod_4", "HOME-MUG-001", "Ceramic Coffee Mug", "home", 1200, 0, 4),
      ],
    });
  }),

  // ── Customers + loyalty ───────────────────────────────────────────────────
  http.get(`${V1}/customers`, async () => {
    await lat();
    return HttpResponse.json({ items: Array.from(customers.values()) });
  }),
  http.post(`${V1}/customers`, async ({ request }) => {
    await lat();
    const b = (await request.json()) as { name?: string; email?: string; phone?: string };
    if (!b.name) return HttpResponse.json({ error: { code: "VALIDATION_ERROR", message: "name required", requestId: rid() } }, { status: 400 });
    const c = { id: `cus_${Math.random().toString(36).slice(2, 12)}`, tenant_id: "tnt_demo", name: b.name, email: b.email ?? null, phone: b.phone ?? null, points: 0, created_at: Date.now() };
    customers.set(c.id, c);
    return HttpResponse.json(c, { status: 201 });
  }),
  http.get(`${V1}/customers/:id/summary`, async ({ params }) => {
    await lat();
    const c = customers.get(String(params.id)) ?? { id: String(params.id), name: "Customer", email: null, phone: null, points: 0 };
    return HttpResponse.json({
      customer: { id: c.id, name: c.name, email: c.email, phone: c.phone, points: c.points },
      visits: 7, totalSpentCents: 18940, avgOrderCents: 2706, lastVisitAt: Date.now() - 86400000,
      recentOrders: [
        { id: "ord_a", orderNumber: "FP-A1", status: "completed", totalCents: 3120, createdAt: Date.now() - 86400000 },
        { id: "ord_b", orderNumber: "FP-B2", status: "completed", totalCents: 2480, createdAt: Date.now() - 3 * 86400000 },
        { id: "ord_c", orderNumber: "FP-C3", status: "refunded", totalCents: 1990, createdAt: Date.now() - 9 * 86400000 },
      ],
    });
  }),
  http.get(`${V1}/customers/:id`, async ({ params }) => {
    await lat();
    const c = customers.get(String(params.id));
    return c ? HttpResponse.json(c) : HttpResponse.json({ error: { code: "not_found", message: "customer not found", requestId: rid() } }, { status: 404 });
  }),
  http.post(`${V1}/customers/:id/redeem`, async ({ params, request }) => {
    await lat();
    const c = customers.get(String(params.id));
    if (!c) return HttpResponse.json({ error: { code: "not_found", message: "customer not found", requestId: rid() } }, { status: 404 });
    const { points } = (await request.json()) as { points: number };
    if (!points || points % 100 !== 0) return HttpResponse.json({ error: { code: "bad_request", message: "points must be a positive multiple of 100", requestId: rid() } }, { status: 400 });
    if (c.points < points) return HttpResponse.json({ error: { code: "insufficient_points", message: "insufficient points", requestId: rid() } }, { status: 400 });
    c.points -= points;
    return HttpResponse.json({ pointsRemaining: c.points, valueCents: (points / 100) * 500 });
  }),

  // ── Gift cards ────────────────────────────────────────────────────────────
  http.post(`${V1}/giftcards`, async ({ request }) => {
    await lat();
    const { amountCents } = (await request.json()) as { amountCents: number };
    if (!amountCents || amountCents <= 0) return HttpResponse.json({ error: { code: "bad_request", message: "amountCents must be positive", requestId: rid() } }, { status: 400 });
    const block = () => Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    const card = { id: `gft_${Math.random().toString(36).slice(2, 12)}`, tenant_id: "tnt_demo", code: `GC-${block()}-${block()}-${block()}`, initial_cents: amountCents, balance_cents: amountCents, status: "active", created_at: Date.now() };
    giftcards.set(card.code, card);
    return HttpResponse.json(card, { status: 201 });
  }),
  http.get(`${V1}/giftcards/:code`, async ({ params }) => {
    await lat();
    const card = giftcards.get(String(params.code));
    return card ? HttpResponse.json(card) : HttpResponse.json({ error: { code: "not_found", message: "gift card not found", requestId: rid() } }, { status: 404 });
  }),
  http.post(`${V1}/giftcards/:code/redeem`, async ({ params, request }) => {
    await lat();
    const card = giftcards.get(String(params.code));
    if (!card) return HttpResponse.json({ error: { code: "not_found", message: "gift card not found", requestId: rid() } }, { status: 404 });
    const { amountCents } = (await request.json()) as { amountCents: number };
    if (card.balance_cents < amountCents) return HttpResponse.json({ error: { code: "insufficient_balance", message: "insufficient balance", requestId: rid() } }, { status: 400 });
    card.balance_cents -= amountCents;
    card.status = card.balance_cents === 0 ? "redeemed" : "active";
    return HttpResponse.json({ code: card.code, redeemedCents: amountCents, balanceCents: card.balance_cents, status: card.status });
  }),

  // ── Team (Settings → Users) ───────────────────────────────────────────────
  http.get(`${V1}/team`, async () => {
    await lat();
    return HttpResponse.json({
      items: [
        { id: "usr_demo_owner", email: "owner@finder-pos.dev", role: "owner", created_at: Date.now() },
        { id: "usr_demo_cashier", email: "cashier@finder-pos.dev", role: "cashier", created_at: Date.now() },
      ],
    });
  }),

  // ── Webhooks (Settings → Webhooks) ────────────────────────────────────────
  http.get(`${V1}/webhooks`, async () => {
    await lat();
    return HttpResponse.json({ items: webhooks });
  }),
  http.post(`${V1}/webhooks`, async ({ request }) => {
    await lat();
    const b = (await request.json()) as { url?: string; eventTypes?: string[] };
    if (!b.url) return HttpResponse.json({ error: { code: "bad_request", message: "url required", requestId: rid() } }, { status: 400 });
    const sub = { id: `whk_${Math.random().toString(36).slice(2, 12)}`, tenant_id: "tnt_demo", url: b.url, event_types: b.eventTypes?.join(",") || "*", secret: Math.random().toString(36).slice(2), active: true, created_at: Date.now() };
    webhooks.push(sub);
    return HttpResponse.json(sub, { status: 201 });
  }),
  http.delete(`${V1}/webhooks/:id`, async ({ params }) => {
    await lat();
    webhooks = webhooks.filter((w) => w.id !== String(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  // ── Fulfillment / WMS (Operations → Locations, Pick & Pack) ───────────────
  http.get(`${V1}/fulfillment/locations`, async () => {
    await lat();
    return HttpResponse.json({ items: [...locations].sort((a, b) => a.code.localeCompare(b.code)) });
  }),
  http.post(`${V1}/fulfillment/locations`, async ({ request }) => {
    await lat();
    const b = (await request.json()) as { code?: string; name?: string; kind?: string };
    if (!b.code) return HttpResponse.json({ error: { code: "bad_request", message: "code required", requestId: rid() } }, { status: 400 });
    if (locations.some((l) => l.code === b.code)) return HttpResponse.json({ error: { code: "duplicate", message: `location code '${b.code}' already exists`, requestId: rid() } }, { status: 409 });
    const loc = { id: `loc_${Math.random().toString(36).slice(2, 12)}`, tenant_id: "tnt_demo", code: b.code, name: b.name ?? null, kind: b.kind ?? "bin", created_at: Date.now() };
    locations.push(loc);
    return HttpResponse.json(loc, { status: 201 });
  }),
  http.post(`${V1}/fulfillment/assign`, async ({ request }) => {
    await lat();
    const b = (await request.json()) as { productId?: string; locationId?: string };
    if (!locations.some((l) => l.id === b.locationId)) return HttpResponse.json({ error: { code: "not_found", message: `location '${b.locationId}' not found`, requestId: rid() } }, { status: 404 });
    productLocations.set(String(b.productId), String(b.locationId));
    return HttpResponse.json({ ok: true });
  }),
  http.get(`${V1}/fulfillment/pick-lists`, async () => {
    await lat();
    return HttpResponse.json({ items: [...pickLists].sort((a, b) => b.created_at - a.created_at) });
  }),
  http.post(`${V1}/fulfillment/pick-lists`, async ({ request }) => {
    await lat();
    const b = (await request.json()) as { orderId?: string };
    const existing = pickLists.find((p) => p.order_id === b.orderId);
    if (existing) return HttpResponse.json({ ...existing, lines: pickLines.get(existing.id) ?? [] });
    const id = `pik_${Math.random().toString(36).slice(2, 12)}`;
    const now = Date.now();
    // Demo: two lines resolved to their assigned location codes, sorted into a pick path.
    const lines = [
      { id: `pkl_${Math.random().toString(36).slice(2, 10)}`, tenant_id: "tnt_demo", pick_list_id: id, product_id: "prod_demo_b", name: "Bread", quantity: 3, picked_qty: 0, location_code: codeFor("prod_demo_b"), status: "pending" },
      { id: `pkl_${Math.random().toString(36).slice(2, 10)}`, tenant_id: "tnt_demo", pick_list_id: id, product_id: "prod_demo_a", name: "Apple", quantity: 2, picked_qty: 0, location_code: codeFor("prod_demo_a"), status: "pending" },
    ].sort((a, b2) => String(a.location_code ?? "~").localeCompare(String(b2.location_code ?? "~")));
    const pl = { id, tenant_id: "tnt_demo", order_id: String(b.orderId), status: "picking", created_at: now, updated_at: now };
    pickLists.push(pl);
    pickLines.set(id, lines);
    return HttpResponse.json({ ...pl, lines }, { status: 201 });
  }),
  http.get(`${V1}/fulfillment/pick-lists/:id`, async ({ params }) => {
    await lat();
    const pl = pickLists.find((p) => p.id === String(params.id));
    if (!pl) return HttpResponse.json({ error: { code: "not_found", message: "pick list not found", requestId: rid() } }, { status: 404 });
    return HttpResponse.json({ ...pl, lines: pickLines.get(pl.id) ?? [] });
  }),
  http.post(`${V1}/fulfillment/pick-lists/:id/lines/:lineId/pick`, async ({ params }) => {
    await lat();
    const pl = pickLists.find((p) => p.id === String(params.id));
    if (!pl) return HttpResponse.json({ error: { code: "not_found", message: "pick list not found", requestId: rid() } }, { status: 404 });
    const lines = pickLines.get(pl.id) ?? [];
    const line = lines.find((l) => l.id === String(params.lineId));
    if (line) { line.picked_qty = line.quantity; line.status = "picked"; }
    if (lines.every((l) => l.status === "picked")) { pl.status = "picked"; pl.updated_at = Date.now(); }
    return HttpResponse.json({ ...pl, lines });
  }),
  http.post(`${V1}/fulfillment/pick-lists/:id/pack`, async ({ params }) => {
    await lat();
    const pl = pickLists.find((p) => p.id === String(params.id));
    if (!pl) return HttpResponse.json({ error: { code: "not_found", message: "pick list not found", requestId: rid() } }, { status: 404 });
    const lines = pickLines.get(pl.id) ?? [];
    if (lines.some((l) => l.status !== "picked")) return HttpResponse.json({ error: { code: "not_picked", message: "all lines must be picked before packing", requestId: rid() } }, { status: 409 });
    pl.status = "packed"; pl.updated_at = Date.now();
    return HttpResponse.json({ ...pl, lines });
  }),
];

function codeFor(productId: string): string | null {
  const locId = productLocations.get(productId);
  return locations.find((l) => l.id === locId)?.code ?? null;
}
