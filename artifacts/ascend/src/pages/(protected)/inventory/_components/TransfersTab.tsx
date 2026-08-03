
import { useMemo, useState } from "react";
import { useQuery } from "@/lib/useQuery";
import { apiGet } from "@/api-client/client";
import { TableSkeleton } from "@/components/TableSkeleton";

interface Transfer {
  id: string;
  transfer_number: string;
  from_location: string;
  to_location: string;
  status: string;
  qty: number;
  created_at: number;
  due_date: number;
  note: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  completed:  "bg-emerald-50 text-emerald-700",
  in_transit: "bg-blue-50 text-blue-700",
  pending:    "bg-amber-50 text-amber-700",
  cancelled:  "bg-red-50 text-red-700",
};

function fmt(ts: number) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "2-digit" }).format(new Date(ts));
}

export function TransfersTab() {
  const [show, setShow] = useState("All");
  const [search, setSearch] = useState("");
  const [outlet, setOutlet] = useState("All");

  const { data, loading, error } =
    useQuery("inventory:transfers", () => apiGet<{ items: Transfer[] }>("/api/v1/inventory/transfers"));

  const transfers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.items ?? []).filter((t) => {
      const matchShow = show === "All" || t.status === show;
      const matchQ = !q || t.transfer_number.toLowerCase().includes(q) ||
        t.from_location.toLowerCase().includes(q) ||
        t.to_location.toLowerCase().includes(q);
      const matchOutlet = outlet === "All" || t.from_location === outlet || t.to_location === outlet;
      return matchShow && matchQ && matchOutlet;
    });
  }, [data, show, search, outlet]);

  const totalQty = useMemo(() => transfers.reduce((s, t) => s + t.qty, 0), [transfers]);

  const ctrlCls = "w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";
  const ctrlStyle = {
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text-primary)",
  };

  return (
    <>
      {/* Filter bar */}
      <div className="rounded-lg border shadow-sm" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="flex flex-wrap items-end gap-3 px-4 py-4">
          <div className="w-36">
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Show</label>
            <select value={show} onChange={(e) => setShow(e.target.value)} className={ctrlCls} style={ctrlStyle}>
              <option value="All">All transfers</option>
              <option value="pending">Pending</option>
              <option value="in_transit">In transit</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Search</label>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Transfer # or location…"
              className={ctrlCls} style={ctrlStyle} />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Outlet</label>
            <select value={outlet} onChange={(e) => setOutlet(e.target.value)} className={ctrlCls} style={ctrlStyle}>
              <option value="All">All outlets</option>
              <option value="Main Store">Main Store</option>
              <option value="Warehouse">Warehouse</option>
              <option value="Downtown">Downtown</option>
            </select>
          </div>
          <div className="ml-auto flex items-center gap-4 pb-0.5">
            <button type="button" onClick={() => { setShow("All"); setSearch(""); setOutlet("All"); }}
              className="text-sm text-brand-600 hover:underline">Clear filters</button>
            <button type="button" className="text-sm hover:underline" style={{ color: "var(--color-text-muted)" }}>More filters</button>
            <button type="button"
              className="rounded-md bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4849d0]">
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-lg border shadow-sm" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div
          className="flex items-center justify-between border-b px-4 py-2.5"
          style={{ borderColor: "var(--color-table-border)" }}
        >
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Displaying {transfers.length} transfers · {totalQty.toLocaleString()} total qty
          </span>
          <button type="button"
            className="rounded-md border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-600/5">
            New transfer
          </button>
        </div>

        {loading ? (
          <TableSkeleton headers={["Transfer #", "From", "To", "Status", "Due date", "Created", "Qty"]} rows={5} />
        ) : error ? (
          <div className="p-6 text-sm text-red-600" role="alert">{error}</div>
        ) : transfers.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No transfers match the current filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead
              className="border-b text-xs font-semibold uppercase tracking-wide"
              style={{ borderColor: "var(--color-table-border)", backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}
            >
              <tr>
                <th className="px-4 py-3 text-left">Transfer # / Due</th>
                <th className="px-4 py-3 text-left">From</th>
                <th className="px-4 py-3 text-left">To</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--color-table-border)" }}>
              {transfers.map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-[var(--color-surface-subtle)]">
                  <td className="px-4 py-3">
                    <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>{t.transfer_number}</div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Due {fmt(t.due_date)}</div>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>{t.from_location}</td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{t.to_location}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[t.status] ?? ""}`}
                      style={!STATUS_COLORS[t.status] ? { backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" } : undefined}
                    >
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{fmt(t.created_at)}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{t.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
