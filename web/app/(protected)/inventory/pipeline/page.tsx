"use client";

/**
 * Inventory Pipeline — purchase-order funnel from reorder through receiving.
 *
 * Real backend tabs (pending / reorder alerts / history) are always available.
 * Overview / Receiving / Issues hit allowlisted, unbuilt endpoints (NEEDS-SRI
 * receiving sessions + issues engine + 9-stage funnel) — gated behind
 * NEXT_PUBLIC_SHOW_PARTIAL_PAGES so operators don't trust empty/false-live UIs.
 */

import { useMemo, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { PipelineOverviewTab } from "./_components/PipelineOverviewTab";
import { PendingTab } from "./_components/PendingTab";
import { ReceivingTab } from "./_components/ReceivingTab";
import { ReorderAlertsTab } from "./_components/ReorderAlertsTab";
import { IssuesTab } from "./_components/IssuesTab";
import { HistoryTab } from "./_components/HistoryTab";

type Tab = "overview" | "pending" | "receiving" | "reorder" | "issues" | "history";

const SHOW_PARTIAL_PAGES = process.env["NEXT_PUBLIC_SHOW_PARTIAL_PAGES"] === "true";

const TABS: { key: Tab; label: string; partial?: boolean }[] = [
  { key: "overview",  label: "Pipeline",       partial: true },
  { key: "pending",   label: "Pending" },
  { key: "receiving", label: "Receiving",      partial: true },
  { key: "reorder",   label: "Reorder Alerts" },
  { key: "issues",    label: "Issues",         partial: true },
  { key: "history",   label: "History" },
];

export default function InventoryPipelinePage() {
  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.partial || SHOW_PARTIAL_PAGES),
    [],
  );
  const defaultTab = visibleTabs[0]?.key ?? "pending";
  const [tab, setTab] = useState<Tab>(defaultTab);
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : defaultTab;

  return (
    <EnterpriseShell
      active="inventory-pipeline"
      title="Inventory Pipeline"
      subtitle="Track purchase orders from reorder through receiving and billing"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="border-b border-erp-table-border">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Pipeline tabs">
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  activeTab === t.key
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-erp-text-secondary hover:border-erp-table-border hover:text-erp-text-primary",
                ].join(" ")}
                aria-selected={activeTab === t.key}
                role="tab"
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div>
          {activeTab === "overview"  && <PipelineOverviewTab />}
          {activeTab === "pending"   && <PendingTab />}
          {activeTab === "receiving" && <ReceivingTab />}
          {activeTab === "reorder"   && <ReorderAlertsTab />}
          {activeTab === "issues"    && <IssuesTab />}
          {activeTab === "history"   && <HistoryTab />}
        </div>
      </div>
    </EnterpriseShell>
  );
}
