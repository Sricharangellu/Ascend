"use client";
import { useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Badge } from "@/components/Badge";
import { PipelineOverviewTab } from "./_components/PipelineOverviewTab";
import { PendingTab } from "./_components/PendingTab";
import { ReceivingTab } from "./_components/ReceivingTab";
import { ReorderAlertsTab } from "./_components/ReorderAlertsTab";
import { IssuesTab } from "./_components/IssuesTab";
import { HistoryTab } from "./_components/HistoryTab";

type Tab = "overview" | "pending" | "receiving" | "reorder" | "issues" | "history";

// `mock: true` tabs call endpoints that only exist in the MSW mock layer
// (web/mocks/mockHandlers.ts) — there is no backend route for them anywhere
// in src/modules/inventory/. Pending, Reorder Alerts, and History are real
// (src/modules/inventory/pipeline-routes.ts, covered by pipeline-views.test.ts).
// Badged rather than hidden — see Ponytail Phase H/I audits — because hiding
// the whole /inventory/pipeline route would take the 3 real tabs down with it.
const TABS: { key: Tab; label: string; mock?: boolean }[] = [
  { key: "overview",  label: "Pipeline",       mock: true },
  { key: "pending",   label: "Pending" },
  { key: "receiving", label: "Receiving",      mock: true },
  { key: "reorder",   label: "Reorder Alerts" },
  { key: "issues",    label: "Issues",         mock: true },
  { key: "history",   label: "History" },
];

export default function InventoryPipelinePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const activeTab = TABS.find((t) => t.key === tab);

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
                  "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
                ].join(" ")}
                aria-selected={tab === t.key}
                role="tab"
              >
                {t.label}
                {t.mock && (
                  <Badge variant="gray" outlined size="sm">Preview</Badge>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Preview notice — this tab's data comes from the mock layer only;
            there is no backend route behind it yet. */}
        {activeTab?.mock && (
          <div
            role="status"
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500"
          >
            Preview — this tab shows sample data. It isn&apos;t backed by a live API yet.
          </div>
        )}

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
