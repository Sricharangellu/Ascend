
/**
 * Unified Transactions tab — consolidates Sales, Returns, Credits, Invoices,
 * and Sales by Customer into a single tabbed workspace so users don't need to
 * jump between 5 separate top-level tabs for transaction history.
 */

import { useState } from "react";
import { SalesTab } from "./SalesTab";
import { ReturnsTab } from "./ReturnsTab";
import { CreditsTab } from "./CreditsTab";
import { InvoicesTab } from "./InvoicesTab";
import { SalesCustomerTab } from "./SalesCustomerTab";

type TxTab = "sales" | "returns" | "credits" | "invoices" | "by-customer";

const TX_TABS: { key: TxTab; label: string; description: string }[] = [
  { key: "sales",       label: "Sales",          description: "All transactions where this product was sold" },
  { key: "by-customer", label: "By Customer",    description: "Sales broken down by customer — top buyers, loyalty" },
  { key: "returns",     label: "Returns",         description: "Return records, refunds, and restock status" },
  { key: "credits",     label: "Credit Notes",    description: "Store credit issued in connection with this product" },
  { key: "invoices",    label: "Purchase Invoice", description: "Supplier invoices and received purchase orders" },
];

export function TransactionsTab({ productId }: { productId: string }) {
  const [tab, setTab] = useState<TxTab>("sales");

  const current = TX_TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      {/* Sub-tab picker */}
      <div className="flex flex-wrap gap-1 rounded-xl border p-1 shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
        {TX_TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={["rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
              tab === t.key ? "shadow-sm" : "hover:bg-[var(--color-surface)]"
            ].join(" ")}
            style={tab === t.key
              ? { backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }
              : { color: "var(--color-text-secondary)" }}>
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{current.description}</p>

      {/* Tab content — lazy mounted */}
      {tab === "sales"       && <SalesTab productId={productId} />}
      {tab === "by-customer" && <SalesCustomerTab productId={productId} />}
      {tab === "returns"     && <ReturnsTab productId={productId} />}
      {tab === "credits"     && <CreditsTab productId={productId} />}
      {tab === "invoices"    && <InvoicesTab productId={productId} />}
    </div>
  );
}
