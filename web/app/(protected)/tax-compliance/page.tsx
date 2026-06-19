"use client";

/**
 * /tax-compliance — Tax rate management + compliance rules for tobacco/vapor/hemp.
 *
 * Three sections:
 *  1. Tax Rates — table with add-rate form
 *  2. Tobacco & Vapor — informational placeholder
 *  3. MSA Reporting — placeholder
 */

import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { apiGet, apiPost } from "@/api-client/client";
import { useToast } from "@/components/Toast";

interface TaxRate {
  id: string;
  name: string;
  /** rate_bps: basis points (e.g. 850 = 8.5%) */
  rate_bps?: number;
  /** Fallback if backend sends "rate" as a decimal (0.085) */
  rate?: number;
  tax_class?: string;
  apply_to_category?: string | null;
  state: string | null;
  is_active?: boolean;
  active?: number;
}

const CLASS_BADGE: Record<string, "green" | "blue" | "red" | "yellow" | "gray"> = {
  standard: "green",
  exempt: "gray",
  tobacco: "red",
  vapor: "yellow",
  hemp: "blue",
};

const TOBACCO_STATES = [
  "CA – 59.27% wholesale excise",
  "NY – $5.35/pack cigarette tax",
  "FL – 33.9% net wholesale price",
  "TX – $1.41/pack + 1¢/cigarette",
  "IL – 99¢/pack cigarette tax",
  "CO – 50% wholesale for vapor",
  "MA – 40% wholesale excise",
  "WA – 95.25¢/unit vapor tax",
];

function formatRate(rate: TaxRate): string {
  if (rate.rate_bps !== undefined) {
    return `${(rate.rate_bps / 100).toFixed(2)}%`;
  }
  if (rate.rate !== undefined) {
    return `${(rate.rate * 100).toFixed(2)}%`;
  }
  return "—";
}

function isActive(rate: TaxRate): boolean {
  if (rate.is_active !== undefined) return rate.is_active;
  if (rate.active !== undefined) return rate.active === 1;
  return true;
}

export default function TaxCompliancePage() {
  const { addToast } = useToast();

  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);

  // Add rate form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formRate, setFormRate] = useState("");
  const [formClass, setFormClass] = useState("standard");
  const [formState, setFormState] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: TaxRate[] }>("/api/v1/settings/tax-rates")
      .then(r => setTaxRates(r.items ?? []))
      .catch(() => {
        // Graceful empty state on 404 or other errors
        setTaxRates([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddRate = async () => {
    if (!formName.trim()) {
      addToast({ title: "Rate name is required", variant: "error" });
      return;
    }
    const pct = parseFloat(formRate);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      addToast({ title: "Enter a valid rate (0–100)", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/v1/settings/tax-rates", {
        name: formName.trim(),
        rateBps: Math.round(pct * 100),
        taxClass: formClass,
        state: formState.trim() || null,
      });
      setFormName("");
      setFormRate("");
      setFormClass("standard");
      setFormState("");
      setShowForm(false);
      load();
      addToast({ title: "Tax rate added", variant: "success" });
    } catch (e) {
      addToast({
        title: "Failed to add tax rate",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <EnterpriseShell
      active="tax-compliance"
      title="Tax Compliance"
      subtitle="Tax rate management and compliance rules for tobacco, vapor, and hemp"
    >
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">

          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Tax Rates table */}
            <div className="rounded-md border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h3 className="text-base font-semibold text-slate-950">Tax Rates</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowForm(v => !v)}
                >
                  {showForm ? "Cancel" : "Add Rate"}
                </Button>
              </div>
              {/* Inline add form */}
              {showForm && (
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Name
                      </label>
                      <input
                        type="text"
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        placeholder="e.g. CA Sales Tax"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Rate (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={formRate}
                        onChange={e => setFormRate(e.target.value)}
                        placeholder="8.25"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Class
                      </label>
                      <select
                        value={formClass}
                        onChange={e => setFormClass(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      >
                        <option value="standard">Standard</option>
                        <option value="exempt">Exempt</option>
                        <option value="tobacco">Tobacco</option>
                        <option value="vapor">Vapor</option>
                        <option value="hemp">Hemp</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        State (optional)
                      </label>
                      <input
                        type="text"
                        value={formState}
                        onChange={e => setFormState(e.target.value)}
                        placeholder="CA"
                        maxLength={2}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={saving}
                      disabled={saving}
                      onClick={() => void handleAddRate()}
                    >
                      Save Rate
                    </Button>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="space-y-2 p-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
                  ))}
                </div>
              ) : taxRates.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-400">
                  No tax rates configured. Add one above.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3 text-right">Rate</th>
                      <th className="px-4 py-3 hidden sm:table-cell">State</th>
                      <th className="px-4 py-3">Class</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {taxRates.map(rate => (
                      <tr key={rate.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{rate.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                          {formatRate(rate)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                          {rate.state ?? "All"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              CLASS_BADGE[
                                rate.tax_class ?? rate.apply_to_category ?? "standard"
                              ] ?? "gray"
                            }
                          >
                            {rate.tax_class ?? rate.apply_to_category ?? "standard"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={isActive(rate) ? "green" : "gray"}>
                            {isActive(rate) ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>

          {/* ── Right sidebar ────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Tobacco & Vapor placeholder */}
            <Card title="Tobacco & Vapor">
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  State-specific tobacco excise, vapor tax, and hemp license rules.
                  Configuration coming soon.
                </p>
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-700 mb-2">
                    States with specific rates
                  </p>
                  <ul className="space-y-1">
                    {TOBACCO_STATES.map(state => (
                      <li key={state} className="text-xs text-amber-800 flex items-start gap-1.5">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                        {state}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
                  <p className="text-xs font-medium text-slate-500">
                    Full configuration panel coming in a future sprint
                  </p>
                </div>
              </div>
            </Card>

            {/* MSA Reporting placeholder */}
            <Card title="MSA Reporting">
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  MSA (Master Settlement Agreement) reporting for tobacco manufacturers.
                  Coming soon.
                </p>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1.5">
                    Planned features
                  </p>
                  <ul className="space-y-1">
                    {[
                      "Participating manufacturer tracking",
                      "Non-PM deposit calculator",
                      "State escrow requirements",
                      "Annual volume reporting",
                      "Certificate of compliance",
                    ].map(item => (
                      <li key={item} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>

          </div>
        </div>
      </div>
    </EnterpriseShell>
  );
}
