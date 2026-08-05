"use client";

import { useState, useCallback, useEffect, type ReactNode } from "react";
import { useQuery, invalidateQuery } from "@/lib/useQuery";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Select } from "@/components/Select";
import { apiGet, apiPost } from "@/api-client/client";
import { useFinderContext } from "@/lib/useFinderContext";
import { useRealtimeStream } from "@/hooks/useRealtimeStream";
import { RetailSetupChecklist } from "@/components/setup/RetailSetupChecklist";
import { getUser, getStoredUser } from "@/lib/auth";

import { DashboardHero } from "./_components/DashboardHero";
import { DashboardOverview } from "./_components/DashboardOverview";
import { DashboardOpsHub } from "./_components/DashboardOpsHub";
import { DashboardPrioritiesPanel } from "./_components/DashboardPrioritiesPanel";
import { DashboardPipeline } from "./_components/DashboardPipeline";
import { DashboardTimeline } from "./_components/DashboardTimeline";
import { DashboardCharts } from "./_components/DashboardCharts";
import { DashboardTopPerformers } from "./_components/DashboardTopPerformers";
import { DashboardQuickActions } from "./_components/DashboardQuickActions";
import { DashboardExecutive } from "./_components/DashboardExecutive";
import { AiCommandCenterBanner } from "./_components/AiCommandCenterBanner";
import ProgressPanel from "./_components/ProgressPanel";

import type { RecommendationReport, DashboardRecommendation } from "./_components/DashboardPrioritiesPanel";

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
export type Industry =
  | "Retail"
  | "Wholesale"
  | "Distribution"
  | "Manufacturing"
  | "Healthcare"
  | "Hospitality"
  | "E-commerce"
  | "Enterprise Services";

export interface SummaryResponse {
  orders: { open: number; completed: number; refunded: number; voided: number; total: number };
  revenue: { grossCents: number; taxCents: number; netCents: number };
  payments: { capturedCount: number; capturedCents: number; byMethod: Record<string, number> };
  kpi?: {
    saleCount: number;
    grossProfitCents: number | null;
    customerCount: number;
    avgSaleValueCents: number;
    avgItemsPerSale: number;
    discountedAmountCents: number;
    discountedPct: number;
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
  items: unknown[];
}

export interface ExpirySummaryResponse {
  expiringSoon: { lots: number; units: number; valueCents: number; withinDays: number };
}

export interface DashNotification {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  read: boolean;
  created_at: number;
}

const INDUSTRY_OPTIONS = [
  { value: "Retail", label: "Retail" },
  { value: "Wholesale", label: "Wholesale" },
  { value: "Distribution", label: "Distribution" },
  { value: "Manufacturing", label: "Manufacturing" },
  { value: "Healthcare", label: "Healthcare" },
  { value: "Hospitality", label: "Hospitality" },
  { value: "E-commerce", label: "E-commerce" },
  { value: "Enterprise Services", label: "Enterprise Services" },
];

export default function DashboardPage() {
  const { storeId, outletId, dateRange } = useFinderContext();
  const range: Range = dateRange.preset === "today" ? "today" : dateRange.preset === "current_month" ? "30d" : "7d";

  const [progressRefresh, setProgressRefresh] = useState(0);
  // Local outlet filter drives report fetches (develop #166). Empty = All Outlets.
  const [selectedOutletId, setSelectedOutletId] = useState<string>(outletId);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    apiGet<{ items: { id: string; name: string }[] }>("/api/v1/outlets")
      .then((d) => setOutlets(d.items ?? []))
      .catch(() => setOutlets([]));
  }, []);

  const scope = new URLSearchParams({
    store_id: storeId,
    ...(selectedOutletId ? { outlet_id: selectedOutletId } : {}),
  }).toString();

  const fetchSummary = useCallback(
    () => apiGet<SummaryResponse>(`/api/v1/reports/summary?range=${range}&${scope}`),
    [range, scope],
  );
  const fetchValuation = useCallback(() => apiGet<Valuation>(`/api/v1/reports/inventory-valuation`), []);
  const fetchCash = useCallback(() => {
    const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
    const from = Date.now() - days * 24 * 60 * 60 * 1000;
    return apiGet<CashMovementResponse>(`/api/v1/reports/cash-movement?limit=500&from=${from}`);
  }, [range]);
  const fetchPOs = useCallback(() => apiGet<POListResponse>(`/api/v1/purchasing/orders?limit=200`), []);
  const fetchLowStock = useCallback(
    () => apiGet<InventoryLevelsResponse>(`/api/v1/inventory/levels?lowStock=true&pageSize=10`),
    [],
  );
  const fetchReorder = useCallback(() => apiGet<{ items: unknown[] }>(`/api/v1/inventory/reorder-suggestions`), []);
  const fetchExpiry = useCallback(() => apiGet<ExpirySummaryResponse>(`/api/v1/inventory/expiry-summary`), []);
  const fetchLocations = useCallback(() => apiGet<{ items: unknown[] }>(`/api/v1/inventory/locations`), []);
  const fetchNotifs = useCallback(() => apiGet<{ items: DashNotification[] }>("/api/v1/notifications?limit=10"), []);
  const fetchRecommendations = useCallback(
    () => apiGet<RecommendationReport>("/api/v1/reports/recommendations?recentDays=30"),
    [],
  );
  const fetchTopProducts = useCallback(
    () => apiGet<{ items: unknown[] }>(`/api/v1/reports/top-products?range=${range}&limit=5&${scope}`),
    [range, scope],
  );
  const fetchTopCustomers = useCallback(
    () => apiGet<{ items: unknown[] }>(`/api/v1/reports/sales-by-customer?range=${range}&${scope}`),
    [range, scope],
  );

  const { data: summary, loading: loadingSummary } = useQuery(`dashboard:summary:${range}:${scope}`, fetchSummary, {
    staleMs: 60_000,
  });
  const { data: valuation, loading: loadingVal } = useQuery(`dashboard:valuation`, fetchValuation, { staleMs: 60_000 });
  const { data: cash, loading: loadingCash } = useQuery(`dashboard:cash:${range}`, fetchCash, { staleMs: 60_000 });
  const { data: pos, loading: loadingPOs } = useQuery(`dashboard:pos`, fetchPOs, { staleMs: 60_000 });
  const { data: lowStockData } = useQuery(`dashboard:lowStock`, fetchLowStock, { staleMs: 60_000 });
  const { data: reorderData } = useQuery(`dashboard:reorder`, fetchReorder, { staleMs: 60_000 });
  const { data: expiryData } = useQuery(`dashboard:expiry`, fetchExpiry, { staleMs: 60_000 });
  const { data: locationsData } = useQuery(`dashboard:locations`, fetchLocations, { staleMs: 60_000 });
  const { data: notifsData } = useQuery(`dashboard:notifs`, fetchNotifs, { staleMs: 60_000 });
  const {
    data: recData,
    loading: loadingRecs,
    error: recError,
  } = useQuery("dashboard:recommendations:30d", fetchRecommendations, { staleMs: 60_000 });
  const { data: topProductsData } = useQuery(`dashboard:top-products:${range}:${scope}`, fetchTopProducts, {
    staleMs: 60_000,
  });
  const { data: topCustomersData } = useQuery(`dashboard:top-customers:${range}:${scope}`, fetchTopCustomers, {
    staleMs: 60_000,
  });

  useRealtimeStream(
    useCallback(
      (event) => {
        if (event.type === "order_created" || event.type === "payment_captured") {
          invalidateQuery(`dashboard:summary:${range}:${scope}`);
          invalidateQuery("dashboard:recommendations:30d");
          invalidateQuery(`dashboard:cash:${range}`);
          invalidateQuery(`dashboard:pl:${range}:${scope}`);
          invalidateQuery(`dashboard:executive-trend:30d:${scope}`);
          invalidateQuery(`dashboard:ar-aging:${scope}`);
          invalidateQuery(`dashboard:ap-aging:${scope}`);
          invalidateQuery(`dashboard:vendor-sales:${range}:${scope}`);
        }
      },
      [range, scope],
    ),
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

  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  const cashFlowCents = num(cash?.netCents);
  const openPOs = (pos?.items ?? []).filter((po) => po.status === "ordered" || po.status === "partially_received").length;

  const inventoryStats = {
    warehouses: (locationsData?.items ?? []).length,
    skus: num(valuation?.total),
    lowStock: (lowStockData?.items ?? []).length,
    expiringSoon: num(expiryData?.expiringSoon?.lots),
  };

  const { data: businessProfile } = useQuery(
    "settings:business-profile",
    () => apiGet<{ businessType?: string }>("/api/v1/settings/business-profile"),
    { staleMs: Infinity },
  );

  const VALID_INDUSTRIES: Industry[] = [
    "Retail",
    "Wholesale",
    "Distribution",
    "Manufacturing",
    "Healthcare",
    "Hospitality",
    "E-commerce",
    "Enterprise Services",
  ];
  const VALID_VIEWS: DashboardView[] = ["Executive", "Operations", "Finance", "Store"];

  const [industry, setIndustry] = useState<Industry>(() => {
    if (typeof window === "undefined") return "Retail";
    const stored = localStorage.getItem("ascend_dashboard_industry");
    return VALID_INDUSTRIES.find((v) => v === stored) ?? "Retail";
  });
  useEffect(() => {
    if (!VALID_INDUSTRIES.includes(localStorage.getItem("ascend_dashboard_industry") as Industry) && businessProfile?.businessType) {
      const mapped = VALID_INDUSTRIES.find((v) => v.toLowerCase() === businessProfile.businessType?.toLowerCase());
      if (mapped) setIndustry(mapped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessProfile?.businessType]);

  const [view, setView] = useState<DashboardView>(() => {
    if (typeof window === "undefined") return "Executive";
    const stored = localStorage.getItem("ascend_dashboard_view");
    const valid = VALID_VIEWS.find((v) => v === stored);
    if (valid) return valid;
    // getUser() reads an in-memory profile that is empty on every page reload
    // until the async silentRefresh() resolves, so this initializer used to see
    // null and fall back to "owner" — putting every user, cashiers included,
    // into the Executive view. getStoredUser() reads the profile setSession()
    // persists to sessionStorage, so the role is known synchronously here.
    // The remaining fallback is least-privileged, not most.
    const role = (getUser() ?? getStoredUser())?.role ?? "cashier";
    if (role === "cashier") return "Store";
    if (role === "manager") return "Operations";
    return "Executive";
  });

  // Executive and Finance are built on manager+ report endpoints (p-l, ar/ap-aging,
  // sales-by-vendor, inventory-valuation). Offering a cashier those tabs would only
  // render a wall of zeros behind 403s, so the toggle shows what the role can load.
  // This is presentation, not enforcement — the guard is server-side in
  // src/modules/reports/routes.ts.
  const availableViews: DashboardView[] =
    ((getUser() ?? getStoredUser())?.role ?? "cashier") === "cashier"
      ? ["Store"]
      : ["Executive", "Operations", "Finance", "Store"];

  const handleSetIndustry = (val: Industry) => {
    setIndustry(val);
    localStorage.setItem("ascend_dashboard_industry", val);
  };
  const handleSetView = (val: DashboardView) => {
    setView(val);
    localStorage.setItem("ascend_dashboard_view", val);
  };

  const topProducts = (topProductsData?.items ?? []) as Array<{
    name: string;
    sku?: string;
    revenue?: number;
    revenueCents?: number;
    qty?: number;
    units?: number;
  }>;
  const topCustomers = (topCustomersData?.items ?? []) as Array<{
    name: string;
    totalCents?: number;
    revenueCents?: number;
    orderCount?: number;
    units?: number;
  }>;

  const S_HERO = <DashboardHero key="hero" />;
  const S_KPI = (
    <DashboardOverview
      key="kpi"
      summary={summary}
      loadingSummary={loadingSummary}
      inventoryValueCents={num(valuation?.totalCostCents)}
      loadingValuation={loadingVal}
      cashFlowCents={cashFlowCents}
      loadingCash={loadingCash}
      openPOs={openPOs}
      loadingPOs={loadingPOs}
      recommendationCount={recData?.summary?.total ?? 0}
      industry={industry}
      view={view}
    />
  );
  const S_EXEC = <DashboardExecutive key="executive" range={range} scope={scope} topCustomers={topCustomers} />;
  const S_RECS = (
    <DashboardPrioritiesPanel
      key="recs"
      report={recData}
      loading={loadingRecs}
      onTrackTask={onTrackRecommendation}
      reorderCount={(reorderData?.items ?? []).length}
      error={recError}
    />
  );
  const S_PIPELINE = <DashboardPipeline key="pipeline" />;
  const S_TIMELINE = <DashboardTimeline key="timeline" notifs={notifsData?.items ?? []} />;
  const S_CHARTS = <DashboardCharts key="charts" range={range} scope={scope} />;
  const S_TOP = <DashboardTopPerformers key="top" topProducts={topProducts} topCustomers={topCustomers} />;
  const S_QA = <DashboardQuickActions key="qa" />;
  const S_OPS = <DashboardOpsHub key="ops" inventoryStats={inventoryStats} industry={industry} view={view} />;
  const S_PROG = <ProgressPanel key="prog" refreshSignal={progressRefresh} />;
  const S_BRIEF = <AiCommandCenterBanner key="briefing" />;

  const layouts: Record<DashboardView, { top: ReactNode[]; main: ReactNode[]; side: ReactNode[] }> = {
    Executive: {
      top: [S_HERO],
      main: [S_KPI, S_EXEC, S_PIPELINE, S_CHARTS, S_TOP, S_OPS],
      side: [S_BRIEF, S_RECS, S_TIMELINE, S_PROG],
    },
    Operations: {
      top: [S_QA],
      main: [S_KPI, S_OPS, S_PIPELINE, S_CHARTS, S_TOP],
      side: [S_BRIEF, S_RECS, S_TIMELINE, S_PROG],
    },
    Finance: {
      top: [],
      main: [S_EXEC, S_KPI, S_CHARTS, S_TOP, S_OPS],
      side: [S_BRIEF, S_RECS, S_TIMELINE, S_PROG],
    },
    Store: {
      top: [S_QA],
      main: [S_KPI, S_CHARTS, S_TOP, S_OPS],
      side: [S_TIMELINE, S_PROG],
    },
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
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-sm" role="group" aria-label="Dashboard view">
            {availableViews.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => handleSetView(v)}
                className={`min-h-touch rounded-md px-4 py-2 text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  view === v
                    ? "bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] shadow-sm ring-1 ring-[var(--color-border)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {outlets.length > 0 && (
              <Select
                aria-label="Filter by outlet"
                value={selectedOutletId}
                onChange={(e) => setSelectedOutletId(e.target.value)}
                options={[{ value: "", label: "All Outlets" }, ...outlets.map((o) => ({ value: o.id, label: o.name }))]}
                size="md"
                className="min-w-[160px]"
              />
            )}
            <span className="text-[12px] font-medium text-[var(--color-text-secondary)]" id="industry-focus-label">
              Industry focus:
            </span>
            <Select
              aria-labelledby="industry-focus-label"
              value={industry}
              onChange={(e) => handleSetIndustry(e.target.value as Industry)}
              options={INDUSTRY_OPTIONS}
              size="md"
              className="min-w-[180px]"
            />
          </div>
        </div>

        <RetailSetupChecklist />

        <div className="space-y-6">{currentLayout.top}</div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">{currentLayout.main}</div>
          <div className="space-y-6">{currentLayout.side}</div>
        </div>
      </div>
    </EnterpriseShell>
  );
}
