
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/lib/router";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import type { CatalogProduct } from "@/api-client/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LocationStock {
  location_id: string;
  location_name: string;
  quantity_on_hand: number;
  quantity_committed: number;
  quantity_available: number;
  average_cost_cents: number | null;
}

interface StockSummary {
  total_on_hand: number;
  total_available: number;
  total_committed: number;
  locations: LocationStock[];
}

interface RecentSale {
  id: string;
  sale_number: string;
  date: number;
  quantity: number;
  total_cents: number;
  customer_name: string | null;
}

interface ExpiryBatch {
  expiry_status: string;
  expiry_date: number;
  quantity: number;
  lot_code?: string;
}

interface RecentPO {
  id: string;
  po_number: string;
  vendor_name: string;
  ordered_at: number;
  qty_ordered: number;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StockPill({ total, reorderPoint }: { total: number; reorderPoint: number }) {
  if (total === 0) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />Out of stock
    </span>
  );
  if (total <= reorderPoint) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Low stock
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />In stock
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OverviewTab({
  product,
  onNavigate,
}: {
  product: CatalogProduct;
  onNavigate: (tab: string) => void;
}) {
  const router = useRouter();

  const [stock, setStock]       = useState<StockSummary | null>(null);
  const [sales, setSales]       = useState<RecentSale[]>([]);
  const [expiry, setExpiry]     = useState<ExpiryBatch[]>([]);
  const [recentPos, setRecentPos] = useState<RecentPO[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const pid = product.id;
    await Promise.allSettled([
      // Stock summary
      apiGet<{ locations: LocationStock[] }>(`/api/v1/catalog/${pid}/stock`).then((r) => {
        const locs = r.locations ?? [];
        setStock({
          total_on_hand:   locs.reduce((s, l) => s + l.quantity_on_hand, 0),
          total_available: locs.reduce((s, l) => s + l.quantity_available, 0),
          total_committed: locs.reduce((s, l) => s + l.quantity_committed, 0),
          locations: locs,
        });
      }),
      // Recent sales
      apiGet<{ items: RecentSale[] }>(`/api/v1/catalog/${pid}/sales?limit=5`).then((r) =>
        setSales(r.items ?? [])
      ),
      // Expiry batches
      apiGet<{ items: ExpiryBatch[] }>(`/api/v1/catalog/${pid}/expiry`).then((r) =>
        setExpiry(r.items ?? [])
      ),
      // Recent POs
      apiGet<{ items: RecentPO[] }>(`/api/v1/catalog/${pid}/purchases`).then((r) =>
        setRecentPos((r.items ?? []).slice(0, 4))
      ),
    ]);
    setLoading(false);
  }, [product.id]);

  useEffect(() => { void load(); }, [load]);

  const reorderPoint = product.reorder_point ?? 0;
  const expiredCount = expiry.filter((b) => b.expiry_status === "expired").length;
  const criticalCount = expiry.filter((b) => b.expiry_status === "critical").length;
  const totalStock = stock?.total_on_hand ?? 0;

  const revenueThisMonth = sales
    .filter((s) => s.date >= Date.now() - 30 * 86_400_000)
    .reduce((sum, s) => sum + s.total_cents, 0);

  return (
    <div className="space-y-5">

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Stock */}
        <button
          type="button"
          onClick={() => onNavigate("inventory")}
          className="group rounded-xl border p-4 text-left shadow-[var(--shadow-sm)] transition-shadow hover:shadow-md"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
        >
          <p className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>Total stock</p>
          <p className="mt-1 text-[22px] font-bold" style={{ color: "var(--color-text-primary)" }}>
            {loading ? <span className="block h-7 w-12 animate-skeleton rounded" /> : totalStock.toLocaleString()}
          </p>
          {!loading && stock && (
            <div className="mt-1 flex gap-2 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              <span>{stock.total_available} avail</span>
              <span>·</span>
              <span>{stock.total_committed} committed</span>
            </div>
          )}
          <div className="mt-2">
            <StockPill total={totalStock} reorderPoint={reorderPoint} />
          </div>
        </button>

        {/* Revenue (30d) */}
        <button
          type="button"
          onClick={() => onNavigate("transactions")}
          className="group rounded-xl border p-4 text-left shadow-[var(--shadow-sm)] transition-shadow hover:shadow-md"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
        >
          <p className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>Revenue (30d)</p>
          <p className="mt-1 text-[22px] font-bold" style={{ color: "var(--color-text-primary)" }}>
            {loading ? <span className="block h-7 w-16 animate-skeleton rounded" /> : formatMoney(revenueThisMonth)}
          </p>
          {!loading && (
            <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>{sales.length} recent transactions</p>
          )}
          <p className="mt-2 text-[11px] font-medium text-brand-600 group-hover:underline">View transactions →</p>
        </button>

        {/* Expiry alerts */}
        <button
          type="button"
          onClick={() => onNavigate("expiry")}
          className={`group rounded-xl border p-4 text-left shadow-sm transition-shadow hover:shadow-md ${
            expiredCount > 0 ? "border-danger-200 bg-danger-50" : criticalCount > 0 ? "border-warning-200 bg-warning-50" : ""
          }`}
          style={expiredCount === 0 && criticalCount === 0 ? { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" } : {}}
        >
          <p className={`text-[11px] font-medium ${expiredCount > 0 ? "text-danger-600" : criticalCount > 0 ? "text-warning-600" : ""}`}
            style={expiredCount === 0 && criticalCount === 0 ? { color: "var(--color-text-muted)" } : {}}>
            Expiry alerts
          </p>
          <p className={`mt-1 text-[22px] font-bold ${expiredCount > 0 ? "text-danger-700" : criticalCount > 0 ? "text-warning-700" : ""}`}
            style={expiredCount === 0 && criticalCount === 0 ? { color: "var(--color-text-primary)" } : {}}>
            {loading ? <span className="block h-7 w-8 animate-skeleton rounded" /> : expiredCount + criticalCount}
          </p>
          {!loading && (
            <div className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              {expiredCount > 0 && <span className="text-red-500">{expiredCount} expired · </span>}
              {criticalCount > 0 && <span className="text-amber-500">{criticalCount} critical</span>}
              {expiredCount === 0 && criticalCount === 0 && <span>No alerts</span>}
            </div>
          )}
          <p className="mt-2 text-[11px] font-medium text-brand-600 group-hover:underline">View expiry →</p>
        </button>

        {/* Open POs */}
        <button
          type="button"
          onClick={() => onNavigate("purchasing")}
          className="group rounded-xl border p-4 text-left shadow-[var(--shadow-sm)] transition-shadow hover:shadow-md"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
        >
          <p className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>Purchase orders</p>
          <p className="mt-1 text-[22px] font-bold" style={{ color: "var(--color-text-primary)" }}>
            {loading ? <span className="block h-7 w-8 animate-skeleton rounded" /> : recentPos.length}
          </p>
          {!loading && (
            <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              {recentPos.filter((p) => p.status === "ordered" || p.status === "partial").length} in progress
            </p>
          )}
          <p className="mt-2 text-[11px] font-medium text-brand-600 group-hover:underline">View purchasing →</p>
        </button>
      </div>

      {/* ── Product snapshot ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Product info card */}
        <div className="rounded-xl border shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <div className="border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Product info</h3>
          </div>
          <div className="divide-y px-5" style={{ borderColor: "var(--color-table-border)" }}>
            {[
              { label: "SKU",          value: product.sku },
              { label: "Barcode",      value: product.barcode ?? "—" },
              { label: "Category",     value: product.category ?? "—" },
              { label: "Brand",        value: (product as unknown as Record<string, string>).brand ?? "—" },
              { label: "Tax class",    value: product.tax_class ?? "standard" },
              { label: "Retail price", value: formatMoney(product.price_cents) },
              { label: "Cost price",   value: product.raw_cost_price_cents ? formatMoney(product.raw_cost_price_cents) : "—" },
              { label: "Tracking",     value: product.track_inventory ? "Tracked" : "Untracked" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2.5">
                <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{label}</span>
                <span className="text-[11px] font-medium text-right max-w-[60%] truncate" style={{ color: "var(--color-text-primary)" }}>{value}</span>
              </div>
            ))}
          </div>
          <div className="border-t px-5 py-3" style={{ borderColor: "var(--color-border)" }}>
            <button
              type="button"
              onClick={() => onNavigate("general")}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Edit details →
            </button>
          </div>
        </div>

        {/* Stock by location */}
        <div className="rounded-xl border shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Stock by location</h3>
            <button type="button" onClick={() => onNavigate("inventory")} className="text-[11px] text-brand-600 hover:underline">
              All →
            </button>
          </div>
          {loading ? (
            <div className="space-y-2 p-4">{[1,2,3].map((i) => <div key={i} className="h-8 animate-skeleton rounded" />)}</div>
          ) : !stock || stock.locations.length === 0 ? (
            <p className="px-5 py-8 text-center text-[11px]" style={{ color: "var(--color-text-muted)" }}>No stock data</p>
          ) : (
            <div className="divide-y px-5" style={{ borderColor: "var(--color-table-border)" }}>
              {stock.locations.map((loc) => (
                <div key={loc.location_id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>{loc.location_name}</p>
                    <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{loc.quantity_committed} committed</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[13px] font-bold ${loc.quantity_on_hand === 0 ? "text-danger-600" : ""}`}
                      style={loc.quantity_on_hand > 0 ? { color: "var(--color-text-primary)" } : {}}>
                      {loc.quantity_on_hand}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{loc.quantity_available} avail</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent sales */}
        <div className="rounded-xl border shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Recent sales</h3>
            <button type="button" onClick={() => onNavigate("transactions")} className="text-[11px] text-brand-600 hover:underline">
              All →
            </button>
          </div>
          {loading ? (
            <div className="space-y-2 p-4">{[1,2,3].map((i) => <div key={i} className="h-8 animate-skeleton rounded" />)}</div>
          ) : sales.length === 0 ? (
            <p className="px-5 py-8 text-center text-[11px]" style={{ color: "var(--color-text-muted)" }}>No sales yet</p>
          ) : (
            <div className="divide-y px-5" style={{ borderColor: "var(--color-table-border)" }}>
              {sales.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-[12px] font-medium text-brand-600">{s.sale_number}</p>
                    <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{fmtDate(s.date)} · {s.customer_name ?? "Walk-in"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(s.total_cents)}</p>
                    <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>×{s.quantity}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Expiry alerts + Recent POs row ───────────────────────────────── */}
      {(expiredCount > 0 || criticalCount > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Expiry action required</p>
              <p className="mt-0.5 text-xs text-amber-700">
                {expiredCount > 0 && <span>{expiredCount} expired batch{expiredCount !== 1 ? "es" : ""} should be quarantined. </span>}
                {criticalCount > 0 && <span>{criticalCount} batch{criticalCount !== 1 ? "es" : ""} expire within 7 days.</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("expiry")}
              className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
            >
              Review expiry
            </button>
          </div>
        </div>
      )}

      {/* ── Recent purchase orders ───────────────────────────────────────── */}
      {recentPos.length > 0 && (
        <div className="rounded-xl border shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Recent purchase orders</h3>
            <button type="button" onClick={() => onNavigate("purchasing")} className="text-[11px] text-brand-600 hover:underline">
              All POs →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-secondary)" }}>PO</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-secondary)" }}>Supplier</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-secondary)" }}>Qty</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-secondary)" }}>Date</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-secondary)" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPos.map((po) => (
                  <tr key={po.id} className="border-b last:border-0 cursor-pointer transition-colors"
                    style={{ borderColor: "var(--color-table-border)" }}
                    onClick={() => router.push(`/purchasing/${po.id}`)}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                    <td className="px-4 py-2.5 font-medium text-brand-600">{po.po_number}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--color-text-secondary)" }}>{po.vendor_name}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "var(--color-text-primary)" }}>{po.qty_ordered}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(po.ordered_at)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                        po.status === "received" ? "bg-success-100 text-success-700" :
                        po.status === "partial" ? "bg-warning-100 text-warning-700" :
                        po.status === "ordered" ? "bg-info-100 text-info-700" :
                        "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]"
                      }`}>{po.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
