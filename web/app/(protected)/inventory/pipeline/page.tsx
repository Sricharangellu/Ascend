"use client";

/**
 * Inventory Pipeline — PO status workbench.
 *
 * Real backend (pipeline-views): pending, history, reorder-alerts.
 * Overview / receiving / issues hit allowlisted/missing routes and only work
 * under MSW — gated behind NEXT_PUBLIC_SHOW_PARTIAL_PAGES (Ponytail Wave 0).
 */

import { useEffect, useMemo, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { PipelineOverviewTab } from "./_components/PipelineOverviewTab";
import { PendingTab } from "./_components/PendingTab";
import { ReceivingTab } from "./_components/ReceivingTab";
import { ReorderAlertsTab } from "./_components/ReorderAlertsTab";
import { IssuesTab } from "./_components/IssuesTab";
import { HistoryTab } from "./_components/HistoryTab";

type Tab = "overview" | "pending" | "receiving" | "reorder" | "issues" | "history";

const SHOW_PARTIAL = process.env["NEXT_PUBLIC_SHOW_PARTIAL_PAGES"] === "true";

const ALL_TABS: { key: Tab; label: string; partial?: boolean }[] = [
  { key: "overview", label: "Pipeline", partial: true },
  { key: "pending", label: "Pending" },
  { key: "receiving", label: "Receiving", partial: true },
  { key: "reorder", label: "Reorder Alerts" },
  { key: "issues", label: "Issues", partial: true },
  { key: "history", label: "History" },
];

export default function InventoryPipelinePage() {
  const tabs = useMemo(
    () => ALL_TABS.filter((t) => !t.partial || SHOW_PARTIAL),
    [],
  );
  const defaultTab = (tabs[0]?.key ?? "pending") as Tab;
  const [tab, setTab] = useState<Tab>(defaultTab);

  // If partial tabs are hidden and state still points at one, snap to a real tab.
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) {
      setTab(defaultTab);
    }
  }, [tabs, tab, defaultTab]);

  return (
    <EnterpriseShell
      active="inventory-pipeline"
      title="Inventory Pipeline"
      subtitle="Track purchase orders from reorder through receiving"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {!SHOW_PARTIAL && (
          <div
            className="rounded-lg border border-warning-100 bg-warning-50 px-3 py-2 text-xs text-warning-700"
            role="status"
          >
            Showing live PO tabs only (Pending, Reorder Alerts, History). Overview,
            Receiving, and Issues need backends that are not built yet — use{" "}
            <a href="/inventory/receive-stock" className="font-medium underline underline-offset-2">
              Receive Stock
            </a>{" "}
            for receiving.
          </div>
        )}

        <div className="border-b border-erp-table-border">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Pipeline tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
                  tab === t.key
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-erp-text-secondary hover:border-erp-table-border hover:text-erp-text-primary",
                ].join(" ")}
                aria-selected={tab === t.key}
                role="tab"
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div>
          {tab === "overview" && SHOW_PARTIAL && <PipelineOverviewTab />}
          {tab === "pending" && <PendingTab />}
          {tab === "receiving" && SHOW_PARTIAL && <ReceivingTab />}
          {tab === "reorder" && <ReorderAlertsTab />}
          {tab === "issues" && SHOW_PARTIAL && <IssuesTab />}
          {tab === "history" && <HistoryTab />}
        </div>
      </div>
    </EnterpriseShell>
  );
}
