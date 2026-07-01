"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { apiPatch, ApiResponseError } from "@/api-client/client";
import type { CatalogProduct } from "@/api-client/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const FIELD = "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-[#111] outline-none focus:border-[#5D5FEF] focus:ring-1 focus:ring-[#5D5FEF]";

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-slate-500">{children}</label>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-[#111]">{title}</h3>
      {children}
    </div>
  );
}

function calcPriceFields(retail: number, cost: number) {
  if (retail <= 0) return { markup: 0, margin: 0 };
  const markup = cost > 0 ? ((retail - cost) / cost) * 100 : 0;
  const margin = ((retail - cost) / retail) * 100;
  return { markup, margin };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GeneralTab({
  product,
  onSaved,
}: {
  product: CatalogProduct;
  onSaved: (p: CatalogProduct) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialRetail = product.price_cents / 100;
  const initialCost = (product.raw_cost_price_cents ?? 0) / 100;
  const initialCalc = calcPriceFields(initialRetail, initialCost);

  const [form, setForm] = useState({
    name: product.name,
    brand: product.brand ?? "",
    description: product.description ?? "",
    category: product.category,
    image_url: product.image_url ?? "",
    tax_class: product.tax_class as "standard" | "exempt",
    status: product.status as "active" | "draft" | "archived",
    sell_online: product.status === "active",
    // price
    retail: String(initialRetail.toFixed(2)),
    cost: String(initialCost.toFixed(2)),
    msrp: product.msrp_cents != null ? String((product.msrp_cents / 100).toFixed(2)) : "",
    markup: initialCalc.markup > 0 ? String(initialCalc.markup.toFixed(2)) : "",
    margin: initialCalc.margin > 0 ? String(initialCalc.margin.toFixed(2)) : "",
    // dimensions (stored in mm/g, displayed in in/lb)
    weight: product.weight_grams != null ? String((product.weight_grams / 453.592).toFixed(2)) : "",
    length: product.length_mm != null ? String((product.length_mm / 25.4).toFixed(2)) : "",
    width: product.width_mm != null ? String((product.width_mm / 25.4).toFixed(2)) : "",
    height: product.height_mm != null ? String((product.height_mm / 25.4).toFixed(2)) : "",
  });

  function set<K extends keyof typeof form>(key: K, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
    setError(null);
  }

  function onRetailChange(val: string) {
    const retail = parseFloat(val) || 0;
    const cost = parseFloat(form.cost) || 0;
    const { markup, margin } = calcPriceFields(retail, cost);
    setForm((f) => ({
      ...f,
      retail: val,
      markup: markup > 0 ? markup.toFixed(2) : "",
      margin: margin > 0 ? margin.toFixed(2) : "",
    }));
  }

  function onCostChange(val: string) {
    const cost = parseFloat(val) || 0;
    const retail = parseFloat(form.retail) || 0;
    const { markup, margin } = calcPriceFields(retail, cost);
    setForm((f) => ({
      ...f,
      cost: val,
      markup: markup > 0 ? markup.toFixed(2) : "",
      margin: margin > 0 ? margin.toFixed(2) : "",
    }));
  }

  function onMarkupChange(val: string) {
    const markupPct = parseFloat(val) || 0;
    const cost = parseFloat(form.cost) || 0;
    if (cost > 0) {
      const retail = cost * (1 + markupPct / 100);
      const margin = (markupPct / (1 + markupPct / 100)).toFixed(2);
      setForm((f) => ({ ...f, markup: val, retail: retail.toFixed(2), margin }));
    } else {
      setForm((f) => ({ ...f, markup: val }));
    }
  }

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const retailCents = Math.round((parseFloat(form.retail) || 0) * 100);
      if (retailCents <= 0) throw new Error("Retail price must be greater than 0");
      const updated = await apiPatch<CatalogProduct>(`/api/v1/catalog/${product.id}`, {
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        description: form.description.trim() || undefined,
        category: form.category.trim(),
        image_url: form.image_url.trim() || undefined,
        tax_class: form.tax_class,
        status: form.sell_online ? "active" : form.status,
        price_cents: retailCents,
        msrp_cents: form.msrp ? Math.round(parseFloat(form.msrp) * 100) : undefined,
        raw_cost_price_cents: form.cost ? Math.round(parseFloat(form.cost) * 100) : undefined,
        weight_grams: form.weight ? Math.round(parseFloat(form.weight) * 453.592) : undefined,
        length_mm: form.length ? Math.round(parseFloat(form.length) * 25.4) : undefined,
        width_mm: form.width ? Math.round(parseFloat(form.width) * 25.4) : undefined,
        height_mm: form.height ? Math.round(parseFloat(form.height) * 25.4) : undefined,
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : e instanceof Error ? e.message : "Save failed.");
    } finally { setSaving(false); }
  }

  const marginNum = parseFloat(form.margin) || 0;

  return (
    <div className="space-y-4">

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* ── General Information ────────────────────────────────────────── */}
      <Section title="General Information">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <input className={FIELD} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <Label>Brand</Label>
              <input className={FIELD} value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. Acme" />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <textarea
              rows={3}
              className={FIELD + " resize-none"}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Product description…"
            />
          </div>
          <div>
            <Label>Category</Label>
            <input className={FIELD} value={form.category} onChange={(e) => set("category", e.target.value)} />
          </div>

          {/* Sell toggles */}
          <div className="flex flex-wrap gap-6 pt-1">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-[#5D5FEF] focus:ring-[#5D5FEF]"
                checked={form.status === "active"}
                onChange={(e) => set("status", e.target.checked ? "active" : "draft")}
              />
              <span className="text-sm text-[#111]">Sell on point-of-sale</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-[#5D5FEF] focus:ring-[#5D5FEF]"
                checked={form.sell_online}
                onChange={(e) => setForm((f) => ({ ...f, sell_online: e.target.checked }))}
              />
              <span className="text-sm text-[#111]">Sell online</span>
            </label>
          </div>

          {/* Image */}
          <div>
            <Label>Image URL</Label>
            <input
              type="url"
              className={FIELD}
              value={form.image_url}
              onChange={(e) => set("image_url", e.target.value)}
              placeholder="https://…"
            />
            {form.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.image_url}
                alt="Product preview"
                className="mt-2 h-20 w-20 rounded-lg border border-slate-200 object-cover"
              />
            )}
          </div>
        </div>
      </Section>

      {/* ── Price ─────────────────────────────────────────────────────── */}
      <Section title="Price">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2.5 text-left">Price point</th>
                <th className="px-3 py-2.5 text-right">Supply price</th>
                <th className="px-3 py-2.5 text-right">Markup %</th>
                <th className="px-3 py-2.5 text-right">Margin %</th>
                <th className="px-3 py-2.5 text-right">Retail price (excl. tax)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-50">
                <td className="px-3 py-3 text-slate-500">General Price Book</td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-slate-400">$</span>
                    <input
                      type="number" step="0.01" min="0"
                      className="w-24 rounded border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-[#5D5FEF]"
                      value={form.cost}
                      onChange={(e) => onCostChange(e.target.value)}
                    />
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number" step="0.01" min="0"
                      className="w-20 rounded border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-[#5D5FEF]"
                      value={form.markup}
                      onChange={(e) => onMarkupChange(e.target.value)}
                      placeholder="0.00"
                    />
                    <span className="text-slate-400">%</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right">
                  <span className={`text-sm font-semibold ${marginNum >= 30 ? "text-emerald-600" : marginNum > 0 ? "text-amber-600" : "text-slate-400"}`}>
                    {form.margin ? `${parseFloat(form.margin).toFixed(1)}%` : "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-slate-400">$</span>
                    <input
                      type="number" step="0.01" min="0"
                      className="w-24 rounded border border-slate-200 px-2 py-1.5 text-right text-sm font-semibold outline-none focus:border-[#5D5FEF]"
                      value={form.retail}
                      onChange={(e) => onRetailChange(e.target.value)}
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {form.msrp !== undefined && (
          <div className="mt-3 flex items-center gap-3">
            <Label>MSRP ($)</Label>
            <input
              type="number" step="0.01" min="0"
              className="w-28 rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-[#5D5FEF]"
              value={form.msrp}
              onChange={(e) => set("msrp", e.target.value)}
              placeholder="0.00"
            />
          </div>
        )}
      </Section>

      {/* ── Tax ───────────────────────────────────────────────────────── */}
      <Section title="Tax">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Tax class</Label>
            <select
              className={FIELD}
              value={form.tax_class}
              onChange={(e) => set("tax_class", e.target.value as "standard" | "exempt")}
            >
              <option value="standard">Standard tax rate</option>
              <option value="exempt">Tax exempt</option>
            </select>
          </div>
        </div>
      </Section>

      {/* ── Weight & Dimensions ───────────────────────────────────────── */}
      <Section title="Weight and Dimensions">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["Weight", "weight", "lb"],
            ["Length", "length", "in"],
            ["Width", "width", "in"],
            ["Height", "height", "in"],
          ] as const).map(([label, key, unit]) => (
            <div key={key}>
              <Label>{label} ({unit})</Label>
              <input
                type="number" step="0.01" min="0"
                className={FIELD}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder="0.00"
              />
            </div>
          ))}
        </div>
      </Section>

      {/* ── Save ──────────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3">
        <Button size="sm" variant="primary" loading={saving} onClick={() => void handleSave()}>
          Save
        </Button>
      </div>

    </div>
  );
}
