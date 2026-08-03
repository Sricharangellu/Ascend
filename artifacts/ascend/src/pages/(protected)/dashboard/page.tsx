import { useState, useCallback, useEffect } from "react";
import { useQuery, invalidateQuery } from "@/lib/useQuery";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { apiGet, apiPost } from "@/api-client/client";
import { useFinderContext, type FinderDateRange } from "@/lib/useFinderContext";
import { useRealtimeStream } from "@/hooks/useRealtimeStream";
import { RetailSetupChecklist } from "@/components/setup/RetailSetupChecklist";

import { DashboardHero } from "./_components/DashboardHero";
import { DashboardOverview } from "./_components/DashboardOverview";
import { DashboardOpsHub } from "./_components/DashboardOpsHub";
import { DashboardAiCommandCenter } from "./_components/DashboardAiCommandCenter";
import { DashboardPipeline } from "./_components/DashboardPipeline";
import { DashboardTimeline } from "./_components/DashboardTimeline";
import { DashboardCharts } from "./_components/DashboardCharts";
import { DashboardTopPerformers } from "./_components/DashboardTopPerformers";
import { DashboardQuickActions } from "./_components/DashboardQuickActions";
import { DashboardExecutive } from "./_components/DashboardExecutive";
import ProgressPanel from "./_components/ProgressPanel";
import { BackupHealthCard } from "./_components/BackupHealthCard";

import type { RecommendationReport, DashboardRecommendation } from "./_components/DashboardAiCommandCenter";
import { getUser } from "@/lib/auth";

const SIGNAL_TO_VERIFICATION: Record<string, string> = {
  no_products: "retail.first_product",
  products_without_cost: "retail.cost_prices_complete",
  out_of_stock: "retail.first_receiving",
  low_stock: "retail.first_receiving",
  no_sales_yet: "retail.first_sale",
  uncategorized_expenses: "retail.expenses_categorized",
};

export type Range = "today" | "7d" | "30d";

export type DashboardView = "Executive" | "Operations" | "Finance" | "Store";
export type Industry = "Retail" | "Wholesale" | "Distribution" | "Manufacturing" | "Healthcare" | "Hospitality" | "E-commerce" | "Enterprise Services";

export interface SummaryResponse {
  orders: { open: number; completed: number; refunded: number; voided: number; total: number };
  revenue: { grossCents: number; taxCents: number; netCents: number };
  payments: { capturedCount: number; capturedCents: number; byMethod: Record<string, number> };
  kpi?: {
    saleCount: number; grossProfitCents: number | null; customerCount: number;
    avgSaleValueCents: number; avgItemsPerSale: number;
    discountedAmountCents: number; discountedPct: number;
  };
  sparklines?: { revenue: number[]; saleCount: number[] };
}

export interface Valuation {
  totalCostCents: number;
  totalRetailCents: number;
  total: number;
}

export interface CashMovementResponse {
  items: { movement_type: string; amount: number; created_at: number }[];
  totalInCents: number;
  totalOutCents: number;
  netCents: number;
}

export interface POListResponse {
  items: { status: string }[];
}

export interface InventoryLevelsResponse {
  items: any[];
}

export interface DashNotification {
  id: string; type: string; severity: string; title: string; body: string; read: boolean; created_at: number;
}

function dateRangeForPreset(preset: FinderDateRange["preset"]): FinderDateRange {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (preset === "current_week") {
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (preset === "current_month") {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  }
  const iso = (v: Date) => v.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end), preset };
}

export default function DashboardPage() {
  const { storeId, outletId, dateRange } = useFinderContext();
  const range: Range = dateRange.preset === "today" ? "today" : dateRange.preset === "current_month" ? "30d" : "7d";
  const scope = new URLSearchParams({ store_id: storeId, outlet_id: outletId }).toString();

  const [progressRefresh, setProgressRefresh] = useState(0);

  // Queries
  const fetchSummary = useCallback(() => apiGet<SummaryResponse>(`/api/v1/reports/summary?range=${range}&${scope}`), [range, scope]);
  const fetchValuation = useCallback(() => apiGet<Valuation>(`/api/v1/reports/inventory-valuation`), []);
  const fetchCash = useCallback(() => {
    const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
    const from = Date.now() - days * 24 * 60 * 60 * 1000;
    return apiGet<CashMovementResponse>(`/api/v1/reports/cash-movement?limit=500&from=${from}`);
  }, [range]);
  const fetchPOs = useCallback(() => apiGet<POListResponse>(`/api/v1/purchasing/orders?limit=200`), []);
  const fetchLowStock = useCallback(() => apiGet<InventoryLevelsResponse>(`/api/v1/inventory/levels?lowStock=true&pageSize=10`), []);
  const fetchReorder = useCallback(() => apiGet<{ items: any[] }>(`/api/v1/inventory/reorder-suggestions`), []);
  const fetchExpiry = useCallback(() => apiGet<{ items: any[] }>(`/api/v1/inventory/expiry`), []);
  const fetchLocations = useCallback(() => apiGet<{ items: any[] }>(`/api/v1/inventory/locations`), []);
  const fetchNotifs = useCallback(() => apiGet<{ items: DashNotification[] }>("/api/v1/notifications?limit=10"), []);
  const fetchRecommendations = useCallback(() => apiGet<RecommendationReport>("/api/v1/reports/recommendations?recentDays=30"), []);
  const fetchTopProducts = useCallback(() => apiGet<{ items: any[] }>(`/api/v1/reports/top-products?range=${range}&limit=5&${scope}`), [range, scope]);
  const fetchTopCustomers = useCallback(() => apiGet<{ items: any[] }>(`/api/v1/reports/sales-by-customer?range=${range}&${scope}`), [range, scope]);

  const { data: summary, loading: loadingSummary } = useQuery(`dashboard:summary:${range}:${scope}`, fetchSummary, { staleMs: 60_000 });
  const { data: valuation, loading: loadingVal } = useQuery(`dashboard:valuation`, fetchValuation, { staleMs: 60_000 });
  const { data: cash, loading: loadingCash } = useQuery(`dashboard:cash:${range}`, fetchCash, { staleMs: 60_000 });
  const { data: pos, loading: loadingPOs } = useQuery(`dashboard:pos`, fetchPOs, { staleMs: 60_000 });
  const { data: lowStockData } = useQuery(`dashboard:lowStock`, fetchLowStock, { staleMs: 60_000 });
  const { data: reorderData } = useQuery(`dashboard:reorder`, fetchReorder, { staleMs: 60_000 });
  const { data: expiryData } = useQuery(`dashboard:expiry`, fetchExpiry, { staleMs: 60_000 });
  const { data: locationsData } = useQuery(`dashboard:locations`, fetchLocations, { staleMs: 60_000 });
  const { data: notifsData } = useQuery(`dashboard:notifs`, fetchNotifs, { staleMs: 60_000 });
  const { data: recData, loading: loadingRecs } = useQuery("dashboard:recommendations:30d", fetchRecommendations, { staleMs: 60_000 });
  const { data: topProductsData } = useQuery(`dashboard:top-products:${range}:${scope}`, fetchTopProducts, { staleMs: 60_000 });
  const { data: topCustomersData } = useQuery(`dashboard:top-customers:${range}:${scope}`, fetchTopCustomers, { staleMs: 60_000 });

  useRealtimeStream(
    useCallback((event) => {
      if (event.type === "order_created" || event.type === "payment_captured") {
        invalidateQuery(`dashboard:summary:${range}:${scope}`);
        invalidateQuery("dashboard:recommendations:30d");
        invalidateQuery(`dashboard:cash:${range}`);
        // Executive workspace queries
        invalidateQuery(`dashboard:pl:${range}:${scope}`);
        invalidateQuery(`dashboard:executive-trend:30d:${scope}`);
        invalidateQuery(`dashboard:ar-aging:${scope}`);
        invalidateQuery(`dashboard:ap-aging:${scope}`);
        invalidateQuery(`dashboard:vendor-sales:${range}:${scope}`);
      }
    }, [range, scope]),
  );

  const onTrackRecommendation = useCallback(async (rec: DashboardRecommendation) => {
    await apiPost("/api/v1/progress/tasks", {
      title: rec.title,
      description: `${rec.detail}\n\nRecommended: ${rec.action} → ${rec.href}`,
      category: `recommendation:${rec.category}`,
      verificationSource: (rec.signalCode && SIGNAL_TO_VERIFICATION[rec.signalCode]) || null,
    });
    setProgressRefresh((n) => n + 1);
  }, []);

  // Compute metrics (normalize: API values may be null/non-numeric)
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  const cashFlowCents = num(cash?.netCents);
  const openPOs = (pos?.items ?? []).filter(po => po.status === "ordered" || po.status === "partially_received").length;
  const activeUsers = 1; // Backend doesn't have an endpoint for active users currently, so default to 1 (the current user).

  const inventoryStats = {
    warehouses: (locationsData?.items ?? []).length,
    skus: num(valuation?.total),
    lowStock: (lowStockData?.items ?? []).length,
    expiringSoon: (expiryData?.items ?? []).length,
  };

  const { data: businessProfile } = useQuery("settings:business-profile", () => apiGet<{ businessType?: string }>("/api/v1/settings/business-profile"), { staleMs: Infinity });

  const VALID_INDUSTRIES: Industry[] = ["Retail", "Wholesale", "Distribution", "Manufacturing", "Healthcare", "Hospitality", "E-commerce", "Enterprise Services"];
  const VALID_VIEWS: DashboardView[] = ["Executive", "Operations", "Finance", "Store"];

  const [industry, setIndustry] = useState<Industry>(() => {
    const stored = localStorage.getItem("ascend_dashboard_industry");
    return VALID_INDUSTRIES.find(v => v === stored) ?? "Retail";
  });
  useEffect(() => {
    if (!VALID_INDUSTRIES.includes(localStorage.getItem("ascend_dashboard_industry") as Industry) && businessProfile?.businessType) {
      const mapped = VALID_INDUSTRIES.find(v => v.toLowerCase() === businessProfile.businessType?.toLowerCase());
      if (mapped) setIndustry(mapped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessProfile?.businessType]);

  const [view, setView] = useState<DashboardView>(() => {
    const stored = localStorage.getItem("ascend_dashboard_view");
    const valid = VALID_VIEWS.find(v => v === stored);
    if (valid) return valid;
    const user = getUser();
    const role = user?.role || "owner";
    if (role === "cashier") return "Store";
    if (role === "manager") return "Operations";
    return "Executive";
  });

  const handleSetIndustry = (val: Industry) => {
    setIndustry(val);
    localStorage.setItem("ascend_dashboard_industry", val);
  };
  const handleSetView = (val: DashboardView) => {
    setView(val);
    localStorage.setItem("ascend_dashboard_view", val);
  };

  // Section components configured by view
  const S_HERO = <DashboardHero key="hero" />;
  const S_KPI = <DashboardOverview key="kpi" summary={summary} loadingSummary={loadingSummary} inventoryValueCents={num(valuation?.totalCostCents)} loadingValuation={loadingVal} cashFlowCents={cashFlowCents} loadingCash={loadingCash} openPOs={openPOs} loadingPOs={loadingPOs} activeUsers={activeUsers} recommendationCount={recData?.summary?.total ?? 0} industry={industry} view={view} />;
  const S_EXEC = <DashboardExecutive key="executive" range={range} scope={scope} topCustomers={topCustomersData?.items ?? []} />;
  const S_AI = <DashboardAiCommandCenter key="ai" report={recData} loading={loadingRecs} onTrackTask={onTrackRecommendation} reorderCount={(reorderData?.items ?? []).length} />;
  const S_PIPELINE = <DashboardPipeline key="pipeline" />;
  const S_TIMELINE = <DashboardTimeline key="timeline" notifs={notifsData?.items ?? []} />;
  const S_CHARTS = <DashboardCharts key="charts" range={range} scope={scope} />;
  const S_TOP = <DashboardTopPerformers key="top" topProducts={topProductsData?.items ?? []} topCustomers={topCustomersData?.items ?? []} />;
  const S_QA = <DashboardQuickActions key="qa" />;
  const S_OPS = <DashboardOpsHub key="ops" inventoryStats={inventoryStats} industry={industry} view={view} />;
  const S_PROG = <ProgressPanel key="prog" refreshSignal={progressRefresh} />;
  const S_BACKUP = <BackupHealthCard key="backup" />;

  // Define layout structures per preset
  const layouts: Record<DashboardView, { top: React.ReactNode[]; main: React.ReactNode[]; side: React.ReactNode[] }> = {
    Executive: {
      top: [S_HERO],
      main: [S_KPI, S_EXEC, S_PIPELINE, S_CHARTS, S_TOP, S_OPS],
      side: [S_AI, S_TIMELINE, S_PROG, S_BACKUP]
    },
    Operations: {
      top: [S_QA],
      main: [S_KPI, S_OPS, S_PIPELINE, S_CHARTS, S_TOP],
      side: [S_AI, S_TIMELINE, S_PROG, S_BACKUP]
    },
    Finance: {
      top: [],
      main: [S_EXEC, S_KPI, S_CHARTS, S_TOP, S_OPS],
      side: [S_AI, S_TIMELINE, S_PROG, S_BACKUP]
    },
    Store: {
      top: [S_QA],
      main: [S_KPI, S_CHARTS, S_TOP, S_OPS],
      side: [S_TIMELINE, S_PROG, S_BACKUP]
    }
  };

  const currentLayout = layouts[view];

  return (
    <EnterpriseShell
      active="dashboard"
      title="Dashboard"
      subtitle="Enterprise Command Center"
      contentClassName="overflow-y-auto bg-[var(--color-page-bg)]"
    >
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        
        {/* Header Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-sm">
            {(["Executive", "Operations", "Finance", "Store"] as DashboardView[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => handleSetView(v)}
                className={`rounded-md px-4 py-1.5 text-[13px] font-semibold transition-all ${view === v ? "bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] shadow-sm ring-1 ring-[var(--color-border)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">Industry focus:</span>
            <select
              value={industry}
              onChange={(e) => handleSetIndustry(e.target.value as Industry)}
              className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-medium text-[var(--color-text-primary)] shadow-sm outline-none transition-colors hover:border-[var(--color-border-strong)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
            >
              <option value="Retail">Retail</option>
              <option value="Wholesale">Wholesale</option>
              <option value="Distribution">Distribution</option>
              <option value="Manufacturing">Manufacturing</option>
              <option value="Healthcare">Healthcare</option>
              <option value="Hospitality">Hospitality</option>
              <option value="E-commerce">E-commerce</option>
              <option value="Enterprise Services">Enterprise Services</option>
            </select>
          </div>
        </div>

        {/* Retail Setup Checklist Banner (auto-hides when complete) */}
        <RetailSetupChecklist />

        {/* Top Span */}
        <div className="space-y-6">
          {currentLayout.top}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-6">
            {currentLayout.main}
          </div>

          <div className="space-y-6">
            {currentLayout.side}
          </div>
        </div>

      </div>
    </EnterpriseShell>
  );
}
