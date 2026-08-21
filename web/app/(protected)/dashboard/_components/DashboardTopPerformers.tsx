"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/money";

export function DashboardTopPerformers({
  topProducts,
  topCustomers,
}: {
  topProducts: Array<{
    name: string;
    sku?: string;
    revenue?: number;
    revenueCents?: number;
    qty?: number;
    units?: number;
  }>;
  topCustomers: Array<{
    name: string;
    totalCents?: number;
    revenueCents?: number;
    orderCount?: number;
    units?: number;
  }>;
}) {
  return (
    <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-5 py-3">
          <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Top Products</h3>
          <Link href="/reports" className="text-[11px] font-medium text-[var(--color-link)] hover:underline">
            View all
          </Link>
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
                      <p className="line-clamp-1 text-[13px] font-medium text-[var(--color-text-primary)]">{p.name}</p>
                      {p.sku && <p className="text-[11px] text-[var(--color-text-secondary)]">{p.sku}</p>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                        {formatMoney(p.revenue ?? p.revenueCents ?? 0)}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-secondary)]">{p.qty ?? p.units ?? 0} sold</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-5 py-3">
          <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Top Customers</h3>
          <Link href="/reports" className="text-[11px] font-medium text-[var(--color-link)] hover:underline">
            View all
          </Link>
        </div>
        <div className="p-0">
          <table className="w-full text-left">
            <tbody>
              {topCustomers.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-center text-[13px] text-[var(--color-text-muted)]">No customer sales yet.</td>
                </tr>
              ) : (
                topCustomers.slice(0, 5).map((c, i) => {
                  const countLabel =
                    c.orderCount != null
                      ? `${c.orderCount} orders`
                      : c.units != null
                        ? `${c.units} units`
                        : null;
                  return (
                    <tr key={i} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-table-row-hover)]">
                      <td className="flex items-center gap-3 px-5 py-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-[11px] font-bold text-[var(--color-primary)]">
                          {(c.name || "U")[0].toUpperCase()}
                        </div>
                        <p className="line-clamp-1 text-[13px] font-medium text-[var(--color-text-primary)]">{c.name}</p>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                          {formatMoney(c.totalCents ?? c.revenueCents ?? 0)}
                        </p>
                        {countLabel && <p className="text-[11px] text-[var(--color-text-secondary)]">{countLabel}</p>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
