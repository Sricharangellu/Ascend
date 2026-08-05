
/**
 * Sales History — retail POS transactions.
 *
 * Pattern per reference spec:
 *   Filter bar (Date · Time · Customer · Receipt/Note) → Clear / More filters / Search
 *   Expandable table rows → inline sale detail with actions
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { formatMoney } from "@/lib/money";
import { apiGet } from "@/api-client/client";
import { fmtDate, fmtDateTime } from "@/lib/date";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SaleRecord {
  id: string;
  receipt_number: string;
  created_at: number;
  customer_name: string | null;
  sold_by: string;
  outlet: string;
  note: string | null;
  total_cents: number;
  status: "completed" | "open" | "voided" | "returned";
  lines?: SaleLine[];
  payments?: SalePayment[];
}

interface SaleLine {
  qty: number;
  name: string;
  unit_price_cents: number;
  tax_cents: number;
  total_cents: number;
}

interface SalePayment {
  method: string;
  amount_cents: number;
  date: number;
}

// ── Avatar colors (vivid per reference spec) ──────────────────────────────────

const AVATAR_COLORS = [
  "#F97316", "#EAB308", "#8B5CF6", "#10B981", "#EC4899", "#3B82F6", "#EF4444", "#14B8A6",
];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}
function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// ── Status label ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  completed: "text-emerald-700",
  open:      "text-blue-600",
  voided:    "text-red-500",
  returned:  "text-amber-600",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SalesHistoryPage() {
  const [sales, setSales]       = useState<SaleRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter state
  const [filterDate, setFilterDate]       = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterReceipt, setFilterReceipt]   = useState("");
  const [filterStatus, setFilterStatus]     = useState("all");
  const [moreFilters, setMoreFilters]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ items: SaleRecord[] }>("/api/v1/sales/history");
      setSales(data.items ?? []);
    } catch {
      setError("Failed to load sales history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function clearFilters() {
    setFilterDate("");
    setFilterCustomer("");
    setFilterReceipt("");
    setFilterStatus("all");
  }

  // Client-side filter
  const visible = sales.filter(s => {
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (filterCustomer && !s.customer_name?.toLowerCase().includes(filterCustomer.toLowerCase())) return false;
    if (filterReceipt && !s.receipt_number.toLowerCase().includes(filterReceipt.toLowerCase())) return false;
    return true;
  });

  function fmt(ts: number) {
    return fmtDateTime(ts);
  }

  return (
    <EnterpriseShell active="sales" title="Sales History" subtitle="All register transactions">
      <div className="flex flex-col min-h-full">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Sales history</h1>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors hover:bg-[var(--color-surface-subtle)]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface)" }}
          >
            <DownloadIcon />
            Export list
          </button>
        </div>

        {/* ── Filter bar (reference pattern) ───────────────────────────────── */}
        <div className="border-b px-6 py-3" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <div className="flex flex-wrap items-end gap-3">
            {/* Date */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Date</label>
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="h-8 rounded-lg border px-2 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", backgroundColor: "var(--color-surface)" }}
              />
            </div>

            {/* Customer */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Customer</label>
              <input
                type="text"
                placeholder="Search customer"
                value={filterCustomer}
                onChange={e => setFilterCustomer(e.target.value)}
                className="h-8 w-36 rounded-lg border px-2 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", backgroundColor: "var(--color-surface)" }}
              />
            </div>

            {/* Receipt or note */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Receipt or note</label>
              <input
                type="text"
                placeholder="Receipt #, note…"
                value={filterReceipt}
                onChange={e => setFilterReceipt(e.target.value)}
                className="h-8 w-36 rounded-lg border px-2 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", backgroundColor: "var(--color-surface)" }}
              />
            </div>

            {/* More filters toggle */}
            {moreFilters && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Status</label>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="h-8 rounded-lg border px-2 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", backgroundColor: "var(--color-surface)" }}
                >
                  <option value="all">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="open">Open</option>
                  <option value="voided">Voided</option>
                  <option value="returned">Returned</option>
                </select>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 ml-auto">
              <button type="button" onClick={clearFilters} className="text-sm text-brand-600 hover:underline">
                Clear filters
              </button>
              <button type="button" onClick={() => setMoreFilters(m => !m)} className="text-sm text-brand-600 hover:underline">
                {moreFilters ? "Fewer filters" : "More filters"}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className="h-8 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-[#4a4cc8] transition-colors"
              >
                Search
              </button>
            </div>
          </div>

          {/* Results count */}
          {!loading && (
            <p className="mt-2 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              Showing <strong>{visible.length}</strong> sale{visible.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-x-auto">
          {error && (
            <div role="alert" className="m-4 rounded-lg border px-4 py-3 text-[13px]"
              style={{ borderColor: "var(--color-danger-border)", backgroundColor: "var(--color-danger-bg)", color: "var(--color-danger-text)" }}>{error}</div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ borderBottom: "1px solid var(--color-table-border)", backgroundColor: "var(--color-table-header)", color: "var(--color-text-secondary)" }}>
                <th className="w-6 px-4 py-3" />
                <th className="px-4 py-3">Receipt # &amp; date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Sold by</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3 text-right">Sale total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center" style={{ color: "var(--color-text-muted)" }}>
                    <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No sales found for the selected filters.</td>
                </tr>
              )}
              {visible.map(sale => (
                <Fragment key={sale.id}>
                  <tr
                    className="cursor-pointer transition-colors hover:bg-[var(--color-table-row-hover)]"
                    style={{ borderBottom: "1px solid var(--color-table-border)" }}
                    onClick={() => setExpandedId(expandedId === sale.id ? null : sale.id)}
                  >
                    {/* Expand chevron */}
                    <td className="px-4 py-3">
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`transition-transform ${expandedId === sale.id ? "rotate-90" : ""}`}
                        style={{ color: "var(--color-text-muted)" }}
                        aria-hidden="true"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>

                    {/* Receipt # + date */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-600">{sale.receipt_number}</p>
                      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{fmt(sale.created_at)}</p>
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      {sale.customer_name ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                    </td>

                    {/* Sold by — avatar + name + outlet */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold text-white shrink-0"
                          style={{ backgroundColor: avatarColor(sale.sold_by) }}
                          aria-hidden="true"
                        >
                          {initials(sale.sold_by)}
                        </div>
                        <div>
                          <p className="text-[11px] font-medium" style={{ color: "var(--color-text-primary)" }}>{sale.sold_by}</p>
                          <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{sale.outlet}</p>
                        </div>
                      </div>
                    </td>

                    {/* Note */}
                    <td className="px-4 py-3 italic text-[11px] max-w-[160px] truncate" style={{ color: "var(--color-text-muted)" }}>
                      {sale.note ?? "—"}
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                      {formatMoney(sale.total_cents)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`capitalize font-medium ${STATUS_STYLE[sale.status] ?? "text-[#555]"}`}>
                        {sale.status}
                      </span>
                    </td>
                  </tr>

                  {/* ── Expanded detail row ───────────────────────────────── */}
                  {expandedId === sale.id && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <SaleDetailPanel sale={sale} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </EnterpriseShell>
  );
}

// ── Sale detail panel (expanded inline row) ───────────────────────────────────

function SaleDetailPanel({ sale }: { sale: SaleRecord }) {
  const lines: SaleLine[] = sale.lines ?? [
    { qty: 1, name: "Item (demo)", unit_price_cents: sale.total_cents, tax_cents: 0, total_cents: sale.total_cents },
  ];
  const payments: SalePayment[] = sale.payments ?? [
    { method: "Cash", amount_cents: sale.total_cents, date: sale.created_at },
  ];

  const subtotal = lines.reduce((s, l) => s + l.total_cents - l.tax_cents, 0);
  const tax      = lines.reduce((s, l) => s + l.tax_cents, 0);

  return (
    <div className="bg-[#2a2a2a] text-white px-6 py-5">
      {/* Tab bar */}
      <div className="mb-4 border-b border-white/10">
        <button type="button" className="pb-2 text-sm font-medium text-white border-b-2 border-brand-600">
          Sale details
        </button>
      </div>

      <div className="flex gap-8">
        {/* Line items */}
        <div className="flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-white/40 uppercase">
                <th className="pb-2">Qty</th>
                <th className="pb-2">Product</th>
                <th className="pb-2 text-right">Price</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2 text-white/60">{l.qty}</td>
                  <td className="py-2 font-medium text-white">{l.name}</td>
                  <td className="py-2 text-right text-white/70">
                    {formatMoney(l.unit_price_cents)}
                    {l.tax_cents > 0 && <span className="ml-1 text-[11px] text-white/40">+tax</span>}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatMoney(l.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary */}
          <div className="mt-3 border-t border-white/10 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-white/60">
              <span>Subtotal</span><span>{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Total tax</span><span>{formatMoney(tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-white text-base uppercase">
              <span>Sale total</span><span>{formatMoney(sale.total_cents)}</span>
            </div>
            {payments.map((p, i) => (
              <div key={i} className="flex justify-between text-white/50 text-xs">
                <span>{p.method} · {fmtDate(new Date(p.date).getTime())}</span>
                <span>{formatMoney(p.amount_cents)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 min-w-[140px]">
          <ActionBtn primary>Return items</ActionBtn>
          <ActionBtn>Edit</ActionBtn>
          <ActionBtn>Gift receipt</ActionBtn>
          <ActionBtn>Email receipt</ActionBtn>
          <ActionBtn>Print receipt</ActionBtn>
          <ActionBtn danger>Void</ActionBtn>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ children, primary, danger }: { children: React.ReactNode; primary?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      className={[
        "w-full rounded px-4 py-2 text-sm font-medium text-left transition-colors",
        primary ? "bg-brand-600 text-white hover:bg-[#4a4cc8]" :
        danger  ? "bg-transparent text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600" :
                  "bg-white/10 text-white hover:bg-white/20",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
