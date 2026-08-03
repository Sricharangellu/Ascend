
import Link from "@/lib/link";

interface QuickAction {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

function QuickActionCard({ href, label, description, icon, color }: QuickAction) {
  return (
    <Link
      href={href}
      className={[
        "group flex items-center gap-3.5 rounded-xl border px-4 py-3.5",
        "bg-[var(--color-surface)] border-[var(--color-border)]",
        "shadow-[var(--shadow-xs)] transition-all duration-150",
        "hover:shadow-[var(--shadow-sm)] hover:border-[var(--color-border-strong)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
      ].join(" ")}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white transition-transform duration-150 group-hover:scale-105 ${color}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-[var(--color-text-primary)] leading-tight">{label}</p>
        <p className="text-[11.5px] text-[var(--color-text-secondary)] mt-0.5 truncate">{description}</p>
      </div>
    </Link>
  );
}

// Icons
const IconRegister = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 7h8M8 11h8M8 15h2M14 15h2" />
  </svg>
);
const IconPlus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconChart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3" />
  </svg>
);
const IconBox = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
  </svg>
);
const IconQuote = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const ACTIONS: QuickAction[] = [
  { href: "/terminal",            label: "New Sale",          description: "Open the POS register",    icon: <IconRegister />, color: "bg-brand-600" },
  { href: "/catalog?new=product", label: "Add Product",       description: "Create a new catalog item", icon: <IconPlus />,    color: "bg-success-600" },
  { href: "/quotes",              label: "New Quote",         description: "Draft a customer quote",    icon: <IconQuote />,   color: "bg-info-600" },
  { href: "/reports",             label: "View Reports",      description: "Revenue & analytics",       icon: <IconChart />,   color: "bg-warning-600" },
  { href: "/inventory",           label: "Inventory",         description: "Stock levels & reorder",    icon: <IconBox />,     color: "bg-neutral-700" },
];

export function DashboardQuickActions() {
  return (
    <section aria-label="Quick actions">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-label text-[var(--color-text-muted)]">Quick Actions</h2>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {ACTIONS.map((action) => (
          <QuickActionCard key={action.href} {...action} />
        ))}
      </div>
    </section>
  );
}
