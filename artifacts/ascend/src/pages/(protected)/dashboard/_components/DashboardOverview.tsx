import { Link } from "wouter";
import { formatMoney } from "@/lib/money";
import type { SummaryResponse } from "../page";

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconTrendUp() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>; }
function IconDollar() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>; }
function IconActivity() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>; }
function IconLayers() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>; }
function IconShoppingCart() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>; }
function IconTruck() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>; }
function IconUsers() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>; }
function IconSparkles() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>; }

// ── Components ────────────────────────────────────────────────────────────────

interface KpiProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  loading?: boolean;
  href: string;
}

function LiveKpi({ label, value, icon, loading, href }: KpiProps) {
  return (
    <Link href={href} className="group relative flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/30 hover:shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">{label}</span>
        <span className="text-[var(--color-text-muted)] transition-colors group-hover:text-brand-500">{icon}</span>
      </div>
      {loading ? (
        <div className="mt-1 h-8 w-1/2 animate-skeleton rounded-md" />
      ) : (
        <div className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">{value}</div>
      )}
    </Link>
  );
}

export function DashboardOverview({
  summary,
  loadingSummary,
  inventoryValueCents,
  loadingValuation,
  cashFlowCents,
  loadingCash,
  openPOs,
  loadingPOs,
  activeUsers,
  recommendationCount,
  industry,
  view
}: {
  summary?: SummaryResponse;
  loadingSummary: boolean;
  inventoryValueCents: number;
  loadingValuation: boolean;
  cashFlowCents: number;
  loadingCash: boolean;
  openPOs: number;
  loadingPOs: boolean;
  activeUsers: number;
  recommendationCount: number;
  industry: string;
  view: string;
}) {
  const revCents = summary?.revenue.grossCents ?? 0;
  const gpCents = summary?.kpi?.grossProfitCents ?? revCents;
  const openSales = summary?.orders.open ?? 0;

  const kpis = [
    { id: "revenue", label: "Revenue", value: formatMoney(revCents), icon: <IconTrendUp />, loading: loadingSummary, href: "/reports" },
    { id: "profit", label: "Gross Profit", value: formatMoney(gpCents), icon: <IconDollar />, loading: loadingSummary, href: "/reports" },
    { id: "cash", label: "Cash Flow", value: formatMoney(cashFlowCents), icon: <IconActivity />, loading: loadingCash, href: "/finance" },
    { id: "inventory", label: "Inventory Value", value: formatMoney(inventoryValueCents), icon: <IconLayers />, loading: loadingValuation, href: "/reports" },
    { id: "pos", label: "Open POs", value: openPOs, icon: <IconTruck />, loading: loadingPOs, href: "/purchasing" },
    { id: "sales", label: "Open Sales", value: openSales, icon: <IconShoppingCart />, loading: loadingSummary, href: "/orders" },
    { id: "users", label: "Active Users", value: activeUsers, icon: <IconUsers />, href: "/team" },
    { id: "ai", label: "AI Insights", value: recommendationCount, icon: <IconSparkles />, href: "/reports" },
  ];

  let order = ["revenue", "profit", "cash", "inventory", "pos", "sales", "users", "ai"];
  
  if (view === "Finance") {
    order = ["cash", "revenue", "profit", "inventory", "sales", "pos", "users", "ai"];
  } else if (industry === "Wholesale" || industry === "Distribution") {
    order = ["pos", "inventory", "revenue", "profit", "sales", "cash", "users", "ai"];
  } else if (industry === "E-commerce") {
    order = ["revenue", "sales", "profit", "cash", "inventory", "pos", "users", "ai"];
  }

  const sortedKpis = order.map(id => kpis.find(k => k.id === id)!).filter(Boolean);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">Live Business Overview</h2>
        <div className="flex h-2 w-2 items-center justify-center">
          <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
        {sortedKpis.map((k) => (
          <LiveKpi key={k.id} label={k.label} value={k.value} icon={k.icon} loading={k.loading} href={k.href} />
        ))}
      </div>
    </section>
  );
}
