"use client";

/**
 * Activity workspace — sales/returns history plus analytics and audit.
 */

import { useState } from "react";
import { TransactionsTab } from "./TransactionsTab";
import { AnalyticsTab } from "./AnalyticsTab";
import { AuditLogTab } from "./AuditLogTab";

type ATab = "transactions" | "analytics" | "audit";

const ATABS: { key: ATab; label: string; description: string }[] = [
  { key: "transactions", label: "Transactions", description: "Sales, returns, credits, and invoices for this product" },
  { key: "analytics", label: "Analytics", description: "Velocity and performance charts" },
  { key: "audit", label: "Audit log", description: "Who changed product fields and when" },
];

export function ActivityWorkspace({
  productId,
  initialSubTab,
}: {
  productId: string;
  initialSubTab?: ATab;
}) {
  const [tab, setTab] = useState<ATab>(initialSubTab ?? "transactions");
  const current = ATABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-1 rounded-xl border border-erp-table-border bg-erp-page p-1"
        role="tablist"
        aria-label="Activity sections"
      >
        {ATABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={[
              "min-h-touch rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
              tab === t.key
                ? "bg-white text-brand-600 shadow-sm"
                : "text-erp-text-secondary hover:text-erp-text-primary",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-erp-text-secondary">{current.description}</p>

      {tab === "transactions" && <TransactionsTab productId={productId} />}
      {tab === "analytics" && <AnalyticsTab productId={productId} />}
      {tab === "audit" && <AuditLogTab productId={productId} />}
    </div>
  );
}
