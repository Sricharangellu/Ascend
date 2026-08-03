
import { useMemo, useState } from "react";
import { useQuery } from "@/lib/useQuery";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { TableSkeleton } from "@/components/TableSkeleton";

interface PurchaseOrder {
  id: string;
  po_number: number;
  supplier_id: string;
  status: string;
  receive_status: string;
  total_cost_cents: number;
  created_at: number;
  received_at: number | null;
}

interface Supplier { id: string; name: string; }

const STATUS_COLORS: Record<string, string> = {
  received: "bg-emerald-50 text-emerald-700",
  ordered:  "bg-blue-50 text-blue-700",
  draft:    "",
  cancelled:"bg-red-50 text-red-700",
  partial:  "bg-amber-50 text-amber-700",
};

function fmt(ts: number) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "2-digit" }).format(new Date(ts));
}

export function OrdersTab() {
  const [show, setShow] = useState("All");
  const [search, setSearch] = useState("");
  const [outlet, setOutlet] = useState("All");

  const { data: ordersData, loading, error } =
    useQuery("purchasing:orders", () => apiGet<{ items: PurchaseOrder[] }>("/api/v1/purchasing/orders"));
  const { data: suppliersData } =
    useQuery("purchasing:suppliers", () => apiGet<{ items: Supplier[] }>("/api/v1/purchasing/suppliers"));

  const supplierMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of suppliersData?.items ?? []) map[s.id] = s.name;
    return map;
  }, [suppliersData]);

  const orders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (ordersData?.items ?? []).filter((o) => {
      const supplier = (supplierMap[o.supplier_id] ?? o.supplier_id).toLowerCase();
      const matchShow = show === "All" || o.status === show;
      const matchQ = !q || String(o.po_number).includes(q) || supplier.includes(q);
      return matchShow && matchQ;
    });
  }, [ordersData, supplierMap, show, search]);

  const totalCost = useMemo(() => orders.reduce((s, o) => s + o.total_cost_cents, 0), [orders]);

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
              <option value="All">All orders</option>
              <option value="ordered">Ordered</option>
              <option value="received">Received</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Search</label>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="PO number or supplier…"
              className={ctrlCls} style={ctrlStyle} />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Outlet</label>
            <select value={outlet} onChange={(e) => setOutlet(e.target.value)} className={ctrlCls} style={ctrlStyle}>
              <option value="All">All outlets</option>
              <option value="Main Store">Main Store</option>
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
            Displaying {orders.length} orders · {formatMoney(totalCost)} total cost
          </span>
          <button type="button"
            className="rounded-md border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-600/5">
            New order
          </button>
        </div>

        {loading ? (
          <TableSkeleton headers={["Order #", "From", "To", "Status", "Created", "Total cost"]} rows={5} />
        ) : error ? (
          <div className="p-6 text-sm text-red-600" role="alert">{error}</div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No orders match the current filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead
              className="border-b text-xs font-semibold uppercase tracking-wide"
              style={{ borderColor: "var(--color-table-border)", backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}
            >
              <tr>
                <th className="px-4 py-3 text-left">Order # / Date</th>
                <th className="px-4 py-3 text-left">From</th>
                <th className="px-4 py-3 text-left">To</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-right">Total cost</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--color-table-border)" }}>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer hover:bg-[var(--color-surface-subtle)]"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>PO-{o.po_number}</div>
                    {o.received_at && (
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>Received {fmt(o.received_at)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>{supplierMap[o.supplier_id] ?? o.supplier_id}</td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>Main Store</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[o.status] ?? ""}`}
                      style={!STATUS_COLORS[o.status] ? { backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" } : undefined}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{fmt(o.created_at)}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(o.total_cost_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
