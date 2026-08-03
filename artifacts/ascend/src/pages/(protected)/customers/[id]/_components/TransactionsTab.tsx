
import Link from "@/lib/link";
import { Card } from "@/components/Card";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import type { CustomerSummary } from "./shared";
import { orderStatusColor } from "./shared";

export function TransactionsTab({ summary }: { summary: CustomerSummary | null }) {
  if (!summary) {
    return (
      <Card title="Recent transactions">
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-skeleton rounded" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card title="Recent transactions" className="overflow-hidden p-0">
      {summary.recentOrders.length === 0 ? (
        <div className="px-5 py-8 text-center text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          No transactions yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.07em]"
                style={{ color: "var(--color-text-secondary)" }}>
                <th className="px-5 py-3">Order</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-table-border)]">
              {summary.recentOrders.map((order) => (
                <tr key={order.id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                  <td className="px-5 py-3">
                    <Link href={`/orders?id=${order.id}`} className="font-medium text-brand-600 hover:underline">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(order.createdAt)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${orderStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                    {formatMoney(order.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
