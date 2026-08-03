
/**
 * BillsView — the enterprise Bill List (accounts payable). Presentational: bills +
 * suppliers + current filters come in as props, filter changes go out as
 * callbacks, so it renders identically under test and in the container.
 *
 * Bills are auto-drafted when a purchase order is received (billing listens to
 * the `purchase_order.received` event), so this list is the payables view of the
 * procurement pipeline — filterable by supplier and status.
 */

import { Card } from "@/components/Card";
import { Badge, type BadgeVariant } from "@/components/Badge";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import type { Bill, BillingStatus } from "@/api-client/types";

const STATUS_BADGE: Record<BillingStatus, BadgeVariant> = {
  open: "blue",
  partial: "yellow",
  paid: "green",
  void: "gray",
};

const STATUS_LABEL: Record<BillingStatus, string> = {
  open: "Open",
  partial: "Partial",
  paid: "Paid",
  void: "Void",
};

export interface BillsViewProps {
  bills: Bill[];
  suppliers: Array<{ id: string; name: string }>;
  supplierFilter: string;
  statusFilter: string;
  loading: boolean;
  error: string | null;
  onSupplierChange: (supplierId: string) => void;
  onStatusChange: (status: string) => void;
}

function balanceOf(b: Bill): number {
  return Math.max(b.total_cents - b.paid_cents, 0);
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border p-4 shadow-[var(--shadow-sm)]"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
      <p className="mt-1.5 text-[20px] font-bold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{value}</p>
    </div>
  );
}

export function BillsView({
  bills,
  suppliers,
  supplierFilter,
  statusFilter,
  loading,
  error,
  onSupplierChange,
  onStatusChange,
}: BillsViewProps) {
  const outstanding = bills
    .filter((b) => b.status === "open" || b.status === "partial")
    .reduce((sum, b) => sum + balanceOf(b), 0);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryTile label="Bills" value={String(bills.length)} />
        <SummaryTile label="Outstanding" value={formatMoney(outstanding)} />
        <SummaryTile label="Suppliers" value={String(new Set(bills.map((b) => b.supplier_id)).size)} />
      </div>

      {/* Filters */}
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="bill-supplier" className="text-[11px] font-semibold uppercase tracking-[0.04em]"
              style={{ color: "var(--color-text-secondary)" }}>Supplier</label>
            <select
              id="bill-supplier" value={supplierFilter} onChange={(e) => onSupplierChange(e.target.value)}
              className="h-8 min-w-[200px] rounded-lg border px-3 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="bill-status" className="text-[11px] font-semibold uppercase tracking-[0.04em]"
              style={{ color: "var(--color-text-secondary)" }}>Status</label>
            <select
              id="bill-status" value={statusFilter} onChange={(e) => onStatusChange(e.target.value)}
              className="h-8 rounded-lg border px-3 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="void">Void</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border px-4 py-3 text-[13px]"
          style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        {loading ? (
          <div role="status" aria-label="Loading bills" className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-skeleton rounded" />)}
          </div>
        ) : bills.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            No bills match these filters. Bills are created automatically when a purchase order is received.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Bill #", "Supplier", "PO", "Status", "Amount", "Balance", "Due"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${i >= 4 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id} className="border-b last:border-0 transition-colors duration-75"
                    style={{ borderColor: "var(--color-table-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>{b.bill_number}</td>
                    <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{b.supplier_name ?? b.supplier_id}</td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>{b.po_id ? "Linked" : "—"}</td>
                    <td className="px-4 py-3"><Badge variant={STATUS_BADGE[b.status]}>{STATUS_LABEL[b.status]}</Badge></td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: "var(--color-text-primary)" }}>{formatMoney(b.total_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(balanceOf(b))}</td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(b.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
