"use client";

/**
 * /reports — tenant sales dashboard. Owner/manager only (cashiers are blocked).
 * Fetches GET /api/v1/reports/summary and renders the KPI dashboard.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import type { SalesSummary, TopProduct, TopProductsResponse } from "@/api-client/types";
import { getUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";
import { ReportsSubNav } from "@/components/reports/ReportsSubNav";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EnterpriseShell } from "@/components/EnterpriseShell";

export default function ReportsPage() {
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"today" | "7d" | "30d">("today");

  const [showSchedule, setShowSchedule] = useState(false);
  const [schedEmail, setSchedEmail] = useState("");
  const [schedFreq, setSchedFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [scheduling, setScheduling] = useState(false);
  const [schedMsg, setSchedMsg] = useState<string | null>(null);

  const role = getUser()?.role ?? "cashier";
  const allowed = role === "owner" || role === "manager";

  const exportCsv = () => {
    if (!summary) return;
    const rows = [
      ["Metric", "Value"],
      ["Gross Revenue", String(summary.revenue?.grossCents ?? 0)],
      ["Net Revenue", String(summary.revenue?.netCents ?? 0)],
      ["Tax", String(summary.revenue?.taxCents ?? 0)],
      ["Total Orders", String(summary.orders?.total ?? 0)],
      ["Completed Orders", String(summary.orders?.completed ?? 0)],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scheduleReport = async () => {
    if (!schedEmail.trim()) return;
    setScheduling(true); setSchedMsg(null);
    try {
      await apiPost("/api/v1/insights/scheduled-reports", { email: schedEmail.trim(), frequency: schedFreq, range });
      setSchedMsg(`Scheduled ${schedFreq} report to ${schedEmail.trim()}`);
      setSchedEmail("");
    } catch { setSchedMsg("Could not schedule report."); }
    finally { setScheduling(false); }
  };

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [summaryData, topProductData] = await Promise.all([
          apiGet<SalesSummary>(`/api/v1/reports/summary?range=${range}`),
          apiGet<TopProductsResponse>(`/api/v1/reports/top-products?range=${range}&limit=4`),
        ]);
        if (!cancelled) {
          setSummary(summaryData);
          setTopProducts(topProductData.items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiResponseError ? err.message : "Failed to load report.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, range]);

  return (
    <EnterpriseShell
      active="reports"
      title="Reports"
      subtitle={`Sales performance · Demo Store · ${range === "today" ? "Today" : range === "7d" ? "Last 7 days" : "Last 30 days"}`}
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {/* Sub-report navigation */}
        {allowed && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h1 className="text-lg font-semibold text-slate-950">Reporting center</h1>
              <p className="mt-1 text-sm text-slate-500">
                Operational reporting across sales, inventory, and receivables.
              </p>
            </div>
            <ReportsSubNav />
          </div>
        )}
        {/* Quick links to sub-reports */}
        {allowed && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/reports/end-of-day"
              className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 group-hover:bg-blue-100">
                <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">End of Day</p>
                <p className="text-xs text-slate-500">Z-report · shift summary</p>
              </div>
            </Link>
          </div>
        )}

        {allowed && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 shadow-sm">
              {(["today", "7d", "30d"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRange(item)}
                  className={`min-h-[38px] rounded px-4 text-sm font-medium transition-colors ${
                    range === item ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {item === "today" ? "Today" : item === "7d" ? "7 days" : "30 days"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={!summary} onClick={exportCsv}>
                Export CSV
              </Button>
              <Button variant="primary" size="sm" onClick={() => { setShowSchedule(v => !v); setSchedMsg(null); }}>
                Schedule report
              </Button>
            </div>
          </div>
        )}

        {!allowed ? (
          <Card>
            <p role="alert" className="text-sm text-slate-700">
              You don&apos;t have access to reports. Ask an owner or manager.
            </p>
          </Card>
        ) : loading ? (
          <p className="text-sm text-slate-500" aria-busy="true">
            Loading…
          </p>
        ) : error ? (
          <Card>
            <p role="alert" className="text-sm text-danger-700">
              {error}
            </p>
          </Card>
        ) : summary ? (
          <ReportsDashboard summary={summary} topProducts={topProducts} />
        ) : null}

        {/* Schedule report inline panel */}
        {allowed && showSchedule && (
          <Card>
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Schedule recurring report</h2>
            {schedMsg && <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2 mb-3">{schedMsg}</p>}
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                <input
                  type="email"
                  value={schedEmail}
                  onChange={e => setSchedEmail(e.target.value)}
                  placeholder="owner@company.com"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none w-56"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Frequency</label>
                <select value={schedFreq} onChange={e => setSchedFreq(e.target.value as "daily" | "weekly" | "monthly")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <Button size="sm" variant="primary" loading={scheduling} disabled={!schedEmail.trim()} onClick={() => void scheduleReport()}>
                Schedule
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowSchedule(false)}>Cancel</Button>
            </div>
          </Card>
        )}
      </div>
    </EnterpriseShell>
  );
}
