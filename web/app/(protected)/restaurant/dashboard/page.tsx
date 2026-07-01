"use client";

/**
 * FE-R4: Restaurant Dashboard — F&B KPI overlay.
 * Module-gated by module:tables. Shows covers, avg ticket, table turns,
 * peak hour, revenue, top items, hourly bar chart, and active sessions.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtTime } from "@/lib/date";
import { useModuleFlags } from "@/hooks/useModuleFlags";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RestaurantKpis {
  covers_today: number;
  avg_ticket_cents: number;
  table_turns_today: number;
  peak_hour: string;
  open_tables: number;
  total_tables: number;
  revenue_today_cents: number;
}

interface TopItem {
  name: string;
  qty_sold: number;
  revenue_cents: number;
}

interface HourlyBucket {
  hour: string;
  label: string;
  revenue_cents: number;
}

interface ActiveSession {
  table_number: string;
  floor_section: string | null;
  party_size: number;
  elapsed_mins: number;
}

interface DashboardData {
  kpis: RestaurantKpis;
  top_items: TopItem[];
  hourly_revenue: HourlyBucket[];
  active_sessions: ActiveSession[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsedLabel(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function sessionTone(mins: number): string {
  if (mins > 90) return "text-red-600";
  if (mins > 60) return "text-amber-600";
  return "text-emerald-700";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "green" | "blue" | "purple";
}) {
  const accent =
    tone === "green"  ? "bg-emerald-50 text-emerald-700" :
    tone === "blue"   ? "bg-blue-50 text-blue-700" :
    tone === "purple" ? "bg-violet-50 text-violet-700" :
                        "bg-slate-100 text-slate-600";

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="text-2xl font-bold text-slate-950">{value}</span>
      {sub && (
        <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${accent}`}>
          {sub}
        </span>
      )}
    </div>
  );
}

function HourlyBarChart({ data }: { data: HourlyBucket[] }) {
  const max = Math.max(...data.map(d => d.revenue_cents), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map(d => {
        const pct = (d.revenue_cents / max) * 100;
        return (
          <div key={d.hour} className="group relative flex flex-1 flex-col items-center">
            <div
              className="w-full min-h-[2px] rounded-t bg-[#5D5FEF]"
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
            {/* Tooltip on hover */}
            <div className="pointer-events-none absolute bottom-full mb-1 hidden group-hover:flex whitespace-nowrap rounded bg-[#1a1a1a] px-2 py-1 text-[11px] text-white shadow-lg z-10">
              {d.label}: {formatMoney(d.revenue_cents)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HourlyLabels({ data }: { data: HourlyBucket[] }) {
  return (
    <div className="flex gap-1 mt-1">
      {data.map((d, i) => (
        <div key={d.hour} className="flex-1 text-center text-[9px] text-slate-400">
          {i % 3 === 0 ? d.label : ""}
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RestaurantDashboardPage() {
  const { enabled: enabledModules } = useModuleFlags();
  const tablesEnabled = enabledModules.has("tables") || enabledModules.has("*");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await apiGet<DashboardData>("/api/v1/restaurant/dashboard");
      setData(result);
      setLastRefreshed(Date.now());
    } catch {
      setError("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (!tablesEnabled) {
    return (
      <EnterpriseShell active="restaurant-dashboard" title="Restaurant Dashboard" subtitle="" contentClassName="overflow-y-auto">
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
          <p className="text-slate-500 text-sm">The Table Management module is not enabled.</p>
          <Link href="/setup/modules" className="text-sm font-medium text-[#5D5FEF] hover:underline">
            Enable it in Module Marketplace →
          </Link>
        </div>
      </EnterpriseShell>
    );
  }

  const kpis = data?.kpis;
  const topItems = data?.top_items ?? [];
  const hourly = data?.hourly_revenue ?? [];
  const sessions = data?.active_sessions ?? [];

  return (
    <EnterpriseShell
      active="restaurant-dashboard"
      title="Restaurant Dashboard"
      subtitle="Live F&B metrics — refreshes every 60 seconds"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">

        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-slate-950">Today's Overview</h1>
            {!loading && (
              <span className="text-xs text-slate-400">Updated {fmtTime(lastRefreshed)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/restaurant/floor-plan"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm">
              Floor Plan
            </Link>
            <Link href="/restaurant/kitchen"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm">
              Kitchen
            </Link>
            <Link href="/restaurant/tabs"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm">
              Bar Tabs
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-md bg-[#5D5FEF] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4a4cd4] disabled:opacity-50 shadow-sm"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* KPI cards */}
        {loading && !data ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <KpiCard
              label="Revenue Today"
              value={formatMoney(kpis?.revenue_today_cents ?? 0)}
              tone="green"
            />
            <KpiCard
              label="Covers Today"
              value={String(kpis?.covers_today ?? 0)}
              sub={`${kpis?.open_tables ?? 0} / ${kpis?.total_tables ?? 0} tables open`}
              tone="blue"
            />
            <KpiCard
              label="Avg Ticket"
              value={formatMoney(kpis?.avg_ticket_cents ?? 0)}
              tone="purple"
            />
            <KpiCard
              label="Table Turns"
              value={`${kpis?.table_turns_today?.toFixed(1) ?? "—"}×`}
              sub="turns today"
              tone="neutral"
            />
            <KpiCard
              label="Peak Hour"
              value={kpis?.peak_hour ?? "—"}
              tone="neutral"
            />
          </div>
        )}

        {/* Charts + tables row */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

          {/* Hourly revenue */}
          <Card className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-950">Revenue by Hour</h2>
              {hourly.length > 0 && (
                <span className="text-xs text-slate-400">
                  Peak: {hourly.reduce((m, d) => d.revenue_cents > m.revenue_cents ? d : m, hourly[0]!).label}
                </span>
              )}
            </div>
            {loading && !data ? (
              <div className="h-24 animate-pulse rounded bg-slate-100" />
            ) : hourly.length === 0 ? (
              <p className="text-sm text-slate-400">No data yet today.</p>
            ) : (
              <>
                <HourlyBarChart data={hourly} />
                <HourlyLabels data={hourly} />
              </>
            )}
          </Card>

          {/* Active sessions */}
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-950">Active Tables</h2>
              <Link href="/restaurant/floor-plan" className="text-xs text-[#5D5FEF] hover:underline">
                View all →
              </Link>
            </div>
            {loading && !data ? (
              <div className="divide-y divide-slate-100">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="h-8 w-8 animate-pulse rounded-md bg-slate-100" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
                      <div className="h-2.5 w-24 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No active tables</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {sessions.map(s => (
                  <div key={s.table_number} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#5D5FEF]/10 text-xs font-bold text-[#5D5FEF]">
                      {s.table_number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {s.floor_section ?? "Main"} · {s.party_size} {s.party_size === 1 ? "cover" : "covers"}
                      </p>
                      <p className={`text-xs font-medium ${sessionTone(s.elapsed_mins)}`}>
                        {elapsedLabel(s.elapsed_mins)} at table
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Top items */}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Top Selling Items Today</h2>
          </div>
          {loading && !data ? (
            <div className="divide-y divide-slate-100">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <div className="h-3 w-4 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 flex-1 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-12 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-[#FAFAFA] text-left text-xs font-semibold uppercase tracking-wider text-[#888]">
                  <th className="px-4 py-3 w-8">#</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Qty Sold</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5]">
                {topItems.map((item, i) => {
                  const totalRev = topItems.reduce((s, x) => s + x.revenue_cents, 0);
                  const pct = totalRev > 0 ? (item.revenue_cents / totalRev) * 100 : 0;
                  return (
                    <tr key={item.name} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{item.qty_sold}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatMoney(item.revenue_cents)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-[#5D5FEF]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

      </div>
    </EnterpriseShell>
  );
}
