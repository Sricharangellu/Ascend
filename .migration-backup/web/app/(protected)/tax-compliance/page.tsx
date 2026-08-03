"use client";

/**
 * /tax-compliance — Tax rates, MSA reporting, and industry compliance.
 * Tabs: Tax Rates | MSA Reporting | Customer Exemptions
 *
 * Industry-specific: tobacco, vapor, and hemp distribution businesses.
 * MSA = Master Settlement Agreement (tobacco manufacturer reporting obligation).
 */

import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { apiGet, apiPost } from "@/api-client/client";
import { useToast } from "@/components/Toast";
import { getUser } from "@/lib/auth";

type Tab = "tax-rates" | "msa-reporting" | "exemptions";

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  tax_class: string;
  state: string | null;
  is_active: boolean;
}

const MSA_SAMPLE = [
  { customer: "Gulf Coast Tobacco", msaCategory: "Cigarettes", product: "Marlboro Red 100s", upc: "028200001234", qty: 142, unitPrice: 42.50, total: 6035.00 },
  { customer: "Southwest Distribution", msaCategory: "Cigarettes", product: "Newport Box 100s", upc: "028200003456", qty: 98, unitPrice: 43.00, total: 4214.00 },
  { customer: "Metro Supply Co.", msaCategory: "Cigars", product: "Swisher Sweets Cigarillo", upc: "028200007890", qty: 65, unitPrice: 22.00, total: 1430.00 },
  { customer: "Acme Wholesale Inc.", msaCategory: "Cigarettes", product: "Camel Filter King", upc: "028200004567", qty: 54, unitPrice: 40.50, total: 2187.00 },
  { customer: "Gulf Coast Tobacco", msaCategory: "Vapor", product: "JUUL Virginia Tobacco Pods", upc: "028200012345", qty: 48, unitPrice: 15.99, total: 767.52 },
];

const STATE_TAX_INFO = [
  { state: "California", types: ["Sales Tax (7.25%)", "Tobacco Excise", "Vapor Tax (65% wholesale)"] },
  { state: "New York", types: ["Sales Tax (4%)", "Cigarette Tax ($4.35/pack)", "Vapor Tax (20% retail)"] },
  { state: "Texas", types: ["Sales Tax (6.25%)", "Tobacco Excise ($1.41/pack)"] },
  { state: "Florida", types: ["Sales Tax (6%)", "Tobacco Surcharge"] },
  { state: "Illinois", types: ["Sales Tax (6.25%)", "Tobacco Products Tax (36% wholesale)", "Vapor Tax (15% wholesale)"] },
  { state: "Minnesota", types: ["Sales Tax (6.875%)", "Tobacco Tax (95% wholesale)", "Vapor Tax (95% wholesale)"] },
];

const MSA_CATEGORIES = ["Cigarettes", "Cigars", "Smokeless Tobacco", "Roll-Your-Own", "Vapor", "Hemp/CBD"];
const TAX_CLASS_BADGE: Record<string, "green" | "yellow" | "gray"> = { standard: "green", exempt: "gray", tobacco: "yellow", vapor: "yellow" };

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "tax-rates", label: "Tax Rates" },
  { key: "msa-reporting", label: "MSA Reporting" },
  { key: "exemptions", label: "Customer Exemptions" },
];

export default function TaxCompliancePage() {
  const [tab, setTab] = useState<Tab>("tax-rates");
  const user = getUser();
  const canManage = user?.role === "owner" || user?.role === "manager";
  const { addToast } = useToast();

  const [rates, setRates] = useState<TaxRate[]>([]);
  const [loadingRates, setLoadingRates] = useState(true);
  const [showAddRate, setShowAddRate] = useState(false);
  const [rateForm, setRateForm] = useState({ name: "", rate: "", taxClass: "standard", state: "" });
  const [savingRate, setSavingRate] = useState(false);
  const [msaPeriod, setMsaPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [msaFilter, setMsaFilter] = useState("all");

  const loadRates = useCallback(() => {
    setLoadingRates(true);
    apiGet<{ items: TaxRate[] }>("/api/v1/settings/tax-rates")
      .then((r) => setRates(r.items ?? []))
      .catch(() => setRates([]))
      .finally(() => setLoadingRates(false));
  }, []);

  useEffect(() => { loadRates(); }, [loadRates]);

  const addRate = async () => {
    const pct = parseFloat(rateForm.rate);
    if (!rateForm.name.trim() || isNaN(pct)) return;
    setSavingRate(true);
    try {
      await apiPost("/api/v1/settings/tax-rates", { name: rateForm.name.trim(), rate: pct / 100, taxClass: rateForm.taxClass, state: rateForm.state.trim() || null });
      setShowAddRate(false); setRateForm({ name: "", rate: "", taxClass: "standard", state: "" }); loadRates();
      addToast({ title: "Tax rate added", variant: "success" });
    } catch (e) { addToast({ title: "Failed", description: e instanceof Error ? e.message : undefined, variant: "error" });
    } finally { setSavingRate(false); }
  };

  const filteredMsa = msaFilter === "all" ? MSA_SAMPLE : MSA_SAMPLE.filter(r => r.msaCategory === msaFilter);
  const msaTotalQty = filteredMsa.reduce((s, r) => s + r.qty, 0);
  const msaTotalAmt = filteredMsa.reduce((s, r) => s + r.total, 0);

  return (
    <EnterpriseShell active="tax-compliance" title="Tax & Compliance" subtitle="Tax rates, MSA reporting, and industry compliance rules">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <div className="flex border-b border-slate-200 mb-5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "tax-rates" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Tax Rates</h2>
                <p className="text-sm text-slate-500">Configure sales tax, excise, and special rates by product class and state.</p>
              </div>
              {canManage && <Button variant="primary" size="sm" onClick={() => setShowAddRate(true)}>+ Add Rate</Button>}
            </div>

            {showAddRate && (
              <Card>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                    <input value={rateForm.name} onChange={e => setRateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. CA Sales Tax" className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-600 mb-1">Rate %</label>
                    <input type="number" step="0.01" value={rateForm.rate} onChange={e => setRateForm(f => ({ ...f, rate: e.target.value }))} placeholder="7.25" className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-600 mb-1">Class</label>
                    <select value={rateForm.taxClass} onChange={e => setRateForm(f => ({ ...f, taxClass: e.target.value }))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
                      <option value="standard">Standard</option><option value="exempt">Exempt</option><option value="tobacco">Tobacco</option><option value="vapor">Vapor</option>
                    </select></div>
                  <div><label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                    <input value={rateForm.state} onChange={e => setRateForm(f => ({ ...f, state: e.target.value }))} placeholder="CA" maxLength={2} className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" /></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="primary" size="sm" loading={savingRate} onClick={() => void addRate()}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddRate(false)}>Cancel</Button>
                </div>
              </Card>
            )}

            <Card noPadding>
              {loadingRates ? <div className="space-y-2 p-4">{[...Array(3)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />)}</div>
                : rates.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-sm text-slate-500">No tax rates configured.</p>
                    {canManage && <button onClick={() => setShowAddRate(true)} className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700">Add your first rate</button>}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      <th className="px-4 py-3">Name</th><th className="px-4 py-3 text-right">Rate</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {rates.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">{(Number(r.rate) * 100).toFixed(2)}%</td>
                          <td className="px-4 py-3"><Badge variant={TAX_CLASS_BADGE[r.tax_class] ?? "gray"}>{r.tax_class}</Badge></td>
                          <td className="px-4 py-3 text-slate-500">{r.state ?? "—"}</td>
                          <td className="px-4 py-3"><Badge variant={r.is_active ? "green" : "gray"}>{r.is_active ? "Active" : "Inactive"}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </Card>

            <Card title="State Tax Reference">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {STATE_TAX_INFO.map(s => (
                  <div key={s.state} className="rounded-md border border-slate-200 p-3">
                    <p className="font-semibold text-sm text-slate-900 mb-1">{s.state}</p>
                    <ul className="space-y-0.5">{s.types.map(t => <li key={t} className="text-xs text-slate-500">• {t}</li>)}</ul>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "msa-reporting" && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-end gap-3 flex-wrap">
                <div><label className="block text-xs font-medium text-slate-600 mb-1">Report Period</label>
                  <input type="month" value={msaPeriod} onChange={e => setMsaPeriod(e.target.value)} className="h-9 px-3 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:border-brand-500" /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">MSA Category</label>
                  <select value={msaFilter} onChange={e => setMsaFilter(e.target.value)} className="h-9 px-3 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:border-brand-500">
                    <option value="all">All Categories</option>
                    {MSA_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div className="flex gap-2 ml-auto">
                  <Button variant="primary" size="sm" onClick={() => addToast({ title: "Report generated", variant: "success" })}>Generate Report</Button>
                  <Button variant="secondary" size="sm" onClick={() => addToast({ title: "Exporting…", variant: "info" })}>Export CSV</Button>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[{ label: "Total Quantity", value: `${msaTotalQty.toLocaleString()} units` }, { label: "Total Sales Amount", value: `$${msaTotalAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}` }, { label: "Customers Reported", value: String(new Set(filteredMsa.map(r => r.customer)).size) }]
                .map(k => (<Card key={k.label}><p className="text-xs text-slate-500">{k.label}</p><p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{k.value}</p></Card>))}
            </div>

            <Card noPadding>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <th className="px-4 py-3 text-left">Customer</th><th className="px-4 py-3 text-left">MSA Category</th><th className="px-4 py-3 text-left">Product</th><th className="px-4 py-3 text-left font-mono">UPC</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Unit Price</th><th className="px-4 py-3 text-right">Total</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMsa.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{row.customer}</td>
                        <td className="px-4 py-3"><span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">{row.msaCategory}</span></td>
                        <td className="px-4 py-3 text-slate-700">{row.product}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.upc}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{row.qty}</td>
                        <td className="px-4 py-3 text-right tabular-nums">${row.unitPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">${row.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-amber-700">Validation Results</h3>
                <Badge variant="yellow">1 issue</Badge>
              </div>
              <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
                <span>Missing tobacco license for: <strong>Metro Supply Co.</strong></span>
                <button className="text-xs font-medium text-brand-600 hover:underline ml-4">Fix →</button>
              </div>
            </Card>
          </div>
        )}

        {tab === "exemptions" && (
          <Card>
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-slate-700">Customer Tax Exemptions</h3>
              <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">Manage resale certificates, tax-exempt status, and exemption documentation per customer. Coming in a future release.</p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
                {["Resale certificates", "State tax exemptions", "Hemp/CBD license tracking"].map(item => (
                  <div key={item} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">○ {item}</div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </EnterpriseShell>
  );
}
