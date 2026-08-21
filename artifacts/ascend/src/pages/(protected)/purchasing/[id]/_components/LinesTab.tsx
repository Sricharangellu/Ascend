
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import {
  marginColor,
  remaining,
  type POLine,
  type PurchaseOrderDetail,
  type PriceHistoryItem,
} from "./shared";

export interface PriceFilters {
  from: string;
  to: string;
  qtyBreak: string;
}

/** Cost delta vs the current invoiced price. Negative = a cheaper reference. */
function Delta({ invoiced, ref }: { invoiced: number; ref: number }) {
  const d = invoiced - ref;
  if (d === 0) return <span className="ml-1 text-xs" style={{ color: "var(--color-text-muted)" }}>even</span>;
  const worse = d > 0; // invoiced costs more than the reference → overpaying
  return (
    <span className={`ml-1 text-xs ${worse ? "text-red-500" : "text-emerald-600"}`}>
      {worse ? "▲" : "▼"}{formatMoney(Math.abs(d))}
    </span>
  );
}

export function LinesTab({
  order,
  priceHistory,
  goodsTotal,
  filters,
  onFiltersChange,
  loading,
}: {
  order: PurchaseOrderDetail;
  priceHistory: PriceHistoryItem[];
  goodsTotal: number;
  filters: PriceFilters;
  onFiltersChange: (f: PriceFilters) => void;
  loading: boolean;
}) {
  const set = (patch: Partial<PriceFilters>) => onFiltersChange({ ...filters, ...patch });
  const hasFilters = !!(filters.from || filters.to || filters.qtyBreak);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-[var(--color-table-border)] text-sm">
        <thead className="text-left text-xs font-semibold uppercase" style={{ backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}>
          <tr>
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3 text-right">Ordered</th>
            <th className="px-4 py-3 text-right">Received</th>
            <th className="px-4 py-3 text-right">Remaining</th>
            <th className="px-4 py-3 text-right">Unit cost</th>
            <th className="px-4 py-3 text-right">Last cost</th>
            <th className="px-4 py-3 text-right">Sell price</th>
            <th className="px-4 py-3 text-right">Margin</th>
            <th className="px-4 py-3 text-right">Line total</th>
            <th className="px-4 py-3">Lot / Expiry</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-table-border)]" style={{ backgroundColor: "var(--color-surface)" }}>
          {order.lines.length === 0 ? (
            <tr><td colSpan={10} className="px-4 py-6 text-center" style={{ color: "var(--color-text-muted)" }}>No lines on this order.</td></tr>
          ) : order.lines.map((line: POLine) => {
            const rem = remaining(line);
            const hist = priceHistory.find((h) => h.product_id === line.product_id);
            const prevCost = hist?.history?.[1]?.unit_cost_cents;
            const costDelta = prevCost != null ? line.unit_cost_cents - prevCost : null;
            const suggested = hist?.suggested_qty ?? 0;
            return (
              <tr key={line.id} className="hover:bg-[var(--color-surface-subtle)]">
                <td className="px-4 py-3">
                  <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>{line.product_name}</p>
                  <p className="font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>{line.product_sku}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {line.quantity}
                  {suggested > 0 && suggested !== line.quantity && (
                    <span
                      className="ml-1 rounded bg-brand-50 px-1 text-xs font-medium text-brand-600"
                      title="Suggested purchase qty from reorder point + sales velocity"
                    >
                      sug {suggested}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-emerald-700">{line.received_qty ?? 0}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  <span className={rem > 0 ? "font-semibold text-amber-700" : "text-emerald-600"}>{rem}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {formatMoney(line.unit_cost_cents)}
                  {costDelta != null && (
                    <span className={`ml-1 text-xs ${costDelta > 0 ? "text-red-500" : "text-emerald-600"}`}>
                      {costDelta > 0 ? "▲" : "▼"}{formatMoney(Math.abs(costDelta))}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                  {line.last_cost_cents ? formatMoney(line.last_cost_cents) : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(line.selling_price_cents)}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold ${marginColor(line.margin_pct)}`}>{line.margin_pct}%</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(line.line_cost_cents)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  <p>{line.lot_code ?? "—"}</p>
                  <p>{fmtDate(line.expiry_date)}</p>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-table-header)" }}>
            <td colSpan={8} className="px-4 py-3 text-right text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Total</td>
            <td className="px-4 py-3 text-right font-bold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(goodsTotal)}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      {/* ── Price intelligence ─────────────────────────────────────────── */}
      <div className="border-t px-4 py-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-table-header)" }}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <p className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>
            Price intelligence
            {loading && <span className="ml-2 font-normal" style={{ color: "var(--color-text-muted)" }}>updating…</span>}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs" style={{ color: "var(--color-text-muted)" }}>
              From
              <input
                type="date"
                value={filters.from}
                onChange={(e) => set({ from: e.target.value })}
                className="mt-1 rounded border px-2 py-1 text-sm"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
              />
            </label>
            <label className="flex flex-col text-xs" style={{ color: "var(--color-text-muted)" }}>
              To
              <input
                type="date"
                value={filters.to}
                onChange={(e) => set({ to: e.target.value })}
                className="mt-1 rounded border px-2 py-1 text-sm"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
              />
            </label>
            <label className="flex flex-col text-xs" style={{ color: "var(--color-text-muted)" }}>
              Qty break ≥
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={filters.qtyBreak}
                onChange={(e) => set({ qtyBreak: e.target.value })}
                placeholder="any"
                className="mt-1 w-24 rounded border px-2 py-1 text-sm"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
              />
            </label>
            {hasFilters && (
              <button
                type="button"
                onClick={() => onFiltersChange({ from: "", to: "", qtyBreak: "" })}
                className="rounded border px-2 py-1 text-sm hover:bg-[var(--color-surface-subtle)]"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-secondary)" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {priceHistory.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {hasFilters ? "No price history matches these filters." : "No price history yet for these products."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {priceHistory.map((ph) => (
              <div key={ph.product_id} className="rounded-lg border p-3" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>{ph.product_name}</p>
                <p className="mb-2 font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>{ph.sku}</p>

                <dl className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <dt style={{ color: "var(--color-text-muted)" }}>Invoiced (this PO)</dt>
                    <dd className="font-bold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(ph.invoiced_cents)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt style={{ color: "var(--color-text-muted)" }}>Last · this supplier</dt>
                    <dd className="tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
                      {ph.last_from_supplier ? (
                        <>
                          {formatMoney(ph.last_from_supplier.unit_cost_cents)}
                          <Delta invoiced={ph.invoiced_cents} ref={ph.last_from_supplier.unit_cost_cents} />
                          <span className="ml-1" style={{ color: "var(--color-text-muted)" }}>{fmtDate(ph.last_from_supplier.received_at)}</span>
                        </>
                      ) : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt style={{ color: "var(--color-text-muted)" }}>Best · all suppliers</dt>
                    <dd className="tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
                      {ph.best_across_suppliers ? (
                        <>
                          {formatMoney(ph.best_across_suppliers.unit_cost_cents)}
                          <Delta invoiced={ph.invoiced_cents} ref={ph.best_across_suppliers.unit_cost_cents} />
                        </>
                      ) : "—"}
                    </dd>
                  </div>
                  {ph.best_across_suppliers?.supplier_name && (
                    <p className="text-right text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      {ph.best_across_suppliers.supplier_name} · {fmtDate(ph.best_across_suppliers.received_at)}
                    </p>
                  )}
                  <div className="flex items-center justify-between border-t pt-1" style={{ borderColor: "var(--color-border)" }}>
                    <dt style={{ color: "var(--color-text-muted)" }}>Suggested qty</dt>
                    <dd className="font-semibold tabular-nums text-brand-700">
                      {ph.suggested_qty > 0 ? ph.suggested_qty : "—"}
                    </dd>
                  </div>
                  {ph.suggested_qty > 0 && (
                    <p className="text-right text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      stock {ph.current_stock} · {ph.velocity_per_day}/day
                    </p>
                  )}
                </dl>

                {ph.history.length > 0 && (
                  <div className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
                    {ph.history.map((h, i) => (
                      <div key={i} className="flex justify-between text-[11px]">
                        <span className={i === 0 ? "font-medium" : ""} style={{ color: i === 0 ? "var(--color-text-secondary)" : "var(--color-text-muted)" }}>{fmtDate(h.received_at)}</span>
                        <span className={i === 0 ? "tabular-nums" : "tabular-nums"} style={{ color: i === 0 ? "var(--color-text-secondary)" : "var(--color-text-muted)" }}>{formatMoney(h.unit_cost_cents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
