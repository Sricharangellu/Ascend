// Shared types, constants, and helpers for the customer detail page.
import type React from "react";

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  points: number;
  tier?: number;
  company?: string;
  dba?: string;
  taxId?: string;
  licenseNo?: string;
  state?: string;
  billingAddress?: string;
  shippingAddress?: string;
  salesRepId?: string;
  status: string;
  verified?: boolean;
  credit_limit_cents?: number;
}

export interface CustomerSummary {
  customer: Customer;
  visits: number;
  totalSpentCents: number;
  avgOrderCents: number;
  lastVisitAt: number | null;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalCents: number;
    createdAt: number;
  }>;
}

export interface CustomerFinancials {
  openInvoicesCents: number;
  paidInvoicesCents: number;
  storeCredit?: number;
}

export type DetailTab = "general" | "transactions" | "orders" | "financials" | "store-credit" | "contacts" | "addresses";

export interface CustomerLoyalty {
  customerId: string;
  currentPoints: number;
  currentTierLevel: number;
  currentTierName: string | null;
  pointMultiplier: number;
  discountPct: number;
  nextTierName: string | null;
  pointsToNextTier: number | null;
}

export interface CustomerSearchResult { id: string; name: string; email: string; phone: string; }
export type MergeStep = "search" | "confirm";

export const INPUT_CLASS =
  "w-full rounded-md border px-3 py-2 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 min-h-[44px]";
export const INPUT_STYLE = { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" } as React.CSSProperties;
export const LABEL_CLASS = "block text-[10px] font-semibold uppercase tracking-[0.07em] mb-1";

export function tierLabel(tier?: number): string {
  if (!tier) return "Standard";
  return `Tier ${tier}`;
}

export function statusColor(status: string) {
  if (status === "active") return "bg-success-100 text-success-700";
  return "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]";
}

export function orderStatusColor(status: string) {
  if (status === "completed") return "bg-success-100 text-success-700";
  if (status === "refunded") return "bg-warning-100 text-warning-700";
  if (status === "voided") return "bg-danger-100 text-danger-700";
  return "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]";
}

export function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className={LABEL_CLASS} style={{ color: "var(--color-text-secondary)" }}>{label}</p>
      <div className="min-h-[40px] rounded-md border px-3 py-2 text-[13px]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-primary)" }}>
        {value || <span style={{ color: "var(--color-text-muted)" }}>—</span>}
      </div>
    </div>
  );
}
