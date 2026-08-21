"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { TableSkeleton } from "@/components/TableSkeleton";
import { formatMoney } from "@/lib/money";
import { AdjustModal } from "./AdjustModal";
import { MovementsDrawer } from "./MovementsDrawer";
import { ListControls, FilterField, filterControlClass, type ListSearchField } from "@/components/ListControls";
import { ClockIcon, Detail, LedgerStatus } from "./ui";
import { DataTable, type DataColumn } from "@/components/DataTable";
import {
  formatCost,
  formatMargin,
  formatVelocity,
  type InventoryRow,
  type StockStatusFilter,
} from "./shared";

/** Columns a ledger search can be scoped to. Filters rows already loaded in full. */
const LEDGER_SEARCH_FIELDS: ListSearchField[] = [
  { value: "all", label: "All columns" },
  { value: "name", label: "Product name" },
  { value: "sku", label: "SKU" },
];

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
  const [searchField, setSearchField] = useState("all");
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
      // Scoped search narrows which column is compared. These rows are already
      // loaded in full by the parent, so the scope covers the whole ledger.
      const fields: Record<string, string> = { name: row.name, sku: row.sku };
      const haystack = searchField === "all" ? Object.values(fields) : [fields[searchField] ?? ""];
      const matchesQuery =
        normalizedQuery.length === 0 || haystack.some((v) => v.toLowerCase().includes(normalizedQuery));
      const matchesCategory = ledgerCategory === "All" || row.category === ledgerCategory;
      const matchesStatus = ledgerStatus === "All" || row.stockStatus === ledgerStatus;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [rows, ledgerQuery, searchField, ledgerCategory, ledgerStatus]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.sku === selectedSku) ?? filteredRows[0] ?? null,
    [rows, selectedSku, filteredRows],
  );


  /**
   * Ledger columns. Sorting is client-side (`sortValue`) and correct here: the
   * parent loads the whole ledger, so a header click reorders every row rather
   * than a page — unlike the product list, which is server-paginated.
   */
  const ledgerColumns: DataColumn<InventoryRow>[] = [
    {
      key: "sku", header: "SKU", hideable: false, sticky: true,
      sortValue: (r) => r.sku,
      render: (r) => (
        <button
          type="button"
          onClick={() => setSelectedSku(r.sku)}
          className="focus-ring rounded-control font-mono text-xs font-semibold text-content-primary underline-offset-2 hover:underline"
        >
          {r.sku}
        </button>
      ),
    },
    { key: "name", header: "Product", sortValue: (r) => r.name, minWidth: "180px",
      render: (r) => <span className="font-medium text-content-primary">{r.name}</span> },
    { key: "category", header: "Category", sortValue: (r) => r.category,
      render: (r) => <span className="text-content-secondary">{r.category}</span> },
    { key: "available", header: "Available", numeric: true, sortValue: (r) => r.available,
      render: (r) => <span className="font-semibold text-content-primary">{r.available}</span> },
    { key: "onHand", header: "On hand", numeric: true, sortValue: (r) => r.onHand,
      render: (r) => <span className="text-content-secondary">{r.onHand}</span> },
    { key: "committed", header: "Committed", numeric: true, sortValue: (r) => r.committed,
      render: (r) => <span className="text-content-secondary">{r.committed}</span> },
    { key: "cost", header: "Avg cost", numeric: true, sortValue: (r) => r.costCents,
      render: (r) => <span className="text-content-secondary">{formatCost(r.costCents)}</span> },
    { key: "margin", header: "Margin", numeric: true,
      sortValue: (r) => (r.priceCents && r.costCents ? r.priceCents - r.costCents : null),
      render: (r) => <span className="text-content-secondary">{formatMargin(r.priceCents, r.costCents)}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.stockStatus,
      render: (r) => <LedgerStatus label={r.stockStatus} /> },
    {
      key: "actions", header: "Actions", hideable: false,
      render: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="secondary"
            onClick={() => setAdjustProduct({ id: r.id, name: r.name, sku: r.sku, onHand: r.onHand })}>
            Adjust
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => setMovementsProduct({ id: r.id, name: r.name, sku: r.sku })}
            aria-label={`View movement history for ${r.name}`}>
            <ClockIcon />
            History
          </Button>
        </div>
      ),
    },
  ];

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

          <div className="border-b border-line bg-surface-2 px-4 py-3">
            <ListControls
              search={ledgerQuery}
              onSearchChange={setLedgerQuery}
              searchPlaceholder="Search inventory by product or SKU…"
              searchLabel="Search inventory"
              searchFields={LEDGER_SEARCH_FIELDS}
              searchField={searchField}
              onSearchFieldChange={setSearchField}
              activeFilterCount={(ledgerCategory !== "All" ? 1 : 0) + (ledgerStatus !== "All" ? 1 : 0)}
              onReset={() => {
                setLedgerQuery("");
                setSearchField("all");
                setLedgerCategory("All");
                setLedgerStatus("All");
              }}
              canReset={ledgerQuery.trim() !== "" || searchField !== "all" || ledgerCategory !== "All" || ledgerStatus !== "All"}
              resultCount={filteredRows.length}
              totalCount={rows.length}
              loading={loading}
              filters={
                <>
                  <FilterField label="Category" htmlFor="ledger-category">
                    <select id="ledger-category" value={ledgerCategory}
                      onChange={(e) => setLedgerCategory(e.target.value)} className={filterControlClass}>
                      {ledgerCategories.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </FilterField>
                  <FilterField label="Stock status" htmlFor="ledger-status">
                    <select id="ledger-status" value={ledgerStatus}
                      onChange={(e) => setLedgerStatus(e.target.value as StockStatusFilter)} className={filterControlClass}>
                      <option value="All">All statuses</option>
                      <option value="Healthy">Healthy</option>
                      <option value="Watch">Watch</option>
                      <option value="Reorder">Reorder</option>
                    </select>
                  </FilterField>
                </>
              }
            />
          </div>

          <DataTable<InventoryRow>
            caption="Inventory ledger: stock on hand, committed quantity, cost and margin per SKU"
            columns={ledgerColumns}
            rows={filteredRows}
            rowKey={(r) => r.sku}
            loading={loading}
            error={error}
            emptyTitle="No inventory rows match the current filters"
            emptyDescription="Try clearing the search or category filter."
            storageKey="inventory-ledger"
            className="px-0"
          />
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
