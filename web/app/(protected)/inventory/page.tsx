"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@/lib/useQuery";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { InventoryLevelsResponse } from "@/api-client/types";
import { Metric, TabButton } from "./_components/ui";
import { LedgerTab } from "./_components/LedgerTab";
import { CatalogTab } from "./_components/CatalogTab";
import { toInventoryRow } from "./_components/shared";

type ActiveTab = "ledger" | "catalog";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("ledger");

  const { data: ledgerData, loading: ledgerLoading, error: ledgerError, invalidate: invalidateLedger } =
    useQuery("inventory:levels", () => apiGet<InventoryLevelsResponse>("/api/v1/inventory/levels?pageSize=200"), { staleMs: 30_000 });

  const rows = useMemo(
    () => (ledgerData?.items ?? []).map(toInventoryRow),
    [ledgerData],
  );

  const metrics = useMemo(() => {
    const active = rows.filter((r) => r.productStatus === "active").length;
    const low    = rows.filter((r) => r.stockStatus === "Reorder").length;
    const watch  = rows.filter((r) => r.stockStatus === "Watch").length;
    const value  = rows.reduce((sum, r) => sum + r.onHand * (r.costCents ?? 0), 0);
    return { active, low, watch, value };
  }, [rows]);

  return (
    <EnterpriseShell
      active="inventory"
      title="Inventory"
      subtitle={`Stock control · Demo Store · ${rows.length || "-"} tracked SKUs`}
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Metric label="Active products" value={String(metrics.active)} detail="sellable catalog items" />
          <Metric label="Low stock" value={String(metrics.low)} detail={`${metrics.watch} watch items`} tone="warning" />
          <Metric label="Inventory value" value={formatMoney(metrics.value)} detail="using tracked cost" />
        </div>

        <div className="flex gap-1 border-b border-slate-200">
          <TabButton active={activeTab === "ledger"} onClick={() => setActiveTab("ledger")}>
            Stock ledger
          </TabButton>
          <TabButton active={activeTab === "catalog"} onClick={() => setActiveTab("catalog")}>
            Catalog
          </TabButton>
        </div>

        {activeTab === "ledger" && (
          <LedgerTab
            rows={rows}
            loading={ledgerLoading}
            error={ledgerError}
            invalidateLedger={invalidateLedger}
          />
        )}

        {activeTab === "catalog" && <CatalogTab />}
      </div>
    </EnterpriseShell>
  );
}
