import { redirect } from "next/navigation";

/**
 * Retired (2026-08-02, Ponytail Wave 0): this page called MSW-only
 * `/api/v1/sales/history` (no backend route) — blank/broken in production.
 * Canonical retail sales history is `/orders` → real `/api/v1/orders`.
 */
<<<<<<< HEAD

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { formatMoney } from "@/lib/money";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
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
  lines: SaleLine[];
  payments: SalePayment[];
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
  const router = useRouter();
  const { addToast } = useToast();
  const [sales, setSales]       = useState<SaleRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<SaleRecord | null>(null);
  const [voiding, setVoiding] = useState(false);

  // Filter state
  const [filterDate, setFilterDate]       = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterReceipt, setFilterReceipt]   = useState("");
  const [filterStatus, setFilterStatus]     = useState("all");
  const [moreFilters, setMoreFilters]       = useState(false);

  const load = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      const q = filterReceipt.trim() || filterCustomer.trim();
      if (q) params.set("q", q);
      if (filterDate) params.set("date", filterDate);
      if (cursor) params.set("cursor", cursor);
      const data = await apiGet<{ items: SaleRecord[]; nextCursor: string | null }>(
        `/api/v1/sales/history?${params}`,
      );
      setSales((prev) => (cursor ? [...prev, ...(data.items ?? [])] : data.items ?? []));
      setNextCursor(data.nextCursor ?? null);
    } catch {
      setError("Failed to load sales history.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filterStatus, filterReceipt, filterCustomer, filterDate]);

  useEffect(() => { void load(); }, [load]);

  function clearFilters() {
    setFilterDate("");
    setFilterCustomer("");
    setFilterReceipt("");
    setFilterStatus("all");
  }

  function fmt(ts: number) {
    return fmtDateTime(ts);
  }

  const voidSale = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await apiPost(`/api/v1/orders/${voidTarget.id}/void`, {});
      addToast({ title: "Sale voided", variant: "success" });
      setVoidTarget(null);
      setExpandedId(null);
      await load();
    } catch (err) {
      addToast({
        title: "Could not void sale",
        description: err instanceof ApiResponseError ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setVoiding(false);
    }
  };

  return (
    <EnterpriseShell active="sales" title="Sales History" subtitle="All register transactions">
      <div className="flex flex-col min-h-full">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-[#E8E8E8] px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[#111]">Sales history</h1>
        </div>

        {/* ── Filter bar (reference pattern) ───────────────────────────────── */}
        <div className="bg-white border-b border-[#E8E8E8] px-6 py-3">
          <div className="flex flex-wrap items-end gap-3">
            {/* Date */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#555]">Date</label>
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="h-8 rounded border border-[#D9D9D9] px-2 text-sm text-[#111] focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>

            {/* Customer */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#555]">Customer</label>
              <input
                type="text"
                placeholder="Search customer"
                value={filterCustomer}
                onChange={e => setFilterCustomer(e.target.value)}
                className="h-8 rounded border border-[#D9D9D9] px-2 text-sm text-[#111] focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 w-36"
              />
            </div>

            {/* Receipt or note */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#555]">Receipt #</label>
              <input
                type="text"
                placeholder="Receipt #…"
                value={filterReceipt}
                onChange={e => setFilterReceipt(e.target.value)}
                className="h-8 rounded border border-[#D9D9D9] px-2 text-sm text-[#111] focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 w-36"
              />
            </div>

            {/* More filters toggle */}
            {moreFilters && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#555]">Status</label>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="h-8 rounded border border-[#D9D9D9] px-2 text-sm text-[#111] focus:border-brand-600 focus:outline-none"
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
            </div>
          </div>

          {/* Results count */}
          {!loading && (
            <p className="mt-2 text-xs text-[#666]">
              Showing <strong>{sales.length}</strong> sale{sales.length !== 1 ? "" : ""}{nextCursor ? " (more available)" : ""}
            </p>
          )}
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-x-auto">
          {error && (
            <div role="alert" className="m-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0F0F0] bg-[#FAFAFA] text-left text-xs font-semibold text-[#888] uppercase tracking-wider">
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
                  <td colSpan={7} className="px-4 py-12 text-center text-[#888]">
                    <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                  </td>
                </tr>
              )}
              {!loading && sales.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#888]">No sales found for the selected filters.</td>
                </tr>
              )}
              {sales.map(sale => (
                <Fragment key={sale.id}>
                  <tr
                    className="border-b border-[#F5F5F5] hover:bg-[#FAFAFA] cursor-pointer"
                    onClick={() => setExpandedId(expandedId === sale.id ? null : sale.id)}
                  >
                    {/* Expand chevron */}
                    <td className="px-4 py-3">
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`text-[#999] transition-transform ${expandedId === sale.id ? "rotate-90" : ""}`}
                        aria-hidden="true"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>

                    {/* Receipt # + date */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-600">{sale.receipt_number}</p>
                      <p className="text-xs text-[#888]">{fmt(sale.created_at)}</p>
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3 text-[#555]">
                      {sale.customer_name ?? <span className="text-[#bbb]">—</span>}
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
                          <p className="text-xs font-medium text-[#111]">{sale.sold_by}</p>
                          <p className="text-[11px] text-[#888]">{sale.outlet}</p>
                        </div>
                      </div>
                    </td>

                    {/* Note */}
                    <td className="px-4 py-3 text-[#888] italic text-xs max-w-[160px] truncate">
                      {sale.note ?? "—"}
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#111]">
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
                        <SaleDetailPanel
                          sale={sale}
                          onReturnItems={() => router.push(`/returns?orderId=${sale.id}`)}
                          onVoid={() => setVoidTarget(sale)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>

          {!loading && nextCursor && (
            <div className="flex justify-center py-4">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load(nextCursor)}
                className="rounded border border-[#D9D9D9] bg-white px-4 py-1.5 text-sm text-[#555] hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!voidTarget}
        title="Void sale"
        message={`Void receipt "${voidTarget?.receipt_number}" for ${voidTarget ? formatMoney(voidTarget.total_cents) : ""}? This cannot be undone.`}
        confirmLabel={voiding ? "Voiding…" : "Void sale"}
        destructive
        onConfirm={voidSale}
        onCancel={() => setVoidTarget(null)}
      />
    </EnterpriseShell>
  );
}

// ── Sale detail panel (expanded inline row) ───────────────────────────────────

function SaleDetailPanel({
  sale,
  onReturnItems,
  onVoid,
}: {
  sale: SaleRecord;
  onReturnItems: () => void;
  onVoid: () => void;
}) {
  const subtotal = sale.lines.reduce((s, l) => s + l.total_cents - l.tax_cents, 0);
  const tax      = sale.lines.reduce((s, l) => s + l.tax_cents, 0);
  const canAct   = sale.status === "completed";

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
          {sale.lines.length === 0 ? (
            <p className="text-sm text-white/50">No line items recorded for this sale.</p>
          ) : (
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
                {sale.lines.map((l, i) => (
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
          )}

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
            {sale.payments.length === 0 ? (
              <p className="text-xs text-white/40">No payment records for this sale.</p>
            ) : (
              sale.payments.map((p, i) => (
                <div key={i} className="flex justify-between text-white/50 text-xs">
                  <span>{p.method} · {fmtDate(new Date(p.date).getTime())}</span>
                  <span>{formatMoney(p.amount_cents)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Actions — only real, wired capabilities. Removed: Edit, Gift receipt,
            Email receipt, Print receipt (no backend support for any of them). */}
        <div className="flex flex-col gap-2 min-w-[140px]">
          <ActionBtn primary disabled={!canAct} onClick={onReturnItems}>Return items</ActionBtn>
          <ActionBtn danger disabled={!canAct} onClick={onVoid}>Void</ActionBtn>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  children, primary, danger, disabled, onClick,
}: { children: React.ReactNode; primary?: boolean; danger?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "w-full rounded px-4 py-2 text-sm font-medium text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        primary ? "bg-brand-600 text-white hover:bg-[#4a4cc8]" :
        danger  ? "bg-transparent text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600" :
                  "bg-white/10 text-white hover:bg-white/20",
      ].join(" ")}
    >
      {children}
    </button>
  );
=======
export default function LegacySalesHistoryRedirect() {
  redirect("/orders");
>>>>>>> 1e2931b (fix(web): Ponytail Wave 0 — nav honesty, sales redirect, brand cleanup)
}
