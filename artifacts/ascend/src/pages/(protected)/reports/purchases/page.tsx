
import { useState } from "react";
import { useQuery } from "@/lib/useQuery";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { ReportsSubNav } from "@/components/reports/ReportsSubNav";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";

interface PurchaseRow {
  po_id: string; po_number: number | null; status: string; vendor_name: string;
  qty_ordered: number; qty_received: number; cost_cents: number;
  total_cost_cents: number; due_cents: number; created_at: number;
}

const STATUS_BADGE: Record<string, "blue" | "green" | "orange" | "gray"> = {
  ordered: "blue", partially_received: "orange", received: "green", cancelled: "gray",
};

export default function PurchasesPage() {
  const [vendorId, setVendorId] = useState("");
  const [range, setRange] = useState("30d");

  const since = range === "7d" ? Date.now() - 7 * 86_400_000
    : range === "90d" ? Date.now() - 90 * 86_400_000
    : Date.now() - 30 * 86_400_000;

  const params = new URLSearchParams({ from: String(since), limit: "200" });
  if (vendorId) params.set("vendorId", vendorId);

  const { data, loading } = useQuery(
    `purchases:${vendorId}:${range}`,
    () => apiGet<{ items: PurchaseRow[] }>(`/api/v1/reports/purchases?${params}`),
    { staleMs: 60_000 },
  );

  const rows = data?.items ?? [];
  const totalCost = rows.reduce((s, r) => s + Number(r.total_cost_cents), 0);
  const totalDue = rows.reduce((s, r) => s + Number(r.due_cents), 0);

  return (
    <EnterpriseShell active="reports" title="Purchase Report" subtitle="Vendor × product AP summary">
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6">
        <ReportsSubNav />

        <div className="flex flex-wrap items-center gap-3">
          <input type="text" placeholder="Filter by vendor ID (optional)" value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="h-8 w-56 rounded-lg border px-3 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} />
          <select value={range} onChange={(e) => setRange(e.target.value)}
            className="h-8 rounded-lg border px-3 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <div className="ml-auto flex gap-6 text-[13px]">
            <div><span style={{ color: "var(--color-text-secondary)" }}>Total cost: </span>
              <strong style={{ color: "var(--color-text-primary)" }}>{formatMoney(totalCost)}</strong></div>
            <div><span style={{ color: "var(--color-text-secondary)" }}>Outstanding: </span>
              <strong className="text-[var(--color-danger-text)]">{formatMoney(totalDue)}</strong></div>
          </div>
        </div>

        <Card>
          {loading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => (
              <div key={i} className="h-10 animate-skeleton rounded" />
            ))}</div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-[13px]" style={{ color: "var(--color-text-secondary)" }}>No purchase orders found.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-[0.07em]"
                  style={{ borderBottom: "1px solid var(--color-table-border)", color: "var(--color-text-secondary)" }}>
                  <th className="pb-2 text-left">PO #</th>
                  <th className="pb-2 text-left">Vendor</th>
                  <th className="pb-2 text-left">Status</th>
                  <th className="pb-2 text-right">Ordered</th>
                  <th className="pb-2 text-right">Received</th>
                  <th className="pb-2 text-right">Cost</th>
                  <th className="pb-2 text-right">Due</th>
                  <th className="pb-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-table-border)]">
                {rows.map((r) => (
                  <tr key={r.po_id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                    <td className="py-2 font-mono text-[11px]" style={{ color: "var(--color-text-primary)" }}>
                      {r.po_number ?? r.po_id.slice(-6)}
                    </td>
                    <td className="py-2 font-medium" style={{ color: "var(--color-text-primary)" }}>{r.vendor_name}</td>
                    <td className="py-2">
                      <Badge variant={STATUS_BADGE[r.status] ?? "gray"} size="sm">
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{r.qty_ordered}</td>
                    <td className="py-2 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{r.qty_received}</td>
                    <td className="py-2 text-right tabular-nums font-medium" style={{ color: "var(--color-text-primary)" }}>{formatMoney(r.total_cost_cents)}</td>
                    <td className={`py-2 text-right tabular-nums font-medium ${Number(r.due_cents) > 0 ? "text-[var(--color-danger-text)]" : ""}`}
                      style={Number(r.due_cents) <= 0 ? { color: "var(--color-text-secondary)" } : {}}>
                      {formatMoney(r.due_cents)}
                    </td>
                    <td className="py-2 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                      {fmtDate(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </EnterpriseShell>
  );
}
