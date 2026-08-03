"use client";

import { useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { getUser } from "@/lib/auth";
import { ScheduledReportsTab } from "./_components/ScheduledReportsTab";
import { ForecastingTab } from "./_components/ForecastingTab";

type Tab = "reports" | "forecasting";

export default function InsightsPage() {
  const user = getUser();
  const role = user?.role ?? "cashier";
  const isOwner = role === "owner";
  const allowed = role === "owner" || role === "manager";
  const [tab, setTab] = useState<Tab>("reports");

  return (
    <EnterpriseShell
      active="insights"
      title="Insights"
      subtitle="Scheduled reports and inventory forecasting"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {!allowed ? (
          <Card>
            <p role="alert" className="text-sm text-slate-700">
              You don&apos;t have access to Insights. Ask an owner or manager.
            </p>
          </Card>
        ) : (
          <>
            <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit shadow-sm">
              {([ ["reports", "Scheduled Reports"], ["forecasting", "Forecasting"] ] as [Tab, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`min-h-[36px] rounded px-4 text-sm font-medium transition-colors ${
                    tab === key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "reports" && <ScheduledReportsTab isOwner={isOwner} />}
            {tab === "forecasting" && <ForecastingTab />}
          </>
        )}
      </div>
    </EnterpriseShell>
  );
}
