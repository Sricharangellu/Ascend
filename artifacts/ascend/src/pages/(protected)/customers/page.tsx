
import { useMemo, useState } from "react";
import { useQuery } from "@/lib/useQuery";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Button } from "@/components/Button";
import { apiGet } from "@/api-client/client";
import type { CustomerSummary, CustomersResponse, RetailCustomer } from "@/api-client/types";
import { CustomerTable } from "./_components/CustomerTable";
import { NewCustomerModal } from "./_components/NewCustomerModal";
import type { CustomerView } from "./_components/CustomerDetailPanel";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fallbackSummary(customer: RetailCustomer): CustomerSummary {
  return { customer, visits: 0, totalSpentCents: 0, avgOrderCents: 0, lastVisitAt: null, recentOrders: [] };
}

type Segment = "Loyal" | "Regular" | "New" | "At risk";

function segmentFor(summary: CustomerSummary): Segment {
  const days = summary.lastVisitAt === null ? Infinity : (Date.now() - summary.lastVisitAt) / 86_400_000;
  if (days > 30 && summary.visits > 1) return "At risk";
  if (summary.customer.points >= 1000 || summary.totalSpentCents >= 30_000) return "Loyal";
  if (summary.visits <= 3) return "New";
  return "Regular";
}

function noteFor(customer: RetailCustomer, segment: Segment) {
  if (segment === "At risk") return `${customer.name} has not visited recently. Consider a win-back offer.`;
  if (segment === "Loyal")   return `${customer.name} is a high-value loyalty member. Keep checkout recognition fast.`;
  if (segment === "New")     return `${customer.name} is early in the relationship. Capture preferences during the next sale.`;
  return `${customer.name} has repeat purchase history. Review recent orders before recommending add-ons.`;
}

function toCustomerView(summary: CustomerSummary): CustomerView {
  const segment = segmentFor(summary);
  return {
    id:             summary.customer.id,
    name:           summary.customer.name,
    email:          summary.customer.email,
    phone:          summary.customer.phone,
    visits:         summary.visits,
    spendCents:     summary.totalSpentCents,
    avgOrderCents:  summary.avgOrderCents,
    segment,
    loyaltyPoints:  summary.customer.points,
    lastVisitAt:    summary.lastVisitAt,
    recentOrders:   summary.recentOrders,
    notes:          noteFor(summary.customer, segment),
  };
}

async function fetchCustomerList(): Promise<CustomerView[]> {
  const data = await apiGet<CustomersResponse>("/api/v1/customers");
  const summaries = await Promise.all(
    data.items.map(async (customer) => {
      try { return await apiGet<CustomerSummary>(`/api/v1/customers/${customer.id}/summary`); }
      catch { return fallbackSummary(customer); }
    })
  );
  return summaries.map(toCustomerView);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const { data, loading, error } =
    useQuery<CustomerView[]>("customers:list", fetchCustomerList, { staleMs: 60_000 });
  const customers = useMemo(() => data ?? [], [data]);

  return (
    <EnterpriseShell
      active="customers"
      title="Customers"
      subtitle="Profiles · loyalty · purchase history"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-4 px-5 py-5 sm:px-6">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div>
            <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
              Customers
            </h1>
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Profiles, loyalty points, and purchase history.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm">
              Import customers
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowNewCustomer(true)}>
              Add customer
            </Button>
          </div>
        </div>

        <CustomerTable customers={customers} loading={loading} error={error} />
      </div>

      <NewCustomerModal open={showNewCustomer} onClose={() => setShowNewCustomer(false)} />
    </EnterpriseShell>
  );
}
