"use client";

/**
 * Purchasing hub — POs, suppliers, reorder, vendor quotes.
 * Nested tools (Receive, Cost Entry, EDI, Pipeline) are linked from the hub
 * chrome rather than competing Inventory nav peers (Ponytail Wave 1).
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Skeleton } from "@/components/Skeleton";
import { useFlag } from "@/flags/useFlag";
import { TabBar } from "./_components/TabBar";
import { OrdersTab } from "./_components/OrdersTab";
import { SuppliersTab } from "./_components/SuppliersTab";
import { ReorderTab } from "./_components/ReorderTab";
import { VendorQuotesTab } from "./_components/VendorQuotesTab";
import type { PurchasingTab } from "./_components/shared";

const VALID_TABS: PurchasingTab[] = ["orders", "suppliers", "reorder", "vendor-quotes"];

function tabFromQuery(raw: string | null): PurchasingTab {
  if (raw && (VALID_TABS as string[]).includes(raw)) return raw as PurchasingTab;
  return "orders";
}

const HUB_LINKS = [
  { href: "/inventory/receive-stock", label: "Receive Stock" },
  { href: "/purchase", label: "Cost Entry" },
  { href: "/purchasing/edi-imports", label: "EDI Imports" },
  { href: "/inventory/pipeline", label: "PO Pipeline" },
  { href: "/vendors", label: "Vendors" },
] as const;

function PurchasingHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<PurchasingTab>(() =>
    tabFromQuery(searchParams.get("tab")),
  );
  const vendorQuotationsEnabled = useFlag("vendor_quotations");

  useEffect(() => {
    setActiveTab(tabFromQuery(searchParams.get("tab")));
  }, [searchParams]);

  const onChangeTab = useCallback(
    (t: PurchasingTab) => {
      setActiveTab(t);
      const params = new URLSearchParams(searchParams.toString());
      if (t === "orders") params.delete("tab");
      else params.set("tab", t);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <>
      <nav className="flex flex-wrap gap-2" aria-label="Purchasing related tools">
        {HUB_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex min-h-touch items-center rounded-lg border border-erp-table-border bg-white px-3 py-1.5 text-sm font-medium text-erp-text-primary transition-colors hover:bg-erp-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <Card className="overflow-hidden p-0">
        <TabBar
          active={activeTab}
          onChange={onChangeTab}
          showVendorQuotes={vendorQuotationsEnabled}
        />

        {activeTab === "orders" && <OrdersTab />}
        {activeTab === "suppliers" && <SuppliersTab />}
        {activeTab === "reorder" && (
          <ReorderTab onNavigateToOrders={() => onChangeTab("orders")} />
        )}
        {activeTab === "vendor-quotes" && <VendorQuotesTab />}
      </Card>
    </>
  );
}

export default function PurchasingPage() {
  return (
    <EnterpriseShell
      active="purchasing"
      title="Purchasing"
      subtitle="Suppliers, purchase orders, receiving, and cost entry"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <PurchasingHub />
        </Suspense>
      </div>
    </EnterpriseShell>
  );
}
