"use client";

import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { formatMoney, parseToCents } from "@/lib/money";
import { hasRole } from "@/lib/auth";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import type { Bill, Invoice, BillingStatus } from "@/api-client/types";
import { usePathname, useRouter } from "next/navigation";
import { fmtDate } from "@/lib/date";
import ExpensesPanel from "./_components/ExpensesPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinanceInvoice extends Invoice {
  due_amount_cents?: number;
}

interface FinanceBill extends Bill {
  due_amount_cents?: number;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BILLING_STYLE: Record<BillingStatus, string> = {
  open:    "bg-info-50 text-info-700 border border-info-200",
  partial: "bg-warning-50 text-warning-700 border border-warning-200",
  paid:    "bg-success-50 text-success-700 border border-success-200",
  void:    "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]",
};

const TABS = [
  { id: "ar", label: "Receivables (AR)" },
  { id: "ap", label: "Payables (AP)" },
  { id: "expenses", label: "Expenses" },
  { id: "aging", label: "Aging" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dueAmount(item: { total_cents: number; paid_cents: number; due_amount_cents?: number }) {
  return item.due_amount_cents ?? item.total_cents - item.paid_cents;
}

function isOverdue(item: { due_date: number | null; status: BillingStatus }): boolean {
  if (item.status === "paid" || item.status === "void") return false;
  if (!item.due_date) return false;
  return item.due_date < Date.now();
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-[var(--shadow-sm)] ${highlight ? "border-danger-200 bg-danger-50" : ""}`}
      style={highlight ? {} : { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
      <p className={`mt-1.5 text-[20px] font-bold tabular-nums ${highlight ? "text-danger-700" : ""}`}
        style={highlight ? {} : { color: "var(--color-text-primary)" }}
      >{value}</p>
    </div>
  );
}

// ─── Pay control ──────────────────────────────────────────────────────────────

function PayControl({
  max,
  busy,
  onPay,
}: {
  max: number;
  busy: boolean;
  onPay: (amountCents: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setOpen(true);
          setAmount((max / 100).toFixed(2));
        }}
      >
        Pay
      </Button>
    );
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
        className="w-20 rounded px-1.5 py-1 text-right text-xs outline-none focus:ring-1"
        style={{ border: "1px solid var(--color-border)" }}
      />
      <Button
        size="sm"
        variant="primary"
        disabled={busy || !valid}
        onClick={() => {
          if (valid) {
            onPay(cents);
            setOpen(false);
          }
        }}
      >
        Confirm
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 shadow-lg">
      <span className="text-sm font-medium text-green-800">{message}</span>
      <button onClick={onDismiss} className="text-emerald-700 hover:text-emerald-900" aria-label="Dismiss">
        x
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const pathname = usePathname();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(() => financeTabFromPath(pathname));
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [bills, setBills] = useState<FinanceBill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setTab(financeTabFromPath(pathname)), [pathname]);
  const canPay = hasRole("manager");

  const load = useCallback(async () => {
    try {
      setError(null);
      const [inv, bil] = await Promise.all([
        apiGet<{ items: FinanceInvoice[] }>("/api/v1/billing/invoices"),
        apiGet<{ items: FinanceBill[] }>("/api/v1/billing/bills"),
      ]);
      setInvoices(inv.items ?? []);
      setBills(bil.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load finance data");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const payInvoice = async (id: string, amountCents: number) => {
    setBusy(true);
    try {
      await apiPost(`/api/v1/billing/invoices/${id}/pay`, { amountCents, mode: "cash" });
      await load();
      setToast("Invoice payment recorded");
    } catch (e) {
      setError(
        e instanceof ApiResponseError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Payment failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const payBill = async (id: string, amountCents: number) => {
    setBusy(true);
    try {
      await apiPost(`/api/v1/billing/bills/${id}/pay`, { amountCents, mode: "bank_transfer" });
      await load();
      setToast("Bill payment recorded");
    } catch (e) {
      setError(
        e instanceof ApiResponseError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Payment failed"
      );
    } finally {
      setBusy(false);
    }
  };

  // AR summary metrics
  const arOutstanding = invoices.reduce((s, inv) => s + dueAmount(inv), 0);
  const arOverdue = invoices
    .filter(isOverdue)
    .reduce((s, inv) => s + dueAmount(inv), 0);
  const now = Date.now();
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const arCollectedThisMonth = invoices
    .filter((inv) => inv.status === "paid" && inv.due_date !== null && inv.due_date >= startOfMonth)
    .reduce((s, inv) => s + inv.total_cents, 0);

  // AP summary metrics
  const apOwed = bills.reduce((s, b) => s + dueAmount(b), 0);
  const apOverdue = bills.filter(isOverdue).reduce((s, b) => s + dueAmount(b), 0);

  return (
    <EnterpriseShell
      active="finance"
      title="Finance"
      subtitle="Receivables, Payables & Aging"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-5 px-5 py-5 sm:px-6">
        <div className="border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Finance center</h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Track outstanding receivables, supplier payables, and aging exposure.</p>
        </div>
        {error && (
          <div className="rounded-xl border px-4 py-3 text-[13px]" style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>{error}</div>
        )}

        {/* Tab bar */}
        <div className="flex gap-0 border-b" style={{ borderColor: "var(--color-border)" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                router.replace(t.id === "ap" ? "/finance/bills" : t.id === "aging" ? "/reporting/ar-aging" : "/finance", { scroll: false });
              }}
              aria-current={tab === t.id ? "page" : undefined}
              className={[
                "relative px-4 py-2.5 text-[13px] font-medium transition-colors duration-150",
                "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-t-full after:transition-all",
                tab === t.id ? "text-brand-600 after:bg-brand-600" : "after:bg-transparent",
              ].join(" ")}
              style={{ color: tab === t.id ? undefined : "var(--color-text-secondary)" }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Receivables (AR) ─────────────────────────────────────── */}
        {tab === "ar" && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryCard label="Total Outstanding" value={formatMoney(arOutstanding)} />
              <SummaryCard label="Overdue" value={formatMoney(arOverdue)} highlight={arOverdue > 0} />
              <SummaryCard label="Collected This Month" value={formatMoney(arCollectedThisMonth)} />
            </div>

            <Card title="Invoices" description="Customer invoices and payment status." noPadding>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                    <tr>
                      {["Invoice #", "Customer", "Status", "Total", "Due Date", "Due Amount", ...(canPay ? ["Actions"] : [])].map((h, i) => (
                        <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${i > 2 ? "text-right" : "text-left"}`}
                          style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.length === 0 && (
                      <tr><td colSpan={canPay ? 7 : 6} className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No invoices found</td></tr>
                    )}
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b last:border-0 transition-colors duration-75"
                        style={{ borderColor: "var(--color-table-border)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>{inv.invoice_number}</td>
                        <td className="whitespace-nowrap px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{inv.customer_id}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${BILLING_STYLE[inv.status]}`}>{inv.status}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(inv.total_cents)}</td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right text-[12px] ${isOverdue(inv) ? "font-medium text-danger-600" : ""}`}
                          style={isOverdue(inv) ? {} : { color: "var(--color-text-secondary)" }}>{fmtDate(inv.due_date)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(dueAmount(inv))}</td>
                        {canPay && (
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {inv.status !== "paid" && inv.status !== "void" && (
                              <PayControl busy={busy} max={dueAmount(inv)} onPay={(cents) => void payInvoice(inv.id, cents)} />
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* ── Tab: Payables (AP) ────────────────────────────────────────── */}
        {tab === "ap" && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SummaryCard label="Total Owed" value={formatMoney(apOwed)} />
              <SummaryCard label="Overdue Bills" value={formatMoney(apOverdue)} highlight={apOverdue > 0} />
            </div>

            <Card title="Bills" description="Supplier bills awaiting payment." noPadding>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                    <tr>
                      {["Bill #", "Supplier", "Status", "Total", "Due Date", "Due Amount", ...(canPay ? ["Actions"] : [])].map((h, i) => (
                        <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${i > 2 ? "text-right" : "text-left"}`}
                          style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bills.length === 0 && (
                      <tr><td colSpan={canPay ? 7 : 6} className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No bills found</td></tr>
                    )}
                    {bills.map((bill) => (
                      <tr key={bill.id} className="border-b last:border-0 transition-colors duration-75"
                        style={{ borderColor: "var(--color-table-border)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>{bill.bill_number}</td>
                        <td className="whitespace-nowrap px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{bill.supplier_id}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${BILLING_STYLE[bill.status]}`}>{bill.status}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(bill.total_cents)}</td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right text-[12px] ${isOverdue(bill) ? "font-medium text-danger-600" : ""}`}
                          style={isOverdue(bill) ? {} : { color: "var(--color-text-secondary)" }}>{fmtDate(bill.due_date)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(dueAmount(bill))}</td>
                        {canPay && (
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {bill.status !== "paid" && bill.status !== "void" && (
                              <PayControl busy={busy} max={dueAmount(bill)} onPay={(cents) => void payBill(bill.id, cents)} />
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {tab === "expenses" && <ExpensesPanel />}

        {/* "Aging" isn't rendered here — clicking it navigates straight to
            /reporting/ar-aging (see the tab bar's onClick above). It used to
            also set local tab state and render an inline AR+AP block, but
            the router.replace in the same click handler always fired first,
            so that block could never actually be seen by a user — removed
            rather than left as unreachable dead code. */}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </EnterpriseShell>
  );
}

function financeTabFromPath(pathname: string): TabId {
  // "/finance/payment-made" was a dead, unreferenced route shim (deleted —
  // see WORK/audits — nothing ever linked to it); this matcher only needs
  // to recognize the one real path that still redirects here.
  if (pathname.endsWith("/bills")) return "ap";
  return "ar";
}
