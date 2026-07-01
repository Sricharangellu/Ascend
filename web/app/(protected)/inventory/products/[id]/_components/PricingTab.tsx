"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { formatMoney, formatCentsPlain, parseToCents } from "@/lib/money";
import { apiPatch, ApiResponseError } from "@/api-client/client";
import type { CatalogProduct } from "@/api-client/types";

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none";
const LABEL_CLASS = "block text-sm font-medium text-slate-700 mb-1";

export function PricingTab({
  product,
  onSaved,
}: {
  product: CatalogProduct;
  onSaved: (p: CatalogProduct) => void;
}) {
  const [priceInput, setPriceInput] = useState(formatCentsPlain(product.price_cents));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const priceCents = parseToCents(priceInput);
  const valid = !isNaN(priceCents) && priceCents >= 0;

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await apiPatch<CatalogProduct>(`/api/v1/catalog/${product.id}`, { price_cents: priceCents });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiResponseError ? err.message : "Save failed.");
    } finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card title="Pricing">
        <div className="max-w-xs">
          <label className={LABEL_CLASS}>Sell price (USD)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
            <input
              type="number"
              value={priceInput}
              onChange={(e) => { setPriceInput(e.target.value); setSaved(false); }}
              min={0}
              step="0.01"
              className="w-full rounded-md border border-slate-300 py-2 pl-7 pr-3 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none"
            />
          </div>
          {valid && (
            <p className="mt-1 text-xs text-slate-500">Formatted: {formatMoney(priceCents)}</p>
          )}
        </div>
      </Card>

      <Card title="Cost &amp; margin">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="text-slate-600">
            Avg cost is tracked via purchasing/receiving. View cost and margin on the{" "}
            <Link href="/inventory" className="text-slate-950 underline underline-offset-2">
              Stock ledger
            </Link>
            .
          </p>
        </div>
      </Card>

      {saveError && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">
          {saveError}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700" role="status">
          Price saved.
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="primary" size="md" onClick={() => void handleSave()} loading={saving} disabled={!valid}>
          Save price
        </Button>
      </div>
    </div>
  );
}
