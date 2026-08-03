"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { TableSkeleton } from "@/components/TableSkeleton";
import { formatMoney } from "@/lib/money";
import { AdjustModal } from "./AdjustModal";
import { MovementsDrawer } from "./MovementsDrawer";
import { ClockIcon, Detail, LedgerStatus } from "./ui";
import {
  formatCost,
  formatMargin,
  formatVelocity,
  type InventoryRow,
  type StockStatusFilter,
} from "./shared";

export function LedgerTab({
  rows,
  loading,
  error,
  invalidateLedger,
}: {
  rows: InventoryRow[];
  loading: boolean;
  error: string | null;
  invalidateLedger: () => void;
}) {
  const [ledgerQuery, setLedgerQuery] = useState("");
  const [ledgerCategory, setLedgerCategory] = useState("All");
  const [ledgerStatus, setLedgerStatus] = useState<StockStatusFilter>("All");
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<{ id: string; name: string; sku: string; onHand: number } | null>(null);
  const [movementsProduct, setMovementsProduct] = useState<{ id: string; name: string; sku: string } | null>(null);

  const ledgerCategories = useMemo(
    () => ["All", ...Array.from(new Set(rows.map((row) => row.category))).sort()],
    [rows],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = ledgerQuery.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.sku.toLowerCase().includes(normalizedQuery);
      const matchesCategory = ledgerCategory === "All" || row.category === ledgerCategory;
      const matchesStatus = ledgerStatus === "All" || row.stockStatus === ledgerStatus;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [rows, ledgerQuery, ledgerCategory, ledgerStatus]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.sku === selectedSku) ?? filteredRows[0] ?? null,
    [rows, selectedSku, filteredRows],
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Stock ledger</h2>
              <p className="text-sm text-slate-500">Operational view for counts, receiving, and reorder decisions.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm">Count</Button>
              <Button variant="primary" size="sm">Receive stock</Button>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_10rem]">
            <label className="block">
              <span className="sr-only">Search inventory</span>
              <input
                type="search"
                value={ledgerQuery}
                onChange={(e) => setLedgerQuery(e.target.value)}
                placeholder="Search SKU or product"
                className="min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
              />
            </label>
            <label className="block">
              <span className="sr-only">Filter by category</span>
              <select
                value={ledgerCategory}
                onChange={(e) => setLedgerCategory(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
              >
                {ledgerCategories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="sr-only">Filter by stock status</span>
              <select
                value={ledgerStatus}
                onChange={(e) => setLedgerStatus(e.target.value as StockStatusFilter)}
                className="min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
              >
                <option value="All">All statuses</option>
                <option value="Healthy">Healthy</option>
                <option value="Watch">Watch</option>
                <option value="Reorder">Reorder</option>
              </select>
            </label>
          </div>

          {loading ? (
            <TableSkeleton headers={["SKU", "Product", "Category", "Available", "On hand", "Committed", "Avg cost", "Margin", "Status", "Actions"]} rows={8} />
          ) : error ? (
            <div className="p-6 text-sm text-danger-700" role="alert">{error}</div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">No inventory rows match the current filters.</p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Try clearing the search or category filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Available</th>
                    <th className="px-4 py-3 text-right">On hand</th>
                    <th className="px-4 py-3 text-right">Committed</th>
                    <th className="px-4 py-3 text-right">Avg cost</th>
                    <th className="px-4 py-3 text-right">Margin</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRows.map((row) => (
                    <tr
                      key={row.sku}
                      className={selectedRow?.sku === row.sku ? "bg-slate-100" : "hover:bg-slate-50"}
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedSku(row.sku)}
                          className="font-mono text-xs font-semibold text-slate-900 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-950"
                        >
                          {row.sku}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-950">{row.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.category}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-950">{row.available}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{row.onHand}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{row.committed}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatCost(row.costCents)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatMargin(row.priceCents, row.costCents)}</td>
                      <td className="whitespace-nowrap px-4 py-3"><LedgerStatus label={row.stockStatus} /></td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setAdjustProduct({ id: row.id, name: row.name, sku: row.sku, onHand: row.onHand })}
                            className="inline-flex min-h-[32px] items-center rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950"
                          >
                            Adjust
                          </button>
                          <button
                            type="button"
                            onClick={() => setMovementsProduct({ id: row.id, name: row.name, sku: row.sku })}
                            className="inline-flex min-h-[32px] items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-950"
                            aria-label={`View movement history for ${row.name}`}
                          >
                            <ClockIcon />
                            History
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="h-fit">
          {selectedRow ? (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Selected SKU</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">{selectedRow.name}</h2>
                <p className="font-mono text-xs text-slate-500">{selectedRow.sku}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Detail label="Available" value={String(selectedRow.available)} />
                <Detail label="On hand" value={String(selectedRow.onHand)} />
                <Detail label="Committed" value={String(selectedRow.committed)} />
                <Detail label="Reorder at" value={String(selectedRow.reorderPoint)} />
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Sell price</span>
                  <span className="font-semibold text-slate-950">{formatMoney(selectedRow.priceCents)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Average cost</span>
                  <span className="font-semibold text-slate-950">{formatCost(selectedRow.costCents)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Margin</span>
                  <span className="font-semibold text-slate-950">{formatMargin(selectedRow.priceCents, selectedRow.costCents)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Velocity</span>
                  <span className="font-semibold text-slate-950">{formatVelocity(selectedRow.velocity)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary" size="sm" fullWidth
                  onClick={() => setAdjustProduct({ id: selectedRow.id, name: selectedRow.name, sku: selectedRow.sku, onHand: selectedRow.onHand })}
                >
                  Adjust
                </Button>
                <Button
                  variant="secondary" size="sm" fullWidth
                  onClick={() => setMovementsProduct({ id: selectedRow.id, name: selectedRow.name, sku: selectedRow.sku })}
                >
                  History
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a SKU to inspect stock details.</p>
          )}
        </Card>
      </div>

      {adjustProduct && (
        <AdjustModal
          product={adjustProduct}
          onClose={() => setAdjustProduct(null)}
          onSaved={invalidateLedger}
        />
      )}
      {movementsProduct && (
        <MovementsDrawer
          product={movementsProduct}
          onClose={() => setMovementsProduct(null)}
        />
      )}
    </>
  );
}
