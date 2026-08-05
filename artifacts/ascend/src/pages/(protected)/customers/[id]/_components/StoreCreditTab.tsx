
import Link from "@/lib/link";
import { Card } from "@/components/Card";
import { formatMoney } from "@/lib/money";
import type { Customer, CustomerFinancials } from "./shared";
import { LABEL_CLASS } from "./shared";

export function StoreCreditTab({
  customer,
  financials,
  canEdit,
}: {
  customer: Customer;
  financials: CustomerFinancials | null;
  canEdit: boolean;
}) {
  const creditBalance = financials?.storeCredit ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <Card title="Store credit balance">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-3xl font-bold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(creditBalance)}</p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Available store credit for {customer.name}
            </p>
          </div>

          <div className="rounded-lg border p-4 text-[13px]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
            <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>Credit management</p>
            <p className="mt-1">
              Store credit is applied and managed at checkout. To add or redeem credit,
              open a new sale from the{" "}
              <Link href="/terminal" className="text-brand-600 underline underline-offset-2">
                Register
              </Link>{" "}
              and select the customer at the tender screen.
            </p>
          </div>
        </div>
      </Card>

      {canEdit && (
        <Card title="Credit details">
          <div className="grid gap-4 sm:grid-cols-2">
            {customer.credit_limit_cents !== undefined && (
              <div>
                <p className={LABEL_CLASS} style={{ color: "var(--color-text-secondary)" }}>Credit limit</p>
                <p className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
                  {formatMoney(customer.credit_limit_cents)}
                </p>
              </div>
            )}
            <div>
              <p className={LABEL_CLASS} style={{ color: "var(--color-text-secondary)" }}>Current balance</p>
              <p className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(creditBalance)}</p>
            </div>
          </div>
          <p className="mt-4 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            Credit management via checkout. Contact support to adjust credit limits.
          </p>
        </Card>
      )}
    </div>
  );
}
