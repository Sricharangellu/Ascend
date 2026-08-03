import { Link } from "wouter";
import { formatMoney } from "@/lib/money";

export function DashboardTopPerformers({
  topProducts,
  topCustomers,
}: {
  topProducts: any[];
  topCustomers: any[];
}) {
  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2 mt-6">
      {/* Top Products */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-5 py-3 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Top Products</h3>
          <Link href="/reports" className="text-[11px] font-medium text-[var(--color-link)] hover:underline">View all</Link>
        </div>
        <div className="p-0">
          <table className="w-full text-left">
            <tbody>
              {topProducts.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-center text-[13px] text-[var(--color-text-muted)]">No sales data yet.</td>
                </tr>
              ) : (
                topProducts.slice(0, 5).map((p, i) => (
                  <tr key={i} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-table-row-hover)]">
                    <td className="px-5 py-3">
                      <p className="text-[13px] font-medium text-[var(--color-text-primary)] line-clamp-1">{p.name}</p>
                      {p.sku && <p className="text-[11px] text-[var(--color-text-secondary)]">{p.sku}</p>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{formatMoney(p.revenue ?? p.revenueCents ?? 0)}</p>
                      <p className="text-[11px] text-[var(--color-text-secondary)]">{p.qty ?? p.units ?? 0} sold</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Customers */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-5 py-3 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Top Customers</h3>
          <Link href="/reports" className="text-[11px] font-medium text-[var(--color-link)] hover:underline">View all</Link>
        </div>
        <div className="p-0">
          <table className="w-full text-left">
            <tbody>
              {topCustomers.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-center text-[13px] text-[var(--color-text-muted)]">No customer sales yet.</td>
                </tr>
              ) : (
                topCustomers.slice(0, 5).map((c, i) => (
                  <tr key={i} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-table-row-hover)]">
                    <td className="px-5 py-3 flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-[11px] font-bold text-[var(--color-primary)]">
                        {(c.name || "U")[0].toUpperCase()}
                      </div>
                      <p className="text-[13px] font-medium text-[var(--color-text-primary)] line-clamp-1">{c.name}</p>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{formatMoney(c.totalCents ?? c.revenueCents ?? 0)}</p>
                      <p className="text-[11px] text-[var(--color-text-secondary)]">{c.orderCount ?? c.units ?? 0} orders</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
