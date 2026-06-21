"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import type {
  SalesSummary,
  TopProduct,
  TopProductsResponse,
  SalesByProductItem,
  SalesByProductResponse,
  MarginByCategoryItem,
  MarginByCategoryResponse,
} from "@/api-client/types";
import { getUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EnterpriseShell } from "@/components/EnterpriseShell";

// ── Types ──────────────────────────────────────────────────────────────────────
type Range = "7d" | "30d" | "90d";
type ReportTab = "overview" | "sales-by-product" | "margin" | "inventory" | "low-stock";

interface InventoryValuationRow {
  productId: string;
  name: string;
  stockQty: number;
  costCents: number;
  retailCents: number;
  costValueCents: number;
  retailValueCents: number;
}

interface InventoryLevel {
  id: string;
  sku: string;
  name: string;
  category: string;
  onHand: number;
  reorderPoint: number;
  lowStock: boolean;
  priceCents: number;
  costCents: number | null;
}

// ── CSV helpers ────────────────────────────────────────────────────────────────
function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── SVG Bar Chart ──────────────────────────────────────────────────────────────
function BarChart({ items }: { items: MarginByCategoryItem[] }) {
  const maxRevenue = Math.max(...items.map(i => i.revenue_cents));
  const BAR_H = 28;
  const GAP = 10;
  const LABEL_W = 90;
  const BAR_W = 340;
  const totalH = items.length * (BAR_H + GAP);

  return (
    <svg viewBox={`0 0 ${LABEL_W + BAR_W + 80} ${totalH}`} aria-label="Margin by category bar chart"
      className="w-full max-w-2xl" style={{ fontFamily: "inherit" }}>
      {items.map((item, i) => {
        const y = i * (BAR_H + GAP);
        const revenueW = (item.revenue_cents / maxRevenue) * BAR_W;
        const marginW = (item.margin_cents / maxRevenue) * BAR_W;
        return (
          <g key={item.category}>
            <text x={LABEL_W - 6} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {item.category}
            </text>
            {/* Revenue bar (background) */}
            <rect x={LABEL_W} y={y} width={revenueW} height={BAR_H} rx="4" fill="#e2e8f0" />
            {/* Margin bar (overlay) */}
            <rect x={LABEL_W} y={y} width={marginW} height={BAR_H} rx="4" fill="#3b82f6" />
            {/* Margin pct label */}
            <text x={LABEL_W + revenueW + 6} y={y + BAR_H / 2 + 4} fontSize="11" fill="#475569" fontWeight="600">
              {item.margin_pct.toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Sort helper ────────────────────────────────────────────────────────────────
type SortKey = "units_sold" | "revenue_cents" | "margin_cents" | "margin_pct";
type SortDir = "asc" | "desc";

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const role = getUser()?.role ?? "cashier";
  const allowed = role === "owner" || role === "manager";

  const [range, setRange] = useState<Range>("30d");
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");

  // Overview
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  // Sales by Product
  const [salesByProduct, setSalesByProduct] = useState<SalesByProductItem[]>([]);
  const [sbpSort, setSbpSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "revenue_cents", dir: "desc" });

  // Margin by Category
  const [marginByCategory, setMarginByCategory] = useState<MarginByCategoryItem[]>([]);

  // Inventory Valuation
  const [invValRows, setInvValRows] = useState<InventoryValuationRow[]>([]);
  const [invValTotal, setInvValTotal] = useState({ cost: 0, retail: 0 });

  // Low Stock
  const [lowStock, setLowStock] = useState<InventoryLevel[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Schedule report
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedEmail, setSchedEmail] = useState("");
  const [schedFreq, setSchedFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [scheduling, setScheduling] = useState(false);
  const [schedMsg, setSchedMsg] = useState<string | null>(null);

  const loadTab = useCallback(async (tab: ReportTab, r: Range) => {
    if (!allowed) return;
    setLoading(true); setError(null);
    try {
      if (tab === "overview") {
        const [s, tp] = await Promise.all([
          apiGet<SalesSummary>(`/api/v1/reports/summary?range=${r}`),
          apiGet<TopProductsResponse>(`/api/v1/reports/top-products?range=${r}&limit=4`),
        ]);
        setSummary(s); setTopProducts(tp.items);
      } else if (tab === "sales-by-product") {
        const d = await apiGet<SalesByProductResponse>(`/api/v1/reports/sales-by-product?range=${r}`);
        setSalesByProduct(d.items);
      } else if (tab === "margin") {
        const d = await apiGet<MarginByCategoryResponse>(`/api/v1/reports/margin-by-category?range=${r}`);
        setMarginByCategory(d.items);
      } else if (tab === "inventory") {
        const d = await apiGet<{ rows: InventoryValuationRow[]; totalCostCents: number; totalRetailCents: number }>("/api/v1/reports/inventory-valuation");
        setInvValRows(d.rows); setInvValTotal({ cost: d.totalCostCents, retail: d.totalRetailCents });
      } else if (tab === "low-stock") {
        const d = await apiGet<{ items: InventoryLevel[] }>("/api/v1/inventory/levels?lowStock=true");
        setLowStock(d.items.filter(i => i.lowStock));
      }
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => { void loadTab(activeTab, range); }, [activeTab, range, loadTab]);

  const scheduleReport = async () => {
    if (!schedEmail.trim()) return;
    setScheduling(true); setSchedMsg(null);
    try {
      await apiPost("/api/v1/insights/scheduled-reports", { email: schedEmail.trim(), frequency: schedFreq, range });
      setSchedMsg(`Scheduled ${schedFreq} report to ${schedEmail.trim()}`);
      setSchedEmail("");
    } catch { setSchedMsg("Could not schedule report."); }
    finally { setScheduling(false); }
  };

  // ── CSV exports ──────────────────────────────────────────────────────────────
  const exportOverview = () => {
    if (!summary) return;
    downloadCsv(`report-overview-${range}.csv`, [
      ["Metric", "Value"],
      ["Gross Revenue", formatMoney(summary.revenue?.grossCents ?? 0)],
      ["Net Revenue", formatMoney(summary.revenue?.netCents ?? 0)],
      ["Tax", formatMoney(summary.revenue?.taxCents ?? 0)],
      ["Total Orders", String(summary.orders?.total ?? 0)],
      ["Completed Orders", String(summary.orders?.completed ?? 0)],
    ]);
  };

  const exportSalesByProduct = () => {
    downloadCsv(`sales-by-product-${range}.csv`, [
      ["Product", "SKU", "Category", "Units Sold", "Revenue", "Cost", "Margin $", "Margin %"],
      ...salesByProduct.map(i => [
        i.product_name, i.sku ?? "", i.category ?? "",
        String(i.units_sold), formatMoney(i.revenue_cents), formatMoney(i.cost_cents),
        formatMoney(i.margin_cents), `${i.margin_pct.toFixed(1)}%`,
      ]),
    ]);
  };

  const exportMargin = () => {
    downloadCsv(`margin-by-category-${range}.csv`, [
      ["Category", "Revenue", "Cost", "Margin $", "Margin %"],
      ...marginByCategory.map(i => [
        i.category, formatMoney(i.revenue_cents), formatMoney(i.cost_cents),
        formatMoney(i.margin_cents), `${i.margin_pct.toFixed(1)}%`,
      ]),
    ]);
  };

  const exportInventory = () => {
    downloadCsv("inventory-valuation.csv", [
      ["Product", "On Hand", "Unit Cost", "Unit Retail", "Cost Value", "Retail Value"],
      ...invValRows.map(r => [
        r.name, String(r.stockQty), formatMoney(r.costCents), formatMoney(r.retailCents),
        formatMoney(r.costValueCents), formatMoney(r.retailValueCents),
      ]),
    ]);
  };

  const exportLowStock = () => {
    downloadCsv("low-stock.csv", [
      ["Product", "SKU", "Category", "On Hand", "Reorder Point", "Price"],
      ...lowStock.map(i => [
        i.name, i.sku, i.category, String(i.onHand), String(i.reorderPoint), formatMoney(i.priceCents),
      ]),
    ]);
  };

  // ── Sorted Sales by Product ──────────────────────────────────────────────────
  const sortedSbp = [...salesByProduct].sort((a, b) => {
    const aVal = a[sbpSort.key]; const bVal = b[sbpSort.key];
    return sbpSort.dir === "desc" ? bVal - aVal : aVal - bVal;
  });

  const toggleSort = (key: SortKey) => {
    setSbpSort(prev => prev.key === key
      ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
      : { key, dir: "desc" });
  };

  const sortIcon = (key: SortKey) => sbpSort.key !== key ? " ↕" : sbpSort.dir === "desc" ? " ↓" : " ↑";

  const tabs: Array<{ key: ReportTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "sales-by-product", label: "Sales by Product" },
    { key: "margin", label: "Margin by Category" },
    { key: "inventory", label: "Inventory Valuation" },
    { key: "low-stock", label: "Low Stock" },
  ];

  const rangeLabel: Record<Range, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" };

  return (
    <EnterpriseShell active="reports" title="Reports" subtitle="Analytics &amp; performance"
      contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">

        {!allowed ? (
          <Card><p role="alert" className="text-sm text-slate-700">You don&apos;t have access to reports. Ask an owner or manager.</p></Card>
        ) : (
          <>
            {/* Header toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold text-slate-950">Reporting Center</h1>
                <p className="mt-0.5 text-sm text-slate-500">Operational reporting across sales, inventory, and margins.</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Range picker */}
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                  {(["7d", "30d", "90d"] as Range[]).map(r => (
                    <button key={r} type="button" onClick={() => setRange(r)}
                      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${range === r ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                      {rangeLabel[r]}
                    </button>
                  ))}
                </div>
                <Button variant="secondary" size="sm" onClick={() => { setShowSchedule(v => !v); setSchedMsg(null); }}>
                  Schedule
                </Button>
              </div>
            </div>

            {/* Schedule panel */}
            {showSchedule && (
              <Card>
                <h2 className="text-sm font-semibold text-slate-900 mb-3">Schedule recurring report</h2>
                {schedMsg && <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2 mb-3">{schedMsg}</p>}
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                    <input type="email" value={schedEmail} onChange={e => setSchedEmail(e.target.value)}
                      placeholder="owner@company.com"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none w-56" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Frequency</label>
                    <select value={schedFreq} onChange={e => setSchedFreq(e.target.value as "daily"|"weekly"|"monthly")}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <Button size="sm" variant="primary" loading={scheduling} disabled={!schedEmail.trim()} onClick={() => void scheduleReport()}>Schedule</Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowSchedule(false)}>Cancel</Button>
                </div>
              </Card>
            )}

            {/* Report tabs */}
            <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
              {tabs.map(tab => (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                  className={["whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                    activeTab === tab.key
                      ? "border-slate-950 text-slate-950"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
                  ].join(" ")}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Error */}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

            {/* ── Overview ─────────────────────────────────────────────────────── */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button variant="secondary" size="sm" disabled={!summary} onClick={exportOverview}>Export CSV</Button>
                </div>
                {loading ? <p className="text-sm text-slate-500">Loading…</p>
                  : summary ? <ReportsDashboard summary={summary} topProducts={topProducts} />
                  : null}
              </div>
            )}

            {/* ── Sales by Product ─────────────────────────────────────────────── */}
            {activeTab === "sales-by-product" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Top {sortedSbp.length} products · {rangeLabel[range]}</p>
                  <Button variant="secondary" size="sm" disabled={salesByProduct.length === 0} onClick={exportSalesByProduct}>Export CSV</Button>
                </div>
                <Card className="overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-800 select-none" onClick={() => toggleSort("units_sold")}>Units{sortIcon("units_sold")}</th>
                          <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-800 select-none" onClick={() => toggleSort("revenue_cents")}>Revenue{sortIcon("revenue_cents")}</th>
                          <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-800 select-none" onClick={() => toggleSort("margin_cents")}>Margin ${sortIcon("margin_cents")}</th>
                          <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-800 select-none" onClick={() => toggleSort("margin_pct")}>Margin %{sortIcon("margin_pct")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
                        {!loading && sortedSbp.map((item, idx) => (
                          <tr key={item.product_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{item.product_name}</td>
                            <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.sku ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-500">{item.category ?? "—"}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{item.units_sold.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(item.revenue_cents)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-green-700">{formatMoney(item.margin_cents)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${item.margin_pct >= 40 ? "bg-green-100 text-green-700" : item.margin_pct >= 25 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                                {item.margin_pct.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* ── Margin by Category ───────────────────────────────────────────── */}
            {activeTab === "margin" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Gross margin by category · {rangeLabel[range]}</p>
                  <Button variant="secondary" size="sm" disabled={marginByCategory.length === 0} onClick={exportMargin}>Export CSV</Button>
                </div>
                {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <Card>
                      <h2 className="mb-4 text-sm font-semibold text-slate-900">Revenue vs Margin (blue = margin)</h2>
                      <BarChart items={[...marginByCategory].sort((a, b) => b.revenue_cents - a.revenue_cents)} />
                    </Card>
                    <Card className="overflow-hidden p-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <th className="px-4 py-3">Category</th>
                            <th className="px-4 py-3 text-right">Revenue</th>
                            <th className="px-4 py-3 text-right">Cost</th>
                            <th className="px-4 py-3 text-right">Margin</th>
                            <th className="px-4 py-3 text-right">Margin %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {[...marginByCategory].sort((a, b) => b.margin_cents - a.margin_cents).map(item => (
                            <tr key={item.category} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-900">{item.category}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{formatMoney(item.revenue_cents)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-500">{formatMoney(item.cost_cents)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-green-700 font-medium">{formatMoney(item.margin_cents)}</td>
                              <td className="px-4 py-3 text-right">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${item.margin_pct >= 40 ? "bg-green-100 text-green-700" : item.margin_pct >= 25 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                                  {item.margin_pct.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {/* ── Inventory Valuation ──────────────────────────────────────────── */}
            {activeTab === "inventory" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Current on-hand cost and retail value</p>
                  <Button variant="secondary" size="sm" disabled={invValRows.length === 0} onClick={exportInventory}>Export CSV</Button>
                </div>
                {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
                  <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      {[
                        { label: "Total Cost Value", value: formatMoney(invValTotal.cost) },
                        { label: "Total Retail Value", value: formatMoney(invValTotal.retail) },
                        { label: "Potential Margin", value: formatMoney(invValTotal.retail - invValTotal.cost) },
                        { label: "SKUs Tracked", value: String(invValRows.length) },
                      ].map(s => (
                        <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</p>
                          <p className="mt-1 text-xl font-bold text-slate-950 tabular-nums">{s.value}</p>
                        </div>
                      ))}
                    </div>
                    <Card className="overflow-hidden p-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <th className="px-4 py-3">Product</th>
                            <th className="px-4 py-3 text-right">On Hand</th>
                            <th className="px-4 py-3 text-right">Unit Cost</th>
                            <th className="px-4 py-3 text-right">Unit Retail</th>
                            <th className="px-4 py-3 text-right">Cost Value</th>
                            <th className="px-4 py-3 text-right">Retail Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {invValRows.map(row => (
                            <tr key={row.productId} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{row.stockQty}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-500">{formatMoney(row.costCents)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-500">{formatMoney(row.retailCents)}</td>
                              <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(row.costValueCents)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-blue-700 font-medium">{formatMoney(row.retailValueCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  </>
                )}
              </div>
            )}

            {/* ── Low Stock ────────────────────────────────────────────────────── */}
            {activeTab === "low-stock" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{lowStock.length} SKU{lowStock.length !== 1 ? "s" : ""} at or below reorder point</p>
                  <Button variant="secondary" size="sm" disabled={lowStock.length === 0} onClick={exportLowStock}>Export CSV</Button>
                </div>
                {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
                  <Card className="overflow-hidden p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3 text-right">On Hand</th>
                          <th className="px-4 py-3 text-right">Reorder Pt</th>
                          <th className="px-4 py-3 text-right">Retail Price</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lowStock.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">All products are well-stocked.</td></tr>}
                        {lowStock.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.sku}</td>
                            <td className="px-4 py-3 text-slate-500">{item.category}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800">{item.onHand}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-500">{item.reorderPoint}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{formatMoney(item.priceCents)}</td>
                            <td className="px-4 py-3">
                              {item.onHand === 0
                                ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Out of stock</span>
                                : <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">Low stock</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </EnterpriseShell>
  );
}
