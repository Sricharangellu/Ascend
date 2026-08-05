"use client";

/**
 * Finance hub (Ponytail Wave 2) — summaries + deep links.
 * Full AR/AP pay tables live on /invoicing and /bills. Expenses stay here.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Skeleton";
import { formatMoney } from "@/lib/money";
import { apiGet } from "@/api-client/client";
import type { Bill, Invoice, BillingStatus } from "@/api-client/types";
import ExpensesPanel from "./_components/ExpensesPanel";

type HubTab = "overview" | "expenses";

function dueAmount(item: { total_cents: number; paid_cents: number; due_amount_cents?: number }) {
  return item.due_amount_cents ?? item.total_cents - item.paid_cents;
}

function isOverdue(item: { due_date: number | null; status: BillingStatus }): boolean {
  if (item.status === "paid" || item.status === "void") return false;
  if (!item.due_date) return false;
  return item.due_date < Date.now();
}

function SummaryCard({
  label,
  value,
  highlight,
  href,
  cta,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  href: string;
  cta: string;
}) {
  return (
    <Card className={`p-4 ${highlight ? "border-danger-100 bg-danger-50" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-erp-text-secondary">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          highlight ? "text-danger-700" : "text-erp-text-primary"
        }`}
      >
        {value}
      </p>
      <Link
        href={href}
        className="mt-3 inline-flex min-h-touch items-center text-sm font-medium text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        {cta}
      </Link>
    </Card>
  );
}

export default function FinancePage() {
  const [tab, setTab] = useState<HubTab>("overview");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const [inv, bil] = await Promise.all([
        apiGet<{ items: Invoice[] }>("/api/v1/billing/invoices"),
        apiGet<{ items: Bill[] }>("/api/v1/billing/bills"),
      ]);
      setInvoices(inv.items ?? []);
      setBills(bil.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load finance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const arOutstanding = invoices.reduce((s, inv) => s + dueAmount(inv), 0);
  const arOverdue = invoices.filter(isOverdue).reduce((s, inv) => s + dueAmount(inv), 0);
  const apOwed = bills.reduce((s, b) => s + dueAmount(b), 0);
  const apOverdue = bills.filter(isOverdue).reduce((s, b) => s + dueAmount(b), 0);

  return (
    <EnterpriseShell
      active="finance"
      title="Finance"
      subtitle="Cash position overview — receivables, payables, expenses"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="border-b border-erp-table-border">
          <nav className="-mb-px flex gap-1" aria-label="Finance tabs">
            {(
              [
                { id: "overview", label: "Overview" },
                { id: "expenses", label: "Expenses" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`min-h-touch border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                  tab === t.id
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-erp-text-secondary hover:text-erp-text-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {error && (
          <div className="rounded-md border border-danger-100 bg-danger-50 px-4 py-2 text-sm text-danger-700" role="alert">
            {error}
          </div>
        )}

        {tab === "overview" && (
          <>
            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                  label="AR outstanding"
                  value={formatMoney(arOutstanding)}
                  href="/invoicing"
                  cta="Open invoicing →"
                />
                <SummaryCard
                  label="AR overdue"
                  value={formatMoney(arOverdue)}
                  highlight={arOverdue > 0}
                  href="/reports/ar-aging"
                  cta="View AR aging →"
                />
                <SummaryCard
                  label="AP owed"
                  value={formatMoney(apOwed)}
                  href="/bills"
                  cta="Open bills →"
                />
                <SummaryCard
                  label="AP overdue"
                  value={formatMoney(apOverdue)}
                  highlight={apOverdue > 0}
                  href="/bills"
                  cta="Pay bills →"
                />
              </div>
            )}

            <Card className="p-4">
              <p className="text-sm font-medium text-erp-text-primary">Where to work</p>
              <p className="mt-1 text-sm text-erp-text-secondary">
                Create and collect customer invoices in Invoicing. Pay supplier bills on Bills.
                Record spend under Expenses. Ledger tools live in Accounting.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(
                  [
                    { href: "/invoicing", label: "Invoicing" },
                    { href: "/bills", label: "Bills" },
                    { href: "/accounting", label: "Accounting" },
                    { href: "/reports/ar-aging", label: "AR aging" },
                  ] as const
                ).map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="inline-flex min-h-touch items-center rounded-lg border border-erp-table-border bg-white px-3 py-1.5 text-sm font-medium text-erp-text-primary transition-colors hover:bg-erp-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                  >
                    {l.label}
                  </Link>
                ))}
                <Button variant="primary" size="sm" onClick={() => setTab("expenses")}>
                  Record expense
                </Button>
              </div>
            </Card>
          </>
        )}

        {tab === "expenses" && <ExpensesPanel />}
      </div>
    </EnterpriseShell>
  );
}
