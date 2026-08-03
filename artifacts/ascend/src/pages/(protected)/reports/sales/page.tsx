
/**
 * /reports/sales — Sales breakdown by category, customer, and product.
 * Owner/manager only. Supports Today / 7d / 30d date ranges.
 */

import { useEffect, useState } from "react";
import Link from "@/lib/link";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { formatMoney } from "@/lib/money";
import { ReportsSubNav } from "@/components/reports/ReportsSubNav";

type Range = "today" | "7d" | "30d";
type Tab = "category" | "customer" | "product";

interface RevenueTrendItem { date: string; label: string; revenueCents: number; orderCount: number; }
interface CategoryItem { key: string; name: string; units: number; revenueCents: number; }
interface CustomerItem { key: string; name: string; units: number; revenueCents: number; }
interface ProductItem { productId: string; sku: string; name: string; category: string; units: number; revenueCents: number; }

function downloadCsv(filename: string, rows: string[][]): void {
  const header = rows[0];
  if (!header) return;
  const lines = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div aria-busy="true" aria-label="Loading data" className="space-y-2 px-1 py-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((__, j) => (
            <div key={j} className="h-5 flex-1 animate-skeleton rounded" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function RangeToggle({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const labels: Record<Range, string> = { today: "Today", "7d": "7 days", "30d": "30 days" };
  return (
    <div className="inline-flex rounded-xl border p-1 shadow-[var(--shadow-sm)]"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      {(["today", "7d", "30d"] as const).map((r) => (
        <button key={r} type="button" onClick={() => onChange(r)}
          className={`min-h-[40px] rounded-lg px-3 text-[13px] font-medium transition-colors ${
            value === r ? "bg-brand-600 text-white" : "hover:bg-[var(--color-surface-subtle)]"
          }`}
          style={value !== r ? { color: "var(--color-text-secondary)" } : {}}>
          {labels[r]}
        </button>
      ))}
    </div>
  );
}

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "category", label: "By Category" },
    { key: "customer", label: "By Customer" },
    { key: "product", label: "By Product" },
  ];
  return (
    <div className="border-b" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <nav className="-mb-px flex gap-0 px-5" aria-label="Sales breakdown tabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => onChange(t.key)}
            className={`min-h-[44px] border-b-2 px-4 text-[13px] font-medium transition-colors ${
              active === t.key
                ? "border-brand-600 text-brand-600"
                : "border-transparent hover:border-[var(--color-border)]"
            }`}
            style={active !== t.key ? { color: "var(--color-text-secondary)" } : {}}
            aria-current={active === t.key ? "page" : undefined}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function SalesReportPage() {
  const [range, setRange] = useState<Range>("today");
  const [tab, setTab] = useState<Tab>("category");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [trendItems, setTrendItems] = useState<RevenueTrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const [catData, cusData, proData, trendData] = await Promise.all([
          apiGet<{ items: CategoryItem[] }>(`/api/v1/reports/sales-by-category?range=${range}`),
          apiGet<{ items: CustomerItem[] }>(`/api/v1/reports/sales-by-customer?range=${range}`),
          apiGet<{ items: ProductItem[] }>(`/api/v1/reports/sales-by-product?range=${range}&limit=50`),
          apiGet<{ items: RevenueTrendItem[] }>(`/api/v1/reports/revenue-trend?range=30d`),
        ]);
        if (!cancelled) {
          setCategories(catData.items ?? []);
          setCustomers(cusData.items ?? []);
          setProducts(proData.items ?? []);
          setTrendItems(trendData.items ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiResponseError ? err.message : "Failed to load sales report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  const rangeLabel = range === "today" ? "Today" : range === "7d" ? "Last 7 days" : "Last 30 days";

  function handleExportCsv() {
    if (tab === "category") {
      downloadCsv(`sales-by-category-${range}.csv`, [
        ["Category", "Qty Sold", "Revenue"],
        ...categories.map((c) => [c.name, String(c.units), formatMoney(c.revenueCents)]),
      ]);
    } else if (tab === "customer") {
      downloadCsv(`sales-by-customer-${range}.csv`, [
        ["Customer", "Qty Sold", "Total Spent"],
        ...customers.map((c) => [c.name, String(c.units), formatMoney(c.revenueCents)]),
      ]);
    } else {
      downloadCsv(`sales-by-product-${range}.csv`, [
        ["SKU", "Name", "Category", "Qty", "Revenue"],
        ...products.map((p) => [p.sku, p.name, p.category, String(p.units), formatMoney(p.revenueCents)]),
      ]);
    }
  }

  return (
    <EnterpriseShell active="reports" title="Sales Report" subtitle={`Sales breakdown · Demo Store · ${rangeLabel}`}
      contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-5"><ReportsSubNav /></div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <RangeToggle value={range} onChange={setRange} />
          <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={loading}>Export CSV</Button>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Revenue Trend</h2>
            <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>Daily revenue over the last 30 days</p>
          </div>
          <div className="px-2 py-4">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendItems} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5D5FEF" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#5D5FEF" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                  axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                  axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMoney(v)} width={70} />
                <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(value: unknown) => [formatMoney(typeof value === "number" ? value : 0), "Revenue"]} />
                <Area type="monotone" dataKey="revenueCents" stroke="#5D5FEF" strokeWidth={2}
                  fill="url(#grad)" dot={false} activeDot={{ r: 4, fill: "#5D5FEF" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card noPadding className="mt-5">
          <TabBar active={tab} onChange={setTab} />
          <div className="p-5">
            {loading ? (
              <TableSkeleton cols={tab === "category" ? 3 : tab === "customer" ? 3 : 5} />
            ) : error ? (
              <p role="alert" className="text-[13px] text-red-600">{error}</p>
            ) : tab === "category" ? (
              <CategoryTable items={categories} />
            ) : tab === "customer" ? (
              <CustomerTable items={customers} />
            ) : (
              <ProductTable items={products} />
            )}
          </div>
        </Card>
      </div>
    </EnterpriseShell>
  );
}

function CategoryTable({ items }: { items: CategoryItem[] }) {
  if (items.length === 0) return <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>No data for this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
            style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
            <th className="pb-2 pr-4">Category</th>
            <th className="pb-2 pr-4 text-right">Qty Sold</th>
            <th className="pb-2 text-right">Revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-table-border)]">
          {items.map((item) => (
            <tr key={item.key} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
              <td className="py-2.5 pr-4 font-medium" style={{ color: "var(--color-text-primary)" }}>{item.name}</td>
              <td className="py-2.5 pr-4 text-right" style={{ color: "var(--color-text-secondary)" }}>{item.units}</td>
              <td className="py-2.5 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(item.revenueCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerTable({ items }: { items: CustomerItem[] }) {
  if (items.length === 0) return <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>No data for this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
            style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
            <th className="pb-2 pr-4">Customer</th>
            <th className="pb-2 pr-4 text-right">Qty Sold</th>
            <th className="pb-2 text-right">Total Spent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-table-border)]">
          {items.map((item) => (
            <tr key={item.key} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
              <td className="py-2.5 pr-4">
                <Link href={`/customers/${item.key}`}
                  className="font-medium hover:underline"
                  style={{ color: "var(--color-text-primary)" }}>
                  {item.name}
                </Link>
              </td>
              <td className="py-2.5 pr-4 text-right" style={{ color: "var(--color-text-secondary)" }}>{item.units}</td>
              <td className="py-2.5 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(item.revenueCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductTable({ items }: { items: ProductItem[] }) {
  if (items.length === 0) return <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>No data for this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
            style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
            <th className="pb-2 pr-4">SKU</th>
            <th className="pb-2 pr-4">Name</th>
            <th className="pb-2 pr-4">Category</th>
            <th className="pb-2 pr-4 text-right">Qty</th>
            <th className="pb-2 text-right">Revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-table-border)]">
          {items.map((item) => (
            <tr key={item.productId} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
              <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{item.sku}</td>
              <td className="py-2.5 pr-4">
                <Link href={`/catalog/${item.productId}`} className="font-medium hover:underline"
                  style={{ color: "var(--color-text-primary)" }}>
                  {item.name}
                </Link>
              </td>
              <td className="py-2.5 pr-4" style={{ color: "var(--color-text-secondary)" }}>{item.category}</td>
              <td className="py-2.5 pr-4 text-right" style={{ color: "var(--color-text-secondary)" }}>{item.units}</td>
              <td className="py-2.5 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(item.revenueCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
