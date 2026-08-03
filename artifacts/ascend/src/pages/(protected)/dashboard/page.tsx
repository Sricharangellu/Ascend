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
import ProgressPanel from "./_components/ProgressPanel";
import { BackupHealthCard } from "./_components/BackupHealthCard";

import type { RecommendationReport, DashboardRecommendation } from "./_components/DashboardAiCommandCenter";

const SIGNAL_TO_VERIFICATION: Record<string, string> = {
  no_products: "retail.first_product",
  products_without_cost: "retail.cost_prices_complete",
  out_of_stock: "retail.first_receiving",
  low_stock: "retail.first_receiving",
  no_sales_yet: "retail.first_sale",
  uncategorized_expenses: "retail.expenses_categorized",
};

export type Range = "today" | "7d" | "30d";

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

  return (
    <EnterpriseShell
      active="dashboard"
      title="Dashboard"
      subtitle="Enterprise Command Center"
      contentClassName="overflow-y-auto bg-[var(--color-page-bg)]"
    >
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        
        {/* Retail Setup Checklist Banner (auto-hides when complete) */}
        <RetailSetupChecklist />

        {/* Hero Section */}
        <DashboardHero />

        {/* Quick Actions Strip */}
        <DashboardQuickActions />

        {/* Live Business Overview (KPIs) */}
        <DashboardOverview
          summary={summary}
          loadingSummary={loadingSummary}
          inventoryValueCents={num(valuation?.totalCostCents)}
          loadingValuation={loadingVal}
          cashFlowCents={cashFlowCents}
          loadingCash={loadingCash}
          openPOs={openPOs}
          loadingPOs={loadingPOs}
          activeUsers={activeUsers}
          recommendationCount={recData?.summary?.total ?? 0}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-6">
            {/* Enterprise Workflow Pipeline */}
            <DashboardPipeline />

            {/* Business Operations Hub */}
            <DashboardOpsHub inventoryStats={inventoryStats} />

            {/* Performance Analytics (Charts) */}
            <DashboardCharts range={range} scope={scope} />

            {/* Top Performers */}
            <DashboardTopPerformers 
              topProducts={topProductsData?.items ?? []} 
              topCustomers={topCustomersData?.items ?? []} 
            />
          </div>

          <div className="space-y-6">
            {/* AI Command Center Briefing */}
            <DashboardAiCommandCenter
              report={recData}
              loading={loadingRecs}
              onTrackTask={onTrackRecommendation}
              reorderCount={(reorderData?.items ?? []).length}
            />

            {/* Activity Timeline */}
            <DashboardTimeline notifs={notifsData?.items ?? []} />

            {/* Progress Panel */}
            <ProgressPanel refreshSignal={progressRefresh} />

            {/* Backup Health */}
            <BackupHealthCard />
          </div>
        </div>

      </div>
    </EnterpriseShell>
  );
}
