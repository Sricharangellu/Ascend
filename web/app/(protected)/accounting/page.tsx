"use client";

/**
 * Accounting (Ponytail Wave 2) — COA, deposits, aging summaries.
 * Invoice/bill pay grids removed; pay on /invoicing and /bills.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { formatMoney } from "@/lib/money";
import { hasRole } from "@/lib/auth";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import type { AgingReport, AgingRow, Account, Deposit } from "@/api-client/types";

const TYPE_STYLE: Record<string, string> = {
  asset: "bg-blue-50 text-blue-700 ring-blue-200",
  liability: "bg-amber-50 text-amber-700 ring-amber-200",
  income: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  expense: "bg-red-50 text-red-700 ring-red-200",
};
const DEP_STYLE: Record<string, string> = {
  pending_approval: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
};

const AGING_BUCKETS: { key: keyof Omit<AgingReport["totals"], "total">; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "d1_30", label: "1-30 days" },
  { key: "d31_60", label: "31-60 days" },
  { key: "d61_90", label: "61-90 days" },
  { key: "d90_plus", label: "90+ days" },
];

/** Bucket totals + top parties with deep links (keeps develop #141 party names). */
function AgingSummary({
  report,
  partyHref,
  partyLabel,
}: {
  report: AgingReport;
  partyHref: (partyId: string) => string;
  partyLabel: string;
}) {
  const topParties: AgingRow[] = report.parties.slice(0, 8);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {AGING_BUCKETS.map(({ key, label }) => (
          <div key={key} className="rounded-md border border-erp-table-border bg-erp-page p-3">
            <p className="text-xs font-medium uppercase text-erp-text-secondary">{label}</p>
            <p className="mt-1 text-sm font-semibold text-erp-text-primary">
              {formatMoney(report.totals[key])}
            </p>
          </div>
        ))}
        <div className="col-span-2 rounded-md border border-erp-table-border bg-erp-table-header p-3 sm:col-span-5">
          <p className="text-xs font-medium uppercase text-erp-text-secondary">Total outstanding</p>
          <p className="mt-1 text-sm font-semibold text-erp-text-primary">
            {formatMoney(report.totals.total)}
          </p>
        </div>
      </div>
      {topParties.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-erp-table-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-erp-table-border bg-erp-table-header text-left text-xs font-semibold uppercase tracking-[0.08em] text-erp-text-secondary">
                <th className="px-3 py-2">{partyLabel}</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {topParties.map((row) => (
                <tr key={row.partyId} className="border-b border-erp-table-border last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={partyHref(row.partyId)}
                      className="min-h-touch inline-flex items-center font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    >
                      {row.partyName || row.partyId}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-erp-text-primary">
                    {formatMoney(row.buckets.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AccountingPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [apAging, setApAging] = useState<AgingReport | null>(null);
  const [arAging, setArAging] = useState<AgingReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sweepBusy, setSweepBusy] = useState(false);
  const [sweepResult, setSweepResult] = useState<number | null>(null);
  const canManage = hasRole("manager");

  const load = useCallback(async () => {
    try {
      setError(null);
      const [a, d, ap, ar] = await Promise.all([
        apiGet<{ items: Account[] }>("/api/v1/accounting/accounts"),
        apiGet<{ items: Deposit[] }>("/api/v1/accounting/deposits"),
        apiGet<AgingReport>("/api/v1/reports/ap-aging"),
        apiGet<AgingReport>("/api/v1/reports/ar-aging"),
      ]);
      setAccounts(a.items ?? []);
      setDeposits(d.items ?? []);
      setApAging(ap);
      setArAging(ar);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const seed = async () => {
    setBusy(true);
    try {
      await apiPost("/api/v1/accounting/accounts/seed", {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  };

  const runDunningSweep = async () => {
    setSweepBusy(true);
    setSweepResult(null);
    try {
      const res = await apiPost<{ updated: number }>("/api/v1/reports/ar-aging/sweep", {});
      setSweepResult(res.updated);
      await load();
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Dunning sweep failed");
    } finally {
      setSweepBusy(false);
    }
  };

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusy(true);
    try {
      await apiPost(`/api/v1/accounting/deposits/${id}/${action}`, {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <EnterpriseShell
      active="accounting"
      title="Accounting"
      subtitle="Chart of accounts, deposits, and aging"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-erp-table-border pb-4">
          <div>
            <h1 className="text-lg font-semibold text-erp-text-primary">Accounting operations</h1>
            <p className="mt-1 text-sm text-erp-text-secondary">
              Ledger tools only — pay invoices on Invoicing and bills on Bills.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/invoicing"
              className="inline-flex min-h-touch items-center rounded-lg border border-erp-table-border bg-white px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              Invoicing
            </Link>
            <Link
              href="/bills"
              className="inline-flex min-h-touch items-center rounded-lg border border-erp-table-border bg-white px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              Bills
            </Link>
            <Link
              href="/finance"
              className="inline-flex min-h-touch items-center rounded-lg border border-erp-table-border bg-white px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              Finance hub
            </Link>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-md border border-danger-100 bg-danger-50 px-4 py-2 text-sm text-danger-700">
            {error}
          </div>
        )}

        <Card title="Chart of Accounts" description="Typed account tree used across products, shipping, and bills." noPadding>
          <div className="border-b border-erp-table-border bg-erp-page px-5 py-3">
            {accounts.length === 0 && (
              <Button size="sm" disabled={busy} onClick={() => void seed()}>
                Seed standard COA
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-erp-table-border bg-erp-table-header text-left text-xs font-semibold uppercase tracking-[0.08em] text-erp-text-secondary">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-erp-text-secondary">
                      No accounts — seed to get started
                    </td>
                  </tr>
                )}
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-erp-table-border last:border-0 hover:bg-erp-page">
                    <td className="px-4 py-3 font-mono text-xs text-erp-text-secondary">{a.code}</td>
                    <td className="px-4 py-3">{a.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                          TYPE_STYLE[a.type] ?? "bg-slate-100 text-slate-700 ring-slate-200"
                        }`}
                      >
                        {a.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Batch Deposits" description="Group received payments into bank deposits for approval." noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-erp-table-border bg-erp-table-header text-left text-xs font-semibold uppercase tracking-[0.08em] text-erp-text-secondary">
                  <th className="px-4 py-3">Batch #</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deposits.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-erp-text-secondary">
                      No batch deposits
                    </td>
                  </tr>
                )}
                {deposits.map((d) => (
                  <tr key={d.id} className="border-b border-erp-table-border last:border-0 hover:bg-erp-page">
                    <td className="px-4 py-3 font-medium">{d.batch_number}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                          DEP_STYLE[d.status] ?? "bg-slate-100 text-slate-700 ring-slate-200"
                        }`}
                      >
                        {d.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{formatMoney(d.total_cents)}</td>
                    <td className="px-4 py-3 text-right">
                      {d.status === "pending_approval" && (
                        <span className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decide(d.id, "approve")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decide(d.id, "reject")}>
                            Reject
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="AR aging" description="Receivables by days outstanding. Pay invoices in Invoicing.">
          {arAging && (
            <AgingSummary
              report={arAging}
              partyHref={(id) => `/customers/${encodeURIComponent(id)}`}
              partyLabel="Customer"
            />
          )}
          {canManage && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" disabled={sweepBusy} onClick={() => void runDunningSweep()}>
                {sweepBusy ? "Running sweep…" : "Run Dunning Sweep"}
              </Button>
              {sweepResult !== null && (
                <span className="text-xs text-erp-text-secondary">
                  {sweepResult === 0
                    ? "All invoices already up-to-date."
                    : `${sweepResult} invoice${sweepResult !== 1 ? "s" : ""} flagged.`}
                </span>
              )}
              <Link href="/reports/ar-aging" className="text-sm font-medium text-brand-600 hover:underline">
                Full AR aging report →
              </Link>
            </div>
          )}
        </Card>

        <Card title="AP aging" description="Payables by days outstanding. Pay bills on Bills.">
          {apAging && (
            <AgingSummary
              report={apAging}
              partyHref={(id) => `/vendors/${encodeURIComponent(id)}`}
              partyLabel="Supplier"
            />
          )}
          <div className="mt-3">
            <Link href="/bills" className="text-sm font-medium text-brand-600 hover:underline">
              Open bills →
            </Link>
          </div>
        </Card>
      </div>
    </EnterpriseShell>
  );
}
