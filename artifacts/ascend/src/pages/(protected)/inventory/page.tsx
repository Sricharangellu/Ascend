
/**
 * /inventory — Stock movement management.
 *
 * Tabs: Orders | Transfers | Returns
 * Filter: Show dropdown | Search | Outlet | More filters
 * Summary: "Displaying X total qty and $Y total cost"
 * Table: Order # + due date | From | To | Status | Created (sortable) | Total qty | Total cost
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "@/lib/router";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Button } from "@/components/Button";
import { apiGet, apiPost } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate, fmtDateShort } from "@/lib/date";
import { useToast } from "@/components/Toast";

// ── Types ──────────────────────────────────────────────────────────────────────

type TabKey = "orders" | "transfers" | "returns";

const TAB_KEYS: TabKey[] = ["orders", "transfers", "returns"];
function isTabKey(v: string | null): v is TabKey {
  return v !== null && (TAB_KEYS as string[]).includes(v);
}

interface StockMovement {
  id: string;
  number: string;
  due_date?: number | null;
  from_location: string;
  to_location: string;
  status: string;
  created_at: number;
  total_qty: number;
  total_cost_cents: number;
  note?: string | null;
}

interface RawOrder {
  id: string; po_number: number; supplier_id: string; status: string;
  total_cost_cents: number; created_at: number; received_at: number | null;
}
interface RawTransfer {
  id: string; transfer_number: string; from_location: string; to_location: string;
  status: string; qty: number; created_at: number; due_date: number | null; note?: string | null;
}
interface RawReturn {
  id: string; number: string; from_location: string; to_location: string;
  status: string; total_qty: number; total_cost_cents: number; created_at: number;
  due_date?: number | null; note?: string | null;
}

// ── Status badges ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = {
    pending:    "bg-warning-50 text-warning-700 border-warning-200",
    ordered:    "bg-info-50 text-info-700 border-info-200",
    in_transit: "bg-info-50 text-info-700 border-info-200",
    received:   "bg-success-50 text-success-700 border-success-200",
    completed:  "bg-success-50 text-success-700 border-success-200",
    credited:   "bg-success-50 text-success-700 border-success-200",
    partial:    "bg-[var(--color-primary-subtle)] text-brand-700 border-[var(--color-primary-border)]",
    sent:       "bg-info-50 text-info-700 border-info-200",
    draft:      "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] border-[var(--color-border)]",
    cancelled:  "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border-[var(--color-border)]",
  };
  const base = cls[status] ?? "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] border-[var(--color-border)]";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold capitalize leading-none ${base}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const SUPPLIER_NAME: Record<string, string> = {
  "sup_acme": "Acme Coffee Co",
  "sup_tea":  "Tea Traders",
};

// ── Normalise ─────────────────────────────────────────────────────────────────

function normOrders(items: RawOrder[]): StockMovement[] {
  return items.map(o => ({
    id: o.id, number: `PO-${o.po_number}`, due_date: o.received_at,
    from_location: SUPPLIER_NAME[o.supplier_id] ?? o.supplier_id,
    to_location: "Main Store", status: o.status,
    created_at: o.created_at, total_qty: 0, total_cost_cents: o.total_cost_cents,
  }));
}
function normTransfers(items: RawTransfer[]): StockMovement[] {
  return items.map(t => ({
    id: t.id, number: t.transfer_number, due_date: t.due_date,
    from_location: t.from_location, to_location: t.to_location, status: t.status,
    created_at: t.created_at, total_qty: t.qty, total_cost_cents: 0, note: t.note,
  }));
}
function normReturns(items: RawReturn[]): StockMovement[] {
  return items.map(r => ({
    id: r.id, number: r.number, due_date: r.due_date ?? null,
    from_location: r.from_location, to_location: r.to_location, status: r.status,
    created_at: r.created_at, total_qty: r.total_qty, total_cost_cents: r.total_cost_cents, note: r.note,
  }));
}

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: "orders",    label: "Orders"    },
  { key: "transfers", label: "Transfers" },
  { key: "returns",   label: "Returns"   },
];

const TAB_ENDPOINT: Record<TabKey, string> = {
  orders:    "/api/v1/purchasing/orders",
  transfers: "/api/v1/inventory/transfers",
  returns:   "/api/v1/inventory/returns",
};

const TAB_PREFIX: Record<TabKey, string> = {
  orders:    "PO",
  transfers: "TRF",
  returns:   "RET",
};

// ── New movement modal ─────────────────────────────────────────────────────────

function NewMovementModal({ tab, onClose, onCreated }: { tab: TabKey; onClose: () => void; onCreated: () => void }) {
  const { addToast } = useToast();
  const [from, setFrom]   = useState("");
  const [to, setTo]       = useState("");
  const [qty, setQty]     = useState("1");
  const [cost, setCost]   = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const cfg = {
    orders:    { title: "New purchase order",  fromLabel: "Supplier",    toLabel: "Outlet"    },
    transfers: { title: "New transfer",        fromLabel: "From outlet", toLabel: "To outlet" },
    returns:   { title: "New return",          fromLabel: "From outlet", toLabel: "Supplier"  },
  }[tab];

  const inputCls = "w-full h-8 rounded-lg border px-3 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";

  const handleSubmit = async () => {
    if (!from.trim() || !to.trim()) { addToast({ title: "Fill in all required fields", variant: "error" }); return; }
    setSubmitting(true);
    try {
      await apiPost(TAB_ENDPOINT[tab], {
        from_location: from.trim(), to_location: to.trim(),
        total_qty: Math.max(1, parseInt(qty, 10) || 1),
        total_cost_cents: Math.round(parseFloat(cost.replace(/,/g, "")) * 100 || 0),
        notes: notes.trim() || undefined,
      });
      addToast({ title: "Created successfully", variant: "success" });
      onCreated(); onClose();
    } catch (e) {
      addToast({ title: "Failed to create", description: e instanceof Error ? e.message : undefined, variant: "error" });
    } finally { setSubmitting(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-[var(--shadow-xl)]"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{cfg.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 transition-colors hover:bg-[var(--color-surface-subtle)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>
                {cfg.fromLabel}
              </label>
              <input
                type="text" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Name…"
                className={inputCls}
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>
                {cfg.toLabel}
              </label>
              <input
                type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Name…"
                className={inputCls}
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>
                Total qty
              </label>
              <input
                type="number" value={qty} min="1" onChange={(e) => setQty(e.target.value)}
                className={inputCls}
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>
                Total cost ($)
              </label>
              <input
                type="number" value={cost} min="0" step="0.01" onChange={(e) => setCost(e.target.value)}
                className={inputCls}
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>
              Notes
            </label>
            <input
              type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional…"
              className={inputCls}
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={submitting} onClick={() => void handleSubmit()}>
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Select/input shared style ──────────────────────────────────────────────────

const ctrlCls = [
  "h-8 rounded-lg border px-3 text-[13px] outline-none transition-all",
  "focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500",
].join(" ");
const ctrlStyle = {
  borderColor: "var(--color-border)",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-text-primary)",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const searchParams = useSearchParams();
  const initialTab   = searchParams.get("tab");
  const [activeTab, setActiveTab]   = useState<TabKey>(isTabKey(initialTab) ? initialTab : "orders");
  const [data, setData]             = useState<StockMovement[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor]   = useState<string | null>(null);
  const [showModal, setShowModal]   = useState(false);
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("desc");

  const [filterShow,   setFilterShow]   = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterOutlet, setFilterOutlet] = useState("all");
  const [moreFilters,  setMoreFilters]  = useState(false);

  function clearFilters() { setFilterShow("all"); setFilterSearch(""); setFilterOutlet("all"); }

  function normalize(raw: unknown[]): StockMovement[] {
    if (activeTab === "orders")    return normOrders(raw as RawOrder[]);
    if (activeTab === "transfers") return normTransfers(raw as RawTransfer[]);
    return normReturns(raw as RawReturn[]);
  }

  const load = useCallback(() => {
    setLoading(true);
    const ep = TAB_ENDPOINT[activeTab];
    apiGet<{ items: unknown[]; nextCursor: string | null }>(ep).then((r) => {
      setData(normalize(r.items ?? []));
      setNextCursor(r.nextCursor ?? null);
    }).catch(() => { setData([]); setNextCursor(null); }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => { load(); }, [load]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const ep = `${TAB_ENDPOINT[activeTab]}?cursor=${encodeURIComponent(nextCursor)}`;
    apiGet<{ items: unknown[]; nextCursor: string | null }>(ep).then((r) => {
      setData((prev) => [...prev, ...normalize(r.items ?? [])]);
      setNextCursor(r.nextCursor ?? null);
    }).finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, nextCursor, loadingMore]);

  const visible = useMemo(() => {
    let rows = data;
    if (filterShow !== "all")    rows = rows.filter((r) => r.status === filterShow);
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      rows = rows.filter((r) =>
        r.number.toLowerCase().includes(q) ||
        r.from_location.toLowerCase().includes(q) ||
        r.to_location.toLowerCase().includes(q)
      );
    }
    if (filterOutlet !== "all") {
      rows = rows.filter((r) =>
        r.to_location.toLowerCase().includes(filterOutlet.toLowerCase()) ||
        r.from_location.toLowerCase().includes(filterOutlet.toLowerCase())
      );
    }
    return [...rows].sort((a, b) =>
      sortDir === "desc" ? b.created_at - a.created_at : a.created_at - b.created_at
    );
  }, [data, filterShow, filterSearch, filterOutlet, sortDir]);

  const totalQty  = visible.reduce((s, r) => s + r.total_qty, 0);
  const totalCost = visible.reduce((s, r) => s + r.total_cost_cents, 0);
  const tabLabel  = activeTab === "orders" ? "orders" : activeTab === "transfers" ? "transfers" : "returns";

  return (
    <EnterpriseShell active="inventory" title="Inventory" subtitle="Stock movements — orders, transfers, and returns">

      {/* ── Tab bar + action button ───────────────────────────────────────── */}
      <div
        className="flex items-end justify-between border-b px-6"
        style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="flex" role="tablist" aria-label="Inventory sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => { setActiveTab(t.key); clearFilters(); }}
              className={[
                "relative px-5 py-3.5 text-[13px] font-medium transition-colors duration-150",
                "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-t-full after:transition-all",
                activeTab === t.key
                  ? "text-brand-600 after:bg-brand-600"
                  : "after:bg-transparent",
              ].join(" ")}
              style={{ color: activeTab === t.key ? undefined : "var(--color-text-secondary)" }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mb-2.5">
          <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
            + New {tabLabel.slice(0, -1)}
          </Button>
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div
        className="border-b px-6 py-3"
        style={{ backgroundColor: "var(--color-surface-subtle)", borderColor: "var(--color-border)" }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>Show</label>
            <select value={filterShow} onChange={(e) => setFilterShow(e.target.value)} className={ctrlCls} style={ctrlStyle}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              {activeTab === "orders"    && <option value="ordered">Ordered</option>}
              {activeTab === "orders"    && <option value="received">Received</option>}
              {activeTab === "orders"    && <option value="draft">Draft</option>}
              {activeTab === "transfers" && <option value="in_transit">In transit</option>}
              {activeTab === "transfers" && <option value="completed">Completed</option>}
              {activeTab === "returns"   && <option value="sent">Sent</option>}
              {activeTab === "returns"   && <option value="credited">Credited</option>}
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>Search</label>
            <input
              type="text" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)}
              placeholder={`${TAB_PREFIX[activeTab]}-00001 or location…`}
              className={`${ctrlCls} w-48`} style={ctrlStyle}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>Outlet</label>
            <select value={filterOutlet} onChange={(e) => setFilterOutlet(e.target.value)} className={ctrlCls} style={ctrlStyle}>
              <option value="all">All outlets</option>
              <option value="Main Store">Main Store</option>
              <option value="Warehouse">Warehouse</option>
              <option value="Downtown">Downtown</option>
            </select>
          </div>

          {moreFilters && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>From date</label>
              <input type="date" className={ctrlCls} style={ctrlStyle} />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={clearFilters} className="text-[13px] font-medium text-brand-600 hover:underline">Clear</button>
            <button type="button" onClick={() => setMoreFilters((m) => !m)} className="text-[13px] font-medium text-brand-600 hover:underline">
              {moreFilters ? "Fewer" : "More"} filters
            </button>
            <Button variant="primary" size="sm" onClick={load}>Search</Button>
          </div>
        </div>

        {!loading && (
          <p className="mt-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            Displaying <strong style={{ color: "var(--color-text-secondary)" }}>{visible.length}</strong> {tabLabel} —
            {" "}total qty <strong style={{ color: "var(--color-text-secondary)" }}>{totalQty.toLocaleString()}</strong>,
            {" "}total cost <strong style={{ color: "var(--color-text-secondary)" }}>{formatMoney(totalCost)}</strong>
          </p>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
            <tr>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-text-secondary)" }}>
                {TAB_PREFIX[activeTab]} # / Due date
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-text-secondary)" }}>From</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-text-secondary)" }}>To</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-text-secondary)" }}>Status</th>
              <th
                className="cursor-pointer select-none px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] transition-colors hover:text-brand-600"
                style={{ color: "var(--color-text-secondary)" }}
                onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
              >
                Created {sortDir === "desc" ? "↓" : "↑"}
              </th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-text-secondary)" }}>Total qty</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-text-secondary)" }}>Total cost</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                </td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                  No {tabLabel} found.
                  {(filterShow !== "all" || filterSearch || filterOutlet !== "all") && (
                    <button type="button" onClick={clearFilters} className="ml-2 text-brand-600 hover:underline">Clear filters</button>
                  )}
                </td>
              </tr>
            )}
            {visible.map((row) => (
              <tr
                key={row.id}
                className="border-b last:border-0 transition-colors duration-75"
                style={{ borderColor: "var(--color-table-border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
              >
                <td className="px-4 py-3">
                  <p className="font-mono text-[12px] font-bold text-brand-600">{row.number}</p>
                  {row.due_date
                    ? <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Due {fmtDateShort(row.due_date)}</p>
                    : <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>No due date</p>}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>{row.from_location}</td>
                <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>{row.to_location}</td>
                <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                <td className="px-4 py-3 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(row.created_at)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                  {row.total_qty > 0 ? row.total_qty.toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                  {row.total_cost_cents > 0 ? formatMoney(row.total_cost_cents) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && !loading && (
        <div className="flex justify-center border-t py-3" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

      {showModal && <NewMovementModal tab={activeTab} onClose={() => setShowModal(false)} onCreated={load} />}
    </EnterpriseShell>
  );
}
