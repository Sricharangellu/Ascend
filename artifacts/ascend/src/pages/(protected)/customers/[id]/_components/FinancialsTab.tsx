
import { Card } from "@/components/Card";
import { formatMoney } from "@/lib/money";
import type { Customer, CustomerSummary, CustomerFinancials } from "./shared";

function FinancialMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "",
    success: "bg-success-50 border-success-200",
    warning: "bg-warning-50 border-warning-200",
    danger: "bg-danger-50 border-danger-200",
  }[tone];

  return (
    <div className={`rounded-lg border p-4 shadow-[var(--shadow-sm)] ${toneClass}`}
      style={tone === "neutral" ? { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" } : {}}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{value}</p>
    </div>
  );
}

export function FinancialsTab({
  customer,
  summary,
  financials,
}: {
  customer: Customer;
  summary: CustomerSummary | null;
  financials: CustomerFinancials | null;
}) {
  const avgOrder = summary?.avgOrderCents ?? 0;
  const totalSpent = summary?.totalSpentCents ?? 0;
  const openInvoices = financials?.openInvoicesCents ?? 0;
  const paidInvoices = financials?.paidInvoicesCents ?? 0;
  const creditLimit = customer.credit_limit_cents;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FinancialMetric
          label="Total spent"
          value={formatMoney(totalSpent)}
          tone="success"
        />
        <FinancialMetric label="Avg order" value={formatMoney(avgOrder)} />
        <FinancialMetric
          label="Open invoices"
          value={formatMoney(openInvoices)}
          tone={openInvoices > 0 ? "warning" : "neutral"}
        />
        <FinancialMetric
          label="Paid invoices"
          value={formatMoney(paidInvoices)}
          tone="success"
        />
      </div>

      <Card title="Account credit">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-10">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--color-text-secondary)" }}>Credit limit</p>
            <p className="mt-1 text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
              {creditLimit !== undefined ? formatMoney(creditLimit) : "No limit"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--color-text-secondary)" }}>Open balance</p>
            <p className={`mt-1 text-lg font-bold ${openInvoices > 0 ? "text-warning-700" : ""}`}
              style={!openInvoices ? { color: "var(--color-text-primary)" } : {}}>
              {formatMoney(openInvoices)}
            </p>
          </div>
          {creditLimit !== undefined && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--color-text-secondary)" }}>Available</p>
              <p className={`mt-1 text-lg font-bold ${creditLimit - openInvoices < 0 ? "text-danger-700" : "text-success-700"}`}>
                {formatMoney(Math.max(0, creditLimit - openInvoices))}
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
