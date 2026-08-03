
import Link from "@/lib/link";
import { Card } from "@/components/Card";

interface LowStockItem {
  id: string; sku: string; name: string; category: string;
  onHand: number; reorderPoint: number;
}

interface DashNotification {
  id: string; severity: string; title: string; body: string; read: boolean;
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-danger-500",
    warning:  "bg-warning-500",
    info:     "bg-info-400",
  };
  return (
    <span
      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${colors[severity] ?? "bg-[var(--color-border-strong)]"}`}
      aria-hidden="true"
    />
  );
}

const SeverityRowBg: Record<string, string> = {
  critical: "bg-[var(--color-danger-bg)] border-[var(--color-danger-border)]",
  warning:  "bg-[var(--color-warning-bg)] border-[var(--color-warning-border)]",
  info:     "bg-[var(--color-info-bg)] border-[var(--color-info-border)]",
};

export function DashboardOperational({
  lowStock,
  recentNotifs,
}: {
  lowStock: LowStockItem[];
  recentNotifs: DashNotification[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Low Stock */}
      <Card
        title="Low Stock Alerts"
        action={
          <Link href="/inventory" className="text-[12px] font-medium text-brand-600 hover:text-brand-700 hover:underline transition-colors">
            View all →
          </Link>
        }
      >
        {lowStock.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-success-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-success-600">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">All stock levels are healthy</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lowStock.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{item.name}</p>
                  <p className="font-mono text-[11px] text-[var(--color-text-secondary)]">{item.sku} · {item.category}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-bold text-[var(--color-warning-text)]">{item.onHand} left</p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">reorder at {item.reorderPoint}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Recent Alerts */}
      <Card
        title="Recent Alerts"
        action={
          <Link href="/notifications" className="text-[12px] font-medium text-brand-600 hover:text-brand-700 hover:underline transition-colors">
            View all →
          </Link>
        }
      >
        {recentNotifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-subtle)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--color-text-muted)]">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">No recent alerts</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {recentNotifs.map((n) => {
              const rowBg = SeverityRowBg[n.severity] ?? "bg-[var(--color-surface-subtle)] border-[var(--color-border)]";
              return (
                <li key={n.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${rowBg}`}>
                  <SeverityDot severity={n.severity} />
                  <div className="min-w-0">
                    <p className={`text-[13px] font-semibold leading-snug ${n.read ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-primary)]"}`}>
                      {n.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-secondary)]">{n.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
