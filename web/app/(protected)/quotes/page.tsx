"use client";

/**
 * /quotes — Quotations management.
 *
 * Spec:
 *   Filter: Status dropdown | Customer | Quote # | More filters | Search
 *   Table: Quote #/date | Customer (avatar) | Served by (avatar+outlet) | Note | Total | Status | → send icon
 *   Expand: dark panel pattern + "Convert to sale" primary CTA
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Button } from "@/components/Button";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { useToast } from "@/components/Toast";
import { getUser } from "@/lib/auth";

// ── Types ──────────────────────────────────────────────────────────────────────

type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

interface Quote {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  customer_id: string | null;
  customer_name?: string | null;
  sales_rep_id?: string | null;
  sales_rep_name?: string | null;
  note?: string | null;
  total_cents: number;
  currency: string;
  valid_until: number;
  created_at: number;
}

interface QuoteLine {
  id: string;
  name: string;
  quantity: number;
  unit_cents: number;
  sku?: string;
}

interface QuoteDetail extends Quote {
  lines: QuoteLine[];
  subtotal_cents?: number;
  discount_cents?: number;
}

// ── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#F97316", "#EAB308", "#8B5CF6", "#10B981", "#EC4899", "#3B82F6", "#EF4444", "#14B8A6"];
function avatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!;
}
function initials(name: string) { return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase(); }

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft:    "bg-gray-100 text-gray-600",
  sent:     "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  expired:  "bg-amber-50 text-amber-700",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCents(v: string) { const n = parseFloat(v.replace(/,/g, "")); return isNaN(n) ? 0 : Math.round(n * 100); }

// ── New Quote Modal ───────────────────────────────────────────────────────────

interface NewLine { name: string; qty: string; unitPrice: string; }
const EMPTY_LINE: NewLine = { name: "", qty: "1", unitPrice: "" };

function NewQuoteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { addToast } = useToast();
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [lines, setLines] = useState<NewLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSubmitting] = useState(false);

  const updateLine = (i: number, f: keyof NewLine, v: string) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [f]: v } : l));

  const handleSubmit = async () => {
    if (!lines.some(l => l.name.trim())) {
      addToast({ title: "Add at least one line item", variant: "error" }); return;
    }
    setSubmitting(true);
    try {
      await apiPost("/api/v1/quotes", {
        customerId: customerName.trim() || undefined,
        notes: notes.trim() || undefined,
        validUntil: validUntil ? new Date(validUntil).getTime() : undefined,
        lines: lines.filter(l => l.name.trim()).map(l => ({
          name: l.name.trim(),
          quantity: Math.max(1, parseInt(l.qty, 10) || 1),
          unitCents: parseCents(l.unitPrice),
        })),
      });
      addToast({ title: "Quote created", variant: "success" });
      onCreated(); onClose();
    } catch (e) {
      addToast({ title: "Failed to create quote", description: e instanceof Error ? e.message : undefined, variant: "error" });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="relative w-full max-w-xl rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#F0F0F0] px-5 py-4">
          <h2 className="text-base font-semibold text-[#111]">New quotation</h2>
          <button type="button" onClick={onClose} className="text-[#888] hover:text-[#555]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#555] mb-1">Customer</label>
              <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name"
                className="w-full h-8 rounded border border-[#D9D9D9] px-2 text-sm focus:border-[#5D5FEF] focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#555] mb-1">Valid until</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
                className="w-full h-8 rounded border border-[#D9D9D9] px-2 text-sm focus:border-[#5D5FEF] focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[#555] mb-1">Note</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional note"
                className="w-full h-8 rounded border border-[#D9D9D9] px-2 text-sm focus:border-[#5D5FEF] focus:outline-none" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#888]">Line items</p>
              <button type="button" onClick={() => setLines(p => [...p, { ...EMPTY_LINE }])}
                className="text-xs text-[#5D5FEF] hover:underline">+ Add line</button>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <input type="text" value={line.name} onChange={e => updateLine(i, "name", e.target.value)} placeholder="Product name"
                  className="flex-1 h-8 rounded border border-[#D9D9D9] px-2 text-sm focus:border-[#5D5FEF] focus:outline-none" />
                <input type="number" value={line.qty} min="1" onChange={e => updateLine(i, "qty", e.target.value)} placeholder="Qty"
                  className="w-14 h-8 rounded border border-[#D9D9D9] px-2 text-sm text-center focus:border-[#5D5FEF] focus:outline-none" />
                <input type="number" value={line.unitPrice} min="0" step="0.01" onChange={e => updateLine(i, "unitPrice", e.target.value)} placeholder="$"
                  className="w-20 h-8 rounded border border-[#D9D9D9] px-2 text-sm text-right focus:border-[#5D5FEF] focus:outline-none" />
                <button type="button" onClick={() => setLines(p => p.filter((_, j) => j !== i))} disabled={lines.length === 1}
                  className="text-[#ccc] hover:text-red-500 disabled:opacity-30">✕</button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#F0F0F0] px-5 py-4">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={submitting} onClick={() => void handleSubmit()}>Create quote</Button>
        </div>
      </div>
    </div>
  );
}

// ── Dark expand panel (spec pattern) ─────────────────────────────────────────

function QuoteDarkPanel({
  quoteId,
  quoteNumber,
  status,
  onConvert,
  onSend,
  onClose,
  converting,
}: {
  quoteId: string;
  quoteNumber: string;
  status: QuoteStatus;
  onConvert: () => void;
  onSend: () => void;
  onClose: () => void;
  converting: boolean;
}) {
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<QuoteDetail>(`/api/v1/quotes/${quoteId}`)
      .then(setDetail).catch(() => {}).finally(() => setLoading(false));
  }, [quoteId]);

  const lines = detail?.lines ?? [];
  const subtotal = lines.reduce((s, l) => s + l.unit_cents * l.quantity, 0);
  const discount = detail?.discount_cents ?? 0;
  const total    = detail?.total_cents ?? 0;

  return (
    <div className="bg-[#2a2a2a] text-white px-6 py-5">
      {/* Tab bar */}
      <div className="mb-4 border-b border-white/10">
        <button type="button" className="pb-2 text-sm font-medium text-white border-b-2 border-[#5D5FEF]">
          Quote details
        </button>
        <button type="button" onClick={onClose}
          className="ml-auto float-right text-white/40 hover:text-white/70 text-sm pb-2">✕ Close</button>
      </div>

      <div className="flex gap-8">
        {/* Line items */}
        <div className="flex-1">
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-5 rounded bg-white/10 animate-pulse" />)}</div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-white/40 uppercase">
                    <th className="pb-2">Qty</th>
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Unit price</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {lines.map(l => (
                    <tr key={l.id}>
                      <td className="py-2 text-white/60">{l.quantity}</td>
                      <td className="py-2 font-medium text-white">
                        {l.name}{l.sku && <span className="ml-1.5 text-white/40 text-xs">[{l.sku}]</span>}
                      </td>
                      <td className="py-2 text-right text-white/70">{formatMoney(l.unit_cents)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{formatMoney(l.unit_cents * l.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Summary */}
              <div className="mt-3 border-t border-white/10 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-white/60">
                  <span>Subtotal</span><span>{formatMoney(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-400 text-sm">
                    <span>Discount</span><span>−{formatMoney(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-white text-base uppercase">
                  <span>Quote total</span><span>{formatMoney(total)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 min-w-[160px]">
          {/* Convert to sale — primary CTA per spec */}
          {(status === "draft" || status === "sent" || status === "accepted") && (
            <button type="button" onClick={onConvert} disabled={converting}
              className="w-full rounded bg-[#5D5FEF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4849d0] disabled:opacity-50 transition-colors">
              {converting ? "Converting…" : "Convert to sale"}
            </button>
          )}
          {status === "draft" && (
            <button type="button" onClick={onSend}
              className="w-full rounded bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors">
              Send to customer
            </button>
          )}
          <button type="button"
            className="w-full rounded bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors">
            Download PDF
          </button>
          <button type="button"
            className="w-full rounded bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors">
            Email quote
          </button>
          <button type="button"
            className="w-full rounded bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors">
            Duplicate
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const user = getUser();
  const canManage = user?.role === "owner" || user?.role === "manager";
  const { addToast } = useToast();

  const [quotes, setQuotes]   = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actioning, setActioning]   = useState<string | null>(null);
  const [showModal, setShowModal]   = useState(false);

  // Filter state
  const [filterStatus, setFilterStatus]     = useState<string>("all");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterQuoteNo, setFilterQuoteNo]   = useState("");
  const [moreFilters, setMoreFilters]       = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: Quote[] }>("/api/v1/quotes")
      .then(r => setQuotes(r.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function clearFilters() { setFilterStatus("all"); setFilterCustomer(""); setFilterQuoteNo(""); }

  const visible = quotes.filter(q => {
    if (filterStatus !== "all" && q.status !== filterStatus) return false;
    if (filterCustomer && !(q.customer_id ?? q.customer_name ?? "").toLowerCase().includes(filterCustomer.toLowerCase())) return false;
    if (filterQuoteNo && !q.quote_number.toLowerCase().includes(filterQuoteNo.toLowerCase())) return false;
    return true;
  });

  async function handleSend(id: string) {
    setActioning(id);
    try {
      await apiPatch(`/api/v1/quotes/${id}/status`, { status: "sent" });
      setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: "sent" as QuoteStatus } : q));
      addToast({ title: "Quote sent", variant: "success" });
    } catch { addToast({ title: "Failed to send", variant: "error" }); }
    finally { setActioning(null); }
  }

  async function handleConvert(id: string, quoteNumber: string) {
    setActioning(id);
    try {
      await apiPost(`/api/v1/quotes/${id}/convert`, {});
      addToast({ title: `${quoteNumber} converted to sale`, variant: "success" });
      load();
    } catch { addToast({ title: "Failed to convert", variant: "error" }); }
    finally { setActioning(null); }
  }

  async function handleDelete(id: string, quoteNumber: string) {
    if (!confirm(`Delete ${quoteNumber}? This cannot be undone.`)) return;
    setActioning(id);
    try {
      await apiDelete(`/api/v1/quotes/${id}`);
      setQuotes(prev => prev.filter(q => q.id !== id));
      addToast({ title: `${quoteNumber} deleted`, variant: "success" });
    } catch { addToast({ title: "Failed to delete", variant: "error" }); }
    finally { setActioning(null); }
  }

  return (
    <EnterpriseShell active="quotes" title="Quotes" subtitle="Create and manage sales quotations">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#E8E8E8] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#111]">Quotes</h1>
        {canManage && (
          <button type="button" onClick={() => setShowModal(true)}
            className="rounded bg-[#5D5FEF] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4849d0] transition-colors">
            + New quote
          </button>
        )}
      </div>

      {/* ── Spec filter bar ───────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#E8E8E8] px-6 py-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Status dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#555]">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="h-8 rounded border border-[#D9D9D9] px-2 text-sm text-[#111] focus:border-[#5D5FEF] focus:outline-none">
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          {/* Customer */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#555]">Customer</label>
            <input type="text" value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} placeholder="Customer…"
              className="h-8 w-36 rounded border border-[#D9D9D9] px-2 text-sm text-[#111] focus:border-[#5D5FEF] focus:outline-none" />
          </div>
          {/* Quote # */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#555]">Quote #</label>
            <input type="text" value={filterQuoteNo} onChange={e => setFilterQuoteNo(e.target.value)} placeholder="QT-00001"
              className="h-8 w-28 rounded border border-[#D9D9D9] px-2 text-sm text-[#111] focus:border-[#5D5FEF] focus:outline-none" />
          </div>
          {/* More filters */}
          {moreFilters && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#555]">Valid after</label>
              <input type="date"
                className="h-8 rounded border border-[#D9D9D9] px-2 text-sm text-[#111] focus:border-[#5D5FEF] focus:outline-none" />
            </div>
          )}
          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={clearFilters} className="text-sm text-[#5D5FEF] hover:underline">Clear filters</button>
            <button type="button" onClick={() => setMoreFilters(m => !m)} className="text-sm text-[#5D5FEF] hover:underline">
              {moreFilters ? "Fewer filters" : "More filters"}
            </button>
            <button type="button" onClick={load}
              className="h-8 rounded bg-[#5D5FEF] px-4 text-sm font-medium text-white hover:bg-[#4849d0] transition-colors">
              Search
            </button>
          </div>
        </div>
        {!loading && (
          <p className="mt-2 text-xs text-[#666]">
            Showing <strong>{visible.length}</strong> quote{visible.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {/* Spec cols: Quote #/date | Customer (avatar) | Served by (avatar+outlet) | Note | Total | Status | → send */}
            <tr className="border-b border-[#F0F0F0] bg-[#FAFAFA] text-left text-xs font-semibold text-[#888] uppercase tracking-wider">
              <th className="w-6 px-4 py-3" />
              <th className="px-4 py-3">Quote # / Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Served by</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-[#888]">
                <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#5D5FEF] border-t-transparent" />
              </td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-[#888]">
                No quotes found.
                {(filterStatus !== "all" || filterCustomer || filterQuoteNo) && (
                  <button type="button" onClick={clearFilters} className="ml-2 text-[#5D5FEF] hover:underline">Clear filters</button>
                )}
              </td></tr>
            )}
            {visible.map(quote => {
              const custName = quote.customer_name ?? quote.customer_id ?? "Walk-in";
              const repName  = quote.sales_rep_name ?? "Sales Team";
              return (
                <Fragment key={quote.id}>
                  <tr
                    className="border-b border-[#F5F5F5] hover:bg-[#FAFAFA] cursor-pointer"
                    onClick={() => setExpandedId(expandedId === quote.id ? null : quote.id)}
                  >
                    {/* Chevron */}
                    <td className="px-4 py-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round"
                        className={`text-[#999] transition-transform ${expandedId === quote.id ? "rotate-90" : ""}`} aria-hidden="true">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>

                    {/* Quote # / date */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#5D5FEF] font-mono text-xs">{quote.quote_number}</p>
                      <p className="text-xs text-[#888]">{fmtDateTime(quote.created_at)}</p>
                    </td>

                    {/* Customer — avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                          style={{ backgroundColor: avatarColor(custName) }} aria-hidden="true">
                          {initials(custName)}
                        </div>
                        <span className="text-sm text-[#111]">{custName}</span>
                      </div>
                    </td>

                    {/* Served by — avatar + outlet */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                          style={{ backgroundColor: avatarColor(repName) }} aria-hidden="true">
                          {initials(repName)}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-[#111]">{repName}</p>
                          <p className="text-[11px] text-[#888]">Main Outlet</p>
                        </div>
                      </div>
                    </td>

                    {/* Note */}
                    <td className="px-4 py-3 text-xs text-[#888] italic max-w-[140px] truncate">
                      {quote.note ?? "—"}
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#111]">
                      {formatMoney(quote.total_cents)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[quote.status]}`}>
                        {quote.status}
                      </span>
                    </td>

                    {/* Send icon — rightmost per spec */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {canManage && quote.status === "draft" && (
                        <button type="button" onClick={() => void handleSend(quote.id)} disabled={actioning === quote.id}
                          aria-label="Send quote" className="text-[#aaa] hover:text-[#5D5FEF] transition-colors disabled:opacity-40">
                          <SendIcon />
                        </button>
                      )}
                      {canManage && quote.status !== "draft" && (
                        <button type="button" onClick={() => void handleDelete(quote.id, quote.quote_number)}
                          disabled={actioning === quote.id}
                          aria-label="Delete quote" className="text-[#aaa] hover:text-red-500 transition-colors disabled:opacity-40">
                          <TrashIcon />
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Dark expand panel */}
                  {expandedId === quote.id && (
                    <tr key={`${quote.id}-panel`}>
                      <td colSpan={8} className="p-0">
                        <QuoteDarkPanel
                          quoteId={quote.id}
                          quoteNumber={quote.quote_number}
                          status={quote.status}
                          onConvert={() => void handleConvert(quote.id, quote.quote_number)}
                          onSend={() => void handleSend(quote.id)}
                          onClose={() => setExpandedId(null)}
                          converting={actioning === quote.id}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && <NewQuoteModal onClose={() => setShowModal(false)} onCreated={load} />}
    </EnterpriseShell>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}
