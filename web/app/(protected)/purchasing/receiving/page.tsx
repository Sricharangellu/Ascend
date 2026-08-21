"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { KpiCard } from "@/components/KpiCard";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";

interface DashboardSummary {
  generated_at: number;
  todays_receipts: number;
  todays_units_received: number;
  pending_receipts: number;
  late_pos: number;
  active_sessions: number;
  quality_holds: number;
  quality_hold_units: number;
  invoices_pending: number;
  bills_open: number;
  near_expiry_lots: number;
  expired_lots: number;
  receiving_errors_today: number;
  avg_receiving_time_ms: number | null;
  receiving_accuracy_pct: number | null;
  receiving_trend: Array<{ day: string; receipts: number }>;
  ai_suggestions: { status: string };
}

interface SessionLine {
  id: string;
  product_name?: string | null;
  sku?: string | null;
  expected_qty: number;
  accepted_qty: number;
  held_qty: number;
  rejected_qty: number;
  status: string;
  unit_cost_cents?: number | null;
}

interface Session {
  id: string;
  session_number: string;
  status: string;
  po_id: string;
  po_number?: number | null;
  supplier_name?: string | null;
  dock_code?: string | null;
  receiver_name?: string | null;
  started_at: number;
  lines: SessionLine[];
}

function elapsed(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function ReceivingHubPage() {
  const [dash, setDash] = useState<DashboardSummary | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, s] = await Promise.all([
        apiGet<DashboardSummary>("/api/v1/purchasing/receiving/dashboard"),
        apiGet<{ items: Session[] }>("/api/v1/purchasing/receiving/sessions"),
      ]);
      setDash(d);
      setSessions(s.items ?? []);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load receiving hub.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const closeSession = async (id: string) => {
    setClosingId(id);
    try {
      await apiPost(`/api/v1/purchasing/receiving/sessions/${id}/close`, {});
      await load();
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Could not close session.");
    } finally {
      setClosingId(null);
    }
  };

  return (
    <EnterpriseShell
      active="purchasing"
      title="Receiving Hub"
      subtitle="Dock arrivals, active sessions, quality holds, and invoice match pressure"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-erp-text-secondary">
            Scanner-first receiving with price intelligence, lot/expiry validation, and three-way match gates.
          </p>
          <div className="flex gap-2">
            <Link href="/inventory/receive-stock">
              <Button variant="primary" size="sm">Open receive desk</Button>
            </Link>
            <Link href="/inventory/pipeline">
              <Button variant="secondary" size="sm">Pipeline</Button>
            </Link>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </p>
        )}

        {loading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        )}

        {!loading && dash && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Today's receipts"
              value={dash.todays_receipts}
              tone="blue"
              trend={{ value: dash.todays_units_received, label: "units" }}
              sparkline={dash.receiving_trend.map((t) => ({ value: t.receipts }))}
            />
            <KpiCard
              title="Pending POs"
              value={dash.pending_receipts}
              tone={dash.late_pos > 0 ? "amber" : "neutral"}
              trend={{ value: dash.late_pos, label: "late >7d" }}
            />
            <KpiCard
              title="Active sessions"
              value={dash.active_sessions}
              tone="green"
              trend={{ value: dash.quality_holds, label: "quality holds" }}
            />
            <KpiCard
              title="Invoices pending"
              value={dash.invoices_pending}
              tone="amber"
              trend={{ value: dash.bills_open, label: "open bills" }}
            />
            <KpiCard
              title="Near expiry lots"
              value={dash.near_expiry_lots}
              tone={dash.expired_lots > 0 ? "red" : "amber"}
              trend={{ value: dash.expired_lots, label: "expired" }}
            />
            <KpiCard
              title="Scan errors today"
              value={dash.receiving_errors_today}
              tone={dash.receiving_errors_today > 0 ? "red" : "neutral"}
            />
            <KpiCard
              title="Receiving accuracy"
              value={dash.receiving_accuracy_pct != null ? `${dash.receiving_accuracy_pct}%` : "—"}
              tone="green"
            />
            <KpiCard
              title="Avg receive time"
              value={dash.avg_receiving_time_ms != null ? `${Math.round(dash.avg_receiving_time_ms / 60000)}m` : "—"}
              tone="neutral"
            />
          </div>
        )}

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-erp-text-primary">Active receiving sessions</h2>
            <Badge variant="gray">{sessions.length}</Badge>
          </div>

          {loading && <Skeleton className="h-32" />}
          {!loading && sessions.length === 0 && (
            <EmptyState
              title="No active receiving sessions"
              description="Start from Receive Stock or begin a session against an open PO."
            />
          )}

          <div className="space-y-3">
            {sessions.map((s) => {
              const accepted = s.lines.reduce((n, l) => n + l.accepted_qty, 0);
              const expected = s.lines.reduce((n, l) => n + l.expected_qty, 0);
              const held = s.lines.reduce((n, l) => n + l.held_qty, 0);
              const value = s.lines.reduce(
                (n, l) => n + l.accepted_qty * (l.unit_cost_cents ?? 0),
                0,
              );
              return (
                <div key={s.id} className="rounded-lg border border-erp-table-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-erp-text-primary">
                        {s.session_number} · PO #{s.po_number ?? "—"} · {s.supplier_name ?? "Supplier"}
                      </p>
                      <p className="mt-1 text-xs text-erp-text-secondary">
                        Dock {s.dock_code ?? "—"} · {s.receiver_name ?? "receiver"} · started {elapsed(s.started_at)} ago
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.status === "quality_hold" ? "yellow" : "blue"}>{s.status}</Badge>
                      {/* The way in to the scan workspace. Without it this list
                          could only ever close a session it had no way to open. */}
                      <Link
                        href={`/purchasing/receiving/${s.id}`}
                        className="inline-flex min-h-touch items-center rounded bg-brand-600 px-[15px] text-[14px] font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                      >
                        Open
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={closingId === s.id || accepted === 0}
                        onClick={() => void closeSession(s.id)}
                      >
                        {closingId === s.id ? "Closing…" : "Post accepted"}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <span>{accepted}/{expected} accepted</span>
                    {held > 0 && <span className="text-warning-700">{held} on hold</span>}
                    <span className="tabular-nums">{formatMoney(value)}</span>
                  </div>
                  <ul className="mt-3 divide-y divide-erp-table-border text-sm">
                    {s.lines.map((l) => (
                      <li key={l.id} className="flex justify-between gap-3 py-2">
                        <span>
                          {l.product_name ?? l.sku ?? l.id}
                          <span className="ml-2 text-xs text-erp-text-secondary">{l.sku}</span>
                        </span>
                        <span className="tabular-nums text-erp-text-secondary">
                          {l.accepted_qty}/{l.expected_qty}
                          {l.held_qty > 0 ? ` · hold ${l.held_qty}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>

        {dash && (
          <p className="text-xs text-erp-text-secondary">
            AI procurement hooks: {dash.ai_suggestions.status} (no ML models yet — interfaces only).
            Dashboard generated {new Date(dash.generated_at).toLocaleString()}.
          </p>
        )}
      </div>
    </EnterpriseShell>
  );
}
