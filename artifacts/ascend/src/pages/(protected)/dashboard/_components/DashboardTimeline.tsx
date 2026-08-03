import { format } from "date-fns";
import type { DashNotification } from "../page";

function getIcon(type: string, severity: string) {
  if (severity === "critical") {
    return <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] ring-4 ring-[var(--color-page-bg)]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div>;
  }
  if (type.includes("order")) {
    return <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)] ring-4 ring-[var(--color-page-bg)]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg></div>;
  }
  if (type.includes("inventory")) {
    return <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] ring-4 ring-[var(--color-page-bg)]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg></div>;
  }
  return <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] ring-4 ring-[var(--color-page-bg)]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div>;
}

export function DashboardTimeline({ notifs }: { notifs: DashNotification[] }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-5 py-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Activity Timeline</h2>
      </div>
      
      <div className="p-5">
        {notifs.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-[13px] text-[var(--color-text-muted)]">
            No recent activity.
          </div>
        ) : (
          <div className="relative pl-3">
            {/* Vertical connecting line */}
            <div className="absolute left-[11px] top-3 bottom-3 w-px bg-[var(--color-border)]" />
            
            <ul className="space-y-6">
              {notifs.map((n, i) => (
                <li key={n.id} className="relative flex gap-4">
                  <div className="relative z-10 shrink-0">
                    {getIcon(n.type, n.severity)}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-[13px] font-medium text-[var(--color-text-primary)]">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)] line-clamp-1">
                        {n.body}
                      </p>
                    )}
                    <time className="mt-1 flex text-[11px] font-medium text-[var(--color-text-muted)]">
                      {format(new Date(n.created_at), "h:mm a")}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
