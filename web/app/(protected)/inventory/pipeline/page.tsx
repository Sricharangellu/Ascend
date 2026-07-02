"use client";
import { useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { PipelineOverviewTab } from "./_components/PipelineOverviewTab";
import { PendingTab } from "./_components/PendingTab";
import { ReceivingTab } from "./_components/ReceivingTab";
import { ReorderAlertsTab } from "./_components/ReorderAlertsTab";
import { IssuesTab } from "./_components/IssuesTab";
import { HistoryTab } from "./_components/HistoryTab";

type Tab = "overview" | "pending" | "receiving" | "reorder" | "issues" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview",  label: "Pipeline" },
  { key: "pending",   label: "Pending" },
  { key: "receiving", label: "Receiving" },
  { key: "reorder",   label: "Reorder Alerts" },
  { key: "issues",    label: "Issues" },
  { key: "history",   label: "History" },
];

export default function InventoryPipelinePage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <EnterpriseShell
      active="inventory-pipeline"
      title="Inventory Pipeline"
      subtitle="Track purchase orders from reorder through receiving and billing"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {/* Tab bar */}
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Pipeline tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
                ].join(" ")}
                aria-selected={tab === t.key}
                role="tab"
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div>
          {tab === "overview"  && <PipelineOverviewTab />}
          {tab === "pending"   && <PendingTab />}
          {tab === "receiving" && <ReceivingTab />}
          {tab === "reorder"   && <ReorderAlertsTab />}
          {tab === "issues"    && <IssuesTab />}
          {tab === "history"   && <HistoryTab />}
        </div>
      </div>
    </EnterpriseShell>
  );
}
