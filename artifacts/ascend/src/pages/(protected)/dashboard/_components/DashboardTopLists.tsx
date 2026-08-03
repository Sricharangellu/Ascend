
import Link from "@/lib/link";
import { Card } from "@/components/Card";
import { formatMoney } from "@/lib/money";

interface TopProductItem { id: string; name: string; category?: string; qty: number; revenue: number; }
interface TopCustomerItem { customer_id: string; name: string; orderCount: number; totalCents: number; }
interface CategoryItem { key: string; name: string; revenueCents: number; }

function SkeletonBox({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-skeleton rounded ${className}`} />;
}

export function DashboardTopLists({
  topProducts, topCustomers, categoryItems, loading, loadingCategory,
}: {
  topProducts: TopProductItem[]; topCustomers: TopCustomerItem[];
  categoryItems: CategoryItem[]; loading: boolean; loadingCategory: boolean;
}) {
  return (
    <>
      <section aria-label="Top products and customers" className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card title="Top Products" noPadding>
          {loading ? (
            <div className="space-y-3 px-5 py-4">
              {[...Array(5)].map((_, i) => <SkeletonBox key={i} className="h-8 w-full" />)}
            </div>
          ) : topProducts.length === 0 ? (
            <p className="px-5 py-4 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>No data for this period.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--color-text-secondary)" }}>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-table-border)]">
                {topProducts.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                    <td className="px-5 py-3">
                      <Link href={`/catalog/${p.id}`} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                        {p.name}
                      </Link>
                      {p.category && <span className="ml-2 text-[11px]" style={{ color: "var(--color-text-muted)" }}>{p.category}</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{p.qty}</td>
                    <td className="px-5 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Top Customers" noPadding>
          {loading ? (
            <div className="space-y-3 px-5 py-4">
              {[...Array(5)].map((_, i) => <SkeletonBox key={i} className="h-8 w-full" />)}
            </div>
          ) : topCustomers.length === 0 ? (
            <p className="px-5 py-4 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>No data for this period.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--color-text-secondary)" }}>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-3 py-3 text-right">Orders</th>
                  <th className="px-5 py-3 text-right">Total Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-table-border)]">
                {topCustomers.map((c) => (
                  <tr key={c.customer_id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                    <td className="px-5 py-3">
                      <Link href={`/customers/${c.customer_id}`} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{c.orderCount}</td>
                    <td className="px-5 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(c.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      {(loadingCategory || categoryItems.length > 0) && (
        <section aria-label="Sales by category">
          <Card title="Sales by Category" noPadding>
            {loadingCategory ? (
              <div className="space-y-2 px-5 py-4">
                {[...Array(4)].map((_, i) => <SkeletonBox key={i} className="h-7 w-full" />)}
              </div>
            ) : (
              <div className="space-y-2 px-5 py-3">
                {(() => {
                  const maxRev = Math.max(...categoryItems.map((c) => c.revenueCents), 1);
                  return categoryItems.map((c) => {
                    const pct = Math.round((c.revenueCents / maxRev) * 100);
                    return (
                      <div key={c.key}>
                        <div className="mb-1 flex items-center justify-between text-[13px]">
                          <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{c.name}</span>
                          <span className="tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(c.revenueCents)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-surface-subtle)" }}>
                          <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </Card>
        </section>
      )}
    </>
  );
}
