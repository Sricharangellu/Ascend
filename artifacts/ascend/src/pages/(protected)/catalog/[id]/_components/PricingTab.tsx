
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { apiGet, apiPost, apiPatch, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDateTime } from "@/lib/date";
import type { CatalogProduct } from "@/api-client/types";
import { useCapabilities } from "@/contexts/CapabilitiesContext";

interface PriceHistoryEntry {
  id: string;
  field: "selling" | "cost";
  old_price_cents: number | null;
  new_price_cents: number;
  changed_at: number;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PriceTier {
  id: string;
  product_id: string;
  min_qty: number;
  price_cents: number;
  label: string | null;
  created_at: number;
}

interface PriceBookEntry {
  id: string;
  price_book_id: string;
  price_book_name: string;
  price_cents: number;
  active: boolean;
}

interface PricingData {
  tiers: PriceTier[];
  price_books: PriceBookEntry[];
  wholesale_price_cents: number | null;
  map_price_cents: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border shadow-[var(--shadow-sm)]"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>{label}</label>
      {hint && <p className="mb-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>{hint}</p>}
      {children}
    </div>
  );
}

const INPUT = "w-full rounded-lg border px-3 py-2 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";

// ── Component ─────────────────────────────────────────────────────────────────

export function PricingTab({ product }: { product: CatalogProduct }) {
  const { capabilities } = useCapabilities();
  // Strict package separation: wholesale-only pricing UI (wholesale price,
  // quantity-break tiers, price books) renders solely for wholesale/hybrid
  // tenants. Unknown/loading counts as retail — contamination fails closed.
  // The backend scrubs these fields regardless; this keeps the UI honest.
  const businessType = capabilities?.business?.type;
  const wholesaleTenant = businessType === "wholesale" || businessType === "hybrid";

  const [data, setData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [wholesale, setWholesale] = useState("");
  const [map, setMap] = useState("");

  const [showAddTier, setShowAddTier] = useState(false);
  const [tierForm, setTierForm] = useState({ min_qty: "", price_cents: "", label: "" });
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiGet<PricingData>(`/api/v1/catalog/${product.id}/pricing`);
      setData(d);
      setWholesale(d.wholesale_price_cents != null ? (d.wholesale_price_cents / 100).toFixed(2) : "");
      setMap(d.map_price_cents != null ? (d.map_price_cents / 100).toFixed(2) : "");
      // Append-only price-change timeline (selling + cost). Non-fatal if it fails.
      apiGet<{ items: PriceHistoryEntry[] }>(`/api/v1/catalog/${product.id}/price-history?limit=20`)
        .then((h) => setHistory(h.items ?? []))
        .catch(() => { /* timeline is auxiliary */ });
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load pricing.");
    } finally { setLoading(false); }
  }, [product.id]);

  useEffect(() => { void load(); }, [load]);

  const saveMeta = async () => {
    setBusy(true);
    try {
      await apiPatch(`/api/v1/catalog/${product.id}/pricing`, {
        // Wholesale price is only sent by wholesale/hybrid tenants; the server
        // strips it for anyone else, so a retail save can never clobber it.
        ...(wholesaleTenant
          ? { wholesale_price_cents: wholesale ? Math.round(parseFloat(wholesale) * 100) : null }
          : {}),
        map_price_cents: map ? Math.round(parseFloat(map) * 100) : null,
      });
      await load();
    } finally { setBusy(false); }
  };

  const addTier = async () => {
    if (!tierForm.min_qty || !tierForm.price_cents) return;
    setBusy(true);
    try {
      await apiPost(`/api/v1/catalog/${product.id}/pricing/tiers`, {
        min_qty: parseInt(tierForm.min_qty),
        price_cents: Math.round(parseFloat(tierForm.price_cents) * 100),
        label: tierForm.label || null,
      });
      setTierForm({ min_qty: "", price_cents: "", label: "" });
      setShowAddTier(false);
      await load();
    } finally { setBusy(false); }
  };

  const deleteTier = async (tierId: string) => {
    setBusy(true);
    try {
      await fetch(`/api/v1/catalog/${product.id}/pricing/tiers/${tierId}`, { method: "DELETE" });
      await load();
    } finally { setBusy(false); }
  };

  const margin = product.raw_cost_price_cents && product.price_cents > 0
    ? ((product.price_cents - product.raw_cost_price_cents) / product.price_cents) * 100
    : null;

  if (loading) return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => <div key={i} className="h-32 animate-skeleton rounded-xl" />)}
    </div>
  );

  if (error) return (
    <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]"
      style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>
      {error}
    </p>
  );

  return (
    <div className="space-y-5">

      {/* ── Price summary ─────────────────────────────────────────────────── */}
      <Section title="Price Overview">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Retail Price",  value: formatMoney(product.price_cents), extra: "" },
            { label: "Cost Price",    value: product.raw_cost_price_cents ? formatMoney(product.raw_cost_price_cents) : "—", extra: "" },
            { label: "Gross Margin",  value: margin != null ? `${margin.toFixed(1)}%` : "—",
              extra: margin != null ? (margin >= 30 ? "text-emerald-600" : margin > 0 ? "text-amber-600" : "text-red-600") : "" },
            { label: "Markup",        value: (product.raw_cost_price_cents && product.raw_cost_price_cents > 0) ? `${(((product.price_cents - product.raw_cost_price_cents) / product.raw_cost_price_cents) * 100).toFixed(1)}%` : "—", extra: "" },
          ].map(({ label, value, extra }) => (
            <div key={label} className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-surface-subtle)" }}>
              <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
              <p className={`mt-1 text-[18px] font-bold ${extra}`}
                style={!extra ? { color: "var(--color-text-primary)" } : {}}>{value}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Wholesale (wholesale/hybrid tenants only) & MAP ───────────────── */}
      <Section title={wholesaleTenant ? "Wholesale & MAP Pricing" : "MAP Pricing"} action={
        <Button size="sm" variant="primary" onClick={saveMeta} disabled={busy}>Save</Button>
      }>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {wholesaleTenant && (
            <Field label="Wholesale Price" hint="Price shown to wholesale / B2B customers">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>$</span>
                <input className={`${INPUT} pl-6`} style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} value={wholesale} onChange={(e) => setWholesale(e.target.value)} placeholder="0.00" />
              </div>
            </Field>
          )}
          <Field label="MAP Price" hint="Minimum advertised price (enforcement is manual)">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>$</span>
              <input className={`${INPUT} pl-6`} style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} value={map} onChange={(e) => setMap(e.target.value)} placeholder="0.00" />
            </div>
          </Field>
        </div>
        {data && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4" style={{ color: "var(--color-text-secondary)" }}>
            {wholesaleTenant && (
              <span>Saved wholesale: <strong style={{ color: "var(--color-text-primary)" }}>{data.wholesale_price_cents != null ? formatMoney(data.wholesale_price_cents) : "—"}</strong></span>
            )}
            <span>Saved MAP: <strong style={{ color: "var(--color-text-primary)" }}>{data.map_price_cents != null ? formatMoney(data.map_price_cents) : "—"}</strong></span>
          </div>
        )}
      </Section>

      {/* ── Wholesale-only: quantity breaks + price books (WP-04 concepts) ── */}
      {wholesaleTenant && (<>
      <Section title="Quantity Break Pricing" action={
        <Button size="sm" variant="secondary" onClick={() => setShowAddTier((v) => !v)}>
          {showAddTier ? "Cancel" : "+ Add tier"}
        </Button>
      }>
        {showAddTier && (
          <div className="mb-4 rounded-xl border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-text-secondary)" }}>New Tier</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Min Qty *">
                <input type="number" min={1} className={INPUT}
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                  value={tierForm.min_qty} onChange={(e) => setTierForm((f) => ({ ...f, min_qty: e.target.value }))} placeholder="e.g. 6" />
              </Field>
              <Field label="Price ($) *">
                <input type="number" step="0.01" min={0} className={INPUT}
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                  value={tierForm.price_cents} onChange={(e) => setTierForm((f) => ({ ...f, price_cents: e.target.value }))} placeholder="0.00" />
              </Field>
              <Field label="Label">
                <input className={INPUT}
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                  value={tierForm.label} onChange={(e) => setTierForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Case" />
              </Field>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowAddTier(false)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={addTier} disabled={busy || !tierForm.min_qty || !tierForm.price_cents}>Add tier</Button>
            </div>
          </div>
        )}

        {data && data.tiers.length === 0 && !showAddTier ? (
          <p className="py-6 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No quantity break pricing set. Add a tier to offer bulk discounts.</p>
        ) : data && data.tiers.length > 0 ? (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-secondary)" }}>
                  <th className="px-4 py-2.5">Min Qty</th>
                  <th className="px-4 py-2.5">Label</th>
                  <th className="px-4 py-2.5">Unit Price</th>
                  <th className="px-4 py-2.5">Savings vs Retail</th>
                  <th className="px-4 py-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-table-border)]">
                {[...data.tiers].sort((a, b) => a.min_qty - b.min_qty).map((t) => {
                  const savings = product.price_cents - t.price_cents;
                  const pct = product.price_cents > 0 ? (savings / product.price_cents) * 100 : 0;
                  return (
                    <tr key={t.id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{t.min_qty}+</td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{t.label ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(t.price_cents)}</td>
                      <td className="px-4 py-3">
                        {savings > 0 ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            −{formatMoney(savings)} ({pct.toFixed(0)}%)
                          </span>
                        ) : <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => void deleteTier(t.id)} disabled={busy}
                          className="text-red-400 hover:text-red-600 disabled:opacity-40" aria-label="Delete tier">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Section>

      {/* ── Price Book Assignments ────────────────────────────────────────── */}
      <Section title="Price Book Assignments">
        {data && data.price_books.length === 0 ? (
          <p className="py-4 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No price book assignments.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-secondary)" }}>
                  <th className="px-4 py-2.5">Price Book</th>
                  <th className="px-4 py-2.5">Price</th>
                  <th className="px-4 py-2.5">vs Retail</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-table-border)]">
                {data?.price_books.map((pb) => {
                  const diff = product.price_cents - pb.price_cents;
                  const pct  = product.price_cents > 0 ? (diff / product.price_cents) * 100 : 0;
                  return (
                    <tr key={pb.id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{pb.price_book_name}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(pb.price_cents)}</td>
                      <td className="px-4 py-3 text-[11px]">
                        {diff > 0
                          ? <span className="text-emerald-600">−{pct.toFixed(0)}% off</span>
                          : diff < 0
                          ? <span className="text-red-500">+{Math.abs(pct).toFixed(0)}% above</span>
                          : <span style={{ color: "var(--color-text-muted)" }}>Same</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={pb.active ? "green" : "gray"}>{pb.active ? "Active" : "Inactive"}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      </>)}

      {/* Append-only price-change timeline — written by the backend on every
          selling/cost change (direct edit, bulk update, bulk price ops). */}
      <Section title="Price History">
        {history.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>No price changes recorded yet.</p>
        ) : (
          <ol className="space-y-2.5">
            {history.map((h) => {
              const up = h.old_price_cents != null && h.new_price_cents > h.old_price_cents;
              const down = h.old_price_cents != null && h.new_price_cents < h.old_price_cents;
              return (
                <li key={h.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${h.field === "selling" ? "bg-brand-600" : "bg-amber-400"}`} aria-hidden />
                  <span className="font-medium capitalize" style={{ color: "var(--color-text-secondary)" }}>{h.field === "selling" ? "Sell price" : "Cost"}</span>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    {h.old_price_cents != null ? formatMoney(h.old_price_cents) : "—"}
                    {" → "}
                    <span className={`font-semibold ${up ? "text-red-600" : down ? "text-emerald-600" : ""}`}
                      style={!up && !down ? { color: "var(--color-text-primary)" } : {}}>
                      {formatMoney(h.new_price_cents)}
                    </span>
                  </span>
                  <span className="ml-auto text-[11px]" style={{ color: "var(--color-text-muted)" }}>{fmtDateTime(h.changed_at)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

    </div>
  );
}
