"use client";
import { useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { UploadTab } from "./_components/UploadTab";
import { QueueTab } from "./_components/QueueTab";
import { HistoryTab } from "./_components/HistoryTab";

type Tab = "upload" | "queue" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "upload",  label: "Upload" },
  { key: "queue",   label: "Queue & Validate" },
  { key: "history", label: "History" },
];

export default function EdiImportsPage() {
  const [tab, setTab] = useState<Tab>("queue");
  const [refreshKey, setRefreshKey] = useState(0);

  function handleUploaded() {
    setTab("queue");
    setRefreshKey((k) => k + 1);
  }

  return (
    <EnterpriseShell
      active="edi-imports"
      title="EDI Imports"
      subtitle="Upload, validate, and process supplier EDI files into purchase orders"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6">
        {/* Tab bar */}
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex gap-1" aria-label="EDI tabs">
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
          {tab === "upload"  && <UploadTab onUploaded={handleUploaded} />}
          {tab === "queue"   && <QueueTab refreshKey={refreshKey} />}
          {tab === "history" && <HistoryTab />}
        </div>
      </div>
    </EnterpriseShell>
  );
}
