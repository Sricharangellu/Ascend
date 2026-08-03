
import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { formatMoney, parseToCents } from "@/lib/money";
import { hasRole } from "@/lib/auth";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import type { AgingReport, Bill, Invoice, BillingStatus, Account, Deposit } from "@/api-client/types";
import { fmtDate } from "@/lib/date";

const TYPE_STYLE: Record<string, string> = {
  asset:     "bg-info-50 text-info-700 border border-info-200",
  liability: "bg-warning-50 text-warning-700 border border-warning-200",
  income:    "bg-success-50 text-success-700 border border-success-200",
  expense:   "bg-danger-50 text-danger-700 border border-danger-200",
};
const DEP_STYLE: Record<string, string> = {
  pending_approval: "bg-warning-50 text-warning-700 border border-warning-200",
  approved:         "bg-success-50 text-success-700 border border-success-200",
  rejected:         "bg-danger-50 text-danger-700 border border-danger-200",
};
const BILLING_STYLE: Record<BillingStatus, string> = {
  open:    "bg-info-50 text-info-700 border border-info-200",
  partial: "bg-warning-50 text-warning-700 border border-warning-200",
  paid:    "bg-success-50 text-success-700 border border-success-200",
  void:    "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]",
};
const DUNNING_STYLE: Record<number, string> = {
  1: "bg-warning-50 text-warning-700 border border-warning-200",
  2: "bg-warning-50 text-warning-800 border border-warning-300",
  3: "bg-danger-50 text-danger-700 border border-danger-200",
};
const DUNNING_LABEL: Record<number, string> = {
  1: "30d",
  2: "60d",
  3: "90d+",
};

export default function AccountingPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [apAging, setApAging] = useState<AgingReport | null>(null);
  const [arAging, setArAging] = useState<AgingReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sweepBusy, setSweepBusy] = useState(false);
  const [sweepResult, setSweepResult] = useState<number | null>(null);
  const canPay = hasRole("manager");

  const load = useCallback(async () => {
    try {
      setError(null);
      const [a, d, b, i, ap, ar] = await Promise.all([
        apiGet<{ items: Account[] }>("/api/v1/accounting/accounts"),
        apiGet<{ items: Deposit[] }>("/api/v1/accounting/deposits"),
        apiGet<{ items: Bill[] }>("/api/v1/billing/bills"),
        apiGet<{ items: Invoice[] }>("/api/v1/billing/invoices"),
        apiGet<AgingReport>("/api/v1/reports/ap-aging"),
        apiGet<AgingReport>("/api/v1/reports/ar-aging"),
      ]);
      setAccounts(a.items ?? []);
      setDeposits(d.items ?? []);
      setBills(b.items ?? []);
      setInvoices(i.items ?? []);
      setApAging(ap);
      setArAging(ar);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const seed = async () => {
    setBusy(true);
    try { await apiPost("/api/v1/accounting/accounts/seed", {}); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Seed failed"); }
    finally { setBusy(false); }
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
    try { await apiPost(`/api/v1/accounting/deposits/${id}/${action}`, {}); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  };

  const payBill = async (id: string, amountCents: number) => {
    setBusy(true);
    try {
      await apiPost(`/api/v1/billing/bills/${id}/pay`, { amountCents });
      await load();
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  const payInvoice = async (id: string, amountCents: number) => {
    setBusy(true);
    try {
      await apiPost(`/api/v1/billing/invoices/${id}/pay`, { amountCents });
      await load();
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <EnterpriseShell active="accounting" title="Accounting" subtitle="Chart of Accounts & Batch Deposits" contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-5 py-5 sm:px-6">
        <div className="border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Accounting operations</h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Manage account mapping, deposit approvals, receivables, and payables.</p>
        </div>
        {error && <div role="alert" className="rounded-xl border px-4 py-3 text-[13px]"
          style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>{error}</div>}

        <Card title="Chart of Accounts" description="Typed account tree used across products, shipping, and bills." noPadding>
          <div className="border-b px-5 py-3" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
            {accounts.length === 0 && <Button size="sm" disabled={busy} onClick={seed}>Seed standard COA</Button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Code", "Name", "Type"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]"
                      style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No accounts — seed to get started</td></tr>}
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 transition-colors duration-75"
                    style={{ borderColor: "var(--color-table-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                    <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{a.code}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{a.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${TYPE_STYLE[a.type] ?? "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]"}`}>{a.type}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Batch Deposits" description="Group received payments into bank deposits for approval." noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Batch #", "Status", "Total", "Actions"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${i >= 2 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deposits.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No batch deposits</td></tr>}
                {deposits.map((d) => (
                  <tr key={d.id} className="border-b last:border-0 transition-colors duration-75"
                    style={{ borderColor: "var(--color-table-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>{d.batch_number}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${DEP_STYLE[d.status] ?? "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]"}`}>{d.status.replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: "var(--color-text-primary)" }}>{formatMoney(d.total_cents)}</td>
                    <td className="px-4 py-3 text-right">
                      {d.status === "pending_approval" && (
                        <span className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(d.id, "approve")}>Approve</Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(d.id, "reject")}>Reject</Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Accounts Receivable" description="Customer invoices and aging by days outstanding.">
          {arAging && <AgingSummary report={arAging} />}

          {canPay && (
            <div className="mt-3 flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={sweepBusy}
                onClick={() => void runDunningSweep()}
              >
                {sweepBusy ? "Running sweep…" : "Run Dunning Sweep"}
              </Button>
              {sweepResult !== null && (
                <span className="text-xs text-slate-500">
                  {sweepResult === 0
                    ? "All invoices already up-to-date."
                    : `${sweepResult} invoice${sweepResult !== 1 ? "s" : ""} flagged.`}
                </span>
              )}
            </div>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Invoice #", "Status", "Overdue", "Due", "Total", "Paid", "Due Amount", "Actions"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${i >= 4 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No invoices</td></tr>}
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0 transition-colors duration-75"
                    style={{ borderColor: "var(--color-table-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>{inv.invoice_number}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${BILLING_STYLE[inv.status]}`}>{inv.status}</span></td>
                    <td className="px-4 py-3">
                      {inv.dunning_level ? (
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${DUNNING_STYLE[inv.dunning_level]}`}>{DUNNING_LABEL[inv.dunning_level]}</span>
                      ) : <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                    </td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(inv.due_date)}</td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(inv.total_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(inv.paid_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(inv.total_cents - inv.paid_cents)}</td>
                    <td className="px-4 py-3 text-right">{canPay && inv.status !== "paid" && inv.status !== "void" && (<PayControl busy={busy} max={inv.total_cents - inv.paid_cents} onPay={(cents) => payInvoice(inv.id, cents)} />)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Accounts Payable" description="Supplier bills and aging by days outstanding.">
          {apAging && <AgingSummary report={apAging} />}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["Bill #", "Status", "Due", "Total", "Paid", "Due Amount", "Actions"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${i >= 3 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bills.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No bills</td></tr>}
                {bills.map((bill) => (
                  <tr key={bill.id} className="border-b last:border-0 transition-colors duration-75"
                    style={{ borderColor: "var(--color-table-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>{bill.bill_number}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${BILLING_STYLE[bill.status]}`}>{bill.status}</span></td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(bill.due_date)}</td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(bill.total_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(bill.paid_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(bill.total_cents - bill.paid_cents)}</td>
                    <td className="px-4 py-3 text-right">{canPay && bill.status !== "paid" && bill.status !== "void" && (<PayControl busy={busy} max={bill.total_cents - bill.paid_cents} onPay={(cents) => payBill(bill.id, cents)} />)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </EnterpriseShell>
  );
}

const AGING_BUCKETS: { key: keyof Omit<AgingReport["totals"], "total">; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "d1_30", label: "1-30 days" },
  { key: "d31_60", label: "31-60 days" },
  { key: "d61_90", label: "61-90 days" },
  { key: "d90_plus", label: "90+ days" },
];

function AgingSummary({ report }: { report: AgingReport }) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {AGING_BUCKETS.map(({ key, label }) => (
        <div key={key} className="rounded-lg border p-3"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
          <p className="mt-1 text-[14px] font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(report.totals[key])}</p>
        </div>
      ))}
      <div className="col-span-2 rounded-lg border p-3 sm:col-span-5"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-primary-subtle)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-600">Total outstanding</p>
        <p className="mt-1 text-[14px] font-bold tabular-nums text-brand-700">{formatMoney(report.totals.total)}</p>
      </div>
    </div>
  );
}

function PayControl({ max, busy, onPay }: { max: number; busy: boolean; onPay: (amountCents: number) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");

  if (!open) {
    return <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setOpen(true); setAmount((max / 100).toFixed(2)); }}>Pay</Button>;
  }

  const cents = parseToCents(amount);
  const valid = !isNaN(cents) && cents > 0 && cents <= max;

  return (
    <span className="flex items-center justify-end gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={busy}
        aria-label="Payment amount"
        className="w-20 rounded-md border px-1.5 py-1 text-right text-[12px] outline-none focus:ring-1 focus:ring-brand-500"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
      />
      <Button
        size="sm"
        variant="primary"
        disabled={busy || !valid}
        onClick={() => { if (valid) { onPay(cents); setOpen(false); } }}
      >
        Confirm
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
    </span>
  );
}
