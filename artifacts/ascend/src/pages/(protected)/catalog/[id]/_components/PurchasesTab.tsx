
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/lib/router";
import { Badge } from "@/components/Badge";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PurchaseLine {
  id: string;
  product_id: string;
  po_id: string;
  po_number: string;
  vendor_name: string;
  ordered_at: number;
  received_at: number | null;
  qty_ordered: number;
  qty_received: number;
  unit_cost_cents: number;
  total_cost_cents: number;
  status: "ordered" | "partial" | "received" | "cancelled";
}

interface PurchasesResponse {
  items: PurchaseLine[];
  total: number;
  total_qty_received: number;
  total_cost_cents: number;
}

const STATUS_BADGE: Record<PurchaseLine["status"], "blue" | "yellow" | "green" | "gray"> = {
  ordered: "blue", partial: "yellow", received: "green", cancelled: "gray",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PurchasesTab({ productId }: { productId: string }) {
  const router = useRouter();
  const [data, setData]       = useState<PurchasesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiGet<PurchasesResponse>(`/api/v1/catalog/${productId}/purchases`);
      setData(d);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load purchase history.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-skeleton rounded-xl" />)}
    </div>
  );

  if (error) return (
    <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]"
      style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>
      {error}
    </p>
  );

  if (!data || data.items.length === 0) return (
    <div className="rounded-xl border border-dashed py-12 text-center" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>No purchase orders have included this product yet.</p>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Summary stats ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total POs",      value: data.total.toString() },
          { label: "Total Received", value: `${data.total_qty_received} units` },
          { label: "Total Cost",     value: formatMoney(data.total_cost_cents) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border px-4 py-3 shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
            <p className="mt-0.5 text-[15px] font-bold" style={{ color: "var(--color-text-primary)" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── PO lines table ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Purchase Order History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: "var(--color-text-secondary)" }}>
                <th className="px-4 py-2.5">PO Number</th>
                <th className="px-4 py-2.5">Vendor</th>
                <th className="px-4 py-2.5">Ordered</th>
                <th className="px-4 py-2.5">Received</th>
                <th className="px-4 py-2.5">Qty</th>
                <th className="px-4 py-2.5">Unit Cost</th>
                <th className="px-4 py-2.5">Total Cost</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-table-border)]">
              {data.items.map((line) => (
                <tr key={line.id}
                  className="cursor-pointer transition-colors hover:bg-[var(--color-table-row-hover)]"
                  onClick={() => router.push(`/purchasing/${line.po_id}`)}>
                  <td className="px-4 py-3 font-medium text-brand-600 hover:underline">{line.po_number}</td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{line.vendor_name}</td>
                  <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(line.ordered_at)}</td>
                  <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{line.received_at ? fmtDate(line.received_at) : "—"}</td>
                  <td className="px-4 py-3">
                    <span style={{ color: "var(--color-text-secondary)" }}>{line.qty_received}</span>
                    <span style={{ color: "var(--color-text-muted)" }}> / {line.qty_ordered}</span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(line.unit_cost_cents)}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(line.total_cost_cents)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[line.status]}>{line.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-table-header)" }}>
              <tr>
                <td colSpan={6} className="px-4 py-3 text-right text-[11px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>Totals</td>
                <td className="px-4 py-3 text-[13px] font-bold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(data.total_cost_cents)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
