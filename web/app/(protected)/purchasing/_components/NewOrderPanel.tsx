"use client";

/**
 * Create a purchase order: vendor → products → quantities → pricing → terms →
 * review → submit, in one panel without leaving the list.
 *
 * Two deliberate choices:
 *
 * 1. **Products are searched, not enumerated.** The previous form loaded
 *    `/inventory/levels?pageSize=200` into a `<select>`, so product 201 onward
 *    could not be ordered at all and every visit paid for a 200-row payload.
 *    This queries the canonical `/api/v1/search` (name, SKU and barcode) — the
 *    same resolution the command palette uses — instead of a second lookup.
 * 2. **Unit conversion stays on the server.** The pack-size preview here is a
 *    preview; `POST /orders` converts case/box quantities to base units, and the
 *    response's `unitConversions` is what gets reported back as fact.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { formatMoney, parseToCents } from "@/lib/money";
import type {
  CreatePurchaseOrderLineRequest,
  PurchaseOrder,
  Supplier,
} from "@/api-client/types";
import { emptyLine, type DraftLine } from "./shared";

interface ProductBarcode {
  barcode: string;
  kind: string;
  pack_size: number;
}

interface ProductHit {
  id: string;
  label: string;
  sublabel?: string;
}

const UNIT_LABEL: Record<string, string> = {
  each: "Each",
  box: "Box",
  case: "Case",
  pallet: "Pallet",
  alt: "Alternate",
};

export function NewOrderPanel({
  suppliers,
  initialSupplierId = "",
  initialProductId = "",
  onCreated,
}: {
  suppliers: Supplier[];
  initialSupplierId?: string;
  initialProductId?: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(Boolean(initialSupplierId || initialProductId));
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, ProductBarcode[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string[] | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (initialSupplierId) setSupplierId(initialSupplierId);
  }, [initialSupplierId]);

  useEffect(() => {
    if (!supplierId && suppliers.length > 0) setSupplierId(suppliers[0]!.id);
  }, [suppliers, supplierId]);

  // Deep-linked from a vendor or product page: seed the first line so the user
  // lands mid-task instead of re-selecting what they just clicked. The name is
  // resolved too — a picker showing a raw `prod_…` id is the same unusable
  // identifier this change removed from the PO column.
  useEffect(() => {
    if (!initialProductId) return;
    setLines((cur) =>
      cur.length === 1 && !cur[0]!.productId
        ? [{ ...cur[0]!, productId: initialProductId }]
        : cur,
    );
    void loadUnits(initialProductId);
    void (async () => {
      try {
        const p = await apiGet<{ name?: string; sku?: string }>(
          `/api/v1/catalog/${initialProductId}`,
        );
        if (p?.name) {
          setNames((cur) => ({ ...cur, [initialProductId]: `${p.sku ?? ""} ${p.name}`.trim() }));
        }
      } catch {
        /* the line still works — the picker falls back to "Change" */
      }
    })();
    // loadUnits is intentionally excluded: it changes identity as its cache
    // fills, which would re-run this deep-link seed on every unit fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductId]);

  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((cur) => cur.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const loadUnits = useCallback(
    async (productId: string) => {
      if (!productId || unitsByProduct[productId]) return;
      try {
        const d = await apiGet<{ items: ProductBarcode[] }>(
          `/api/v1/catalog/${productId}/barcodes`,
        );
        setUnitsByProduct((cur) => ({ ...cur, [productId]: d.items ?? [] }));
      } catch {
        /* units are optional — the line still works as "each" */
      }
    },
    [unitsByProduct],
  );

  const selectProduct = (index: number, hit: ProductHit) => {
    setNames((cur) => ({ ...cur, [hit.id]: `${hit.sublabel ?? ""} ${hit.label}`.trim() }));
    updateLine(index, { productId: hit.id, unitKind: "each" });
    void loadUnits(hit.id);
  };

  const packSizeFor = (line: DraftLine): number | null => {
    if (line.unitKind === "each") return null;
    return unitsByProduct[line.productId]?.find((u) => u.kind === line.unitKind)?.pack_size ?? null;
  };

  const reset = () => {
    setLines([emptyLine()]);
    setExpectedDate("");
    setNotes("");
  };

  const submit = async () => {
    const requestLines: CreatePurchaseOrderLineRequest[] = [];
    for (const line of lines) {
      if (!line.productId || !line.quantity || !line.unitCost) continue;
      const entry: CreatePurchaseOrderLineRequest = {
        productId: line.productId,
        quantity: Number(line.quantity),
        unitCostCents: parseToCents(line.unitCost),
      };
      if (line.unitKind !== "each") entry.unitKind = line.unitKind;
      if (line.expiryDate) entry.expiryDate = new Date(line.expiryDate).getTime();
      if (line.lotCode.trim()) entry.lotCode = line.lotCode.trim();
      requestLines.push(entry);
    }
    if (!supplierId) {
      setFieldError("Choose a supplier before submitting.");
      firstFieldRef.current?.focus();
      return;
    }
    if (requestLines.length === 0) {
      setFieldError("Add at least one line with a product, quantity and unit cost.");
      return;
    }
    setBusy(true);
    setError(null);
    setFieldError(null);
    setConfirmation(null);
    try {
      const po = await apiPost<PurchaseOrder>("/api/v1/purchasing/orders", {
        supplierId,
        ...(expectedDate ? { expectedDate: new Date(expectedDate).getTime() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: requestLines,
      });
      reset();
      const conversions = po.unitConversions?.length
        ? po.unitConversions.map(
            (c) =>
              `${c.enteredQty} ${UNIT_LABEL[c.unitKind] ?? c.unitKind} → ${c.baseQty} Each (pack size ${c.packSize})`,
          )
        : [];
      setConfirmation([
        po.approval_status === "pending"
          ? `PO #${po.po_number ?? ""} created and sent for approval — it cannot be received until approved.`
          : `PO #${po.po_number ?? ""} created.`,
        ...conversions,
      ]);
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiResponseError ? err.message : "Could not create purchase order.",
      );
    } finally {
      setBusy(false);
    }
  };

  const goodsTotal = lines.reduce((sum, l) => {
    const qty = Number(l.quantity) || 0;
    const cents = l.unitCost ? parseToCents(l.unitCost) : 0;
    return sum + qty * cents;
  }, 0);

  if (!open) {
    return (
      <div>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          New purchase order
        </Button>
        {confirmation && (
          <div
            role="status"
            className="mt-3 rounded-control bg-success-50 px-4 py-2 text-sm text-success-700"
          >
            {confirmation.map((line, i) => (
              <p key={i} className={i === 0 ? "font-medium" : undefined}>
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-content-primary">New purchase order</h3>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-control bg-danger-50 px-4 py-2 text-sm text-danger-700">
          {error}
        </p>
      )}
      {fieldError && (
        <p role="alert" className="mt-3 rounded-control bg-warning-50 px-4 py-2 text-sm text-warning-700">
          {fieldError}
        </p>
      )}

      {/* Vendor + terms first — the header facts that govern every line below. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select
          ref={firstFieldRef}
          label="Supplier"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          placeholder={suppliers.length === 0 ? "No suppliers yet" : undefined}
        />
        <Input
          label="Expected delivery"
          type="date"
          value={expectedDate}
          onChange={(e) => setExpectedDate(e.target.value)}
          hint="Optional — drives the Overdue view"
        />
        <Input
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reference, terms, instructions"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {lines.map((line, index) => {
          const availableUnits = unitsByProduct[line.productId] ?? [];
          const packSize = packSizeFor(line);
          const qty = Number(line.quantity) || 0;
          const costCents = line.unitCost ? parseToCents(line.unitCost) : 0;
          return (
            <div key={index} className="rounded-control border border-line p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <ProductPicker
                    value={line.productId}
                    displayName={names[line.productId]}
                    onSelect={(hit) => selectProduct(index, hit)}
                    onClear={() => updateLine(index, { productId: "", unitKind: "each" })}
                  />
                </div>
                <Select
                  label="Unit"
                  value={line.unitKind}
                  onChange={(e) => updateLine(index, { unitKind: e.target.value })}
                  options={[
                    { value: "each", label: "Each" },
                    ...availableUnits
                      .filter((u) => u.kind !== "each")
                      .map((u) => ({ value: u.kind, label: UNIT_LABEL[u.kind] ?? u.kind })),
                  ]}
                />
                <Input
                  label={`Quantity${line.unitKind !== "each" ? ` (${UNIT_LABEL[line.unitKind] ?? line.unitKind})` : ""}`}
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                />
                <Input
                  label={`Unit cost${line.unitKind !== "each" ? ` (per ${UNIT_LABEL[line.unitKind] ?? line.unitKind})` : ""}`}
                  inputMode="decimal"
                  value={line.unitCost}
                  onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                  placeholder="0.00"
                />
                <Input
                  label="Expiry date"
                  type="date"
                  value={line.expiryDate}
                  onChange={(e) => updateLine(index, { expiryDate: e.target.value })}
                />
                <Input
                  label="Lot code"
                  value={line.lotCode}
                  onChange={(e) => updateLine(index, { lotCode: e.target.value })}
                  placeholder="Optional"
                />
              </div>

              {line.unitKind !== "each" &&
                (packSize ? (
                  <p className="mt-2 rounded-control bg-accent-50 px-3 py-1.5 text-xs text-accent-700">
                    1 {UNIT_LABEL[line.unitKind] ?? line.unitKind} = {packSize} Each — entered{" "}
                    {qty || "?"} {UNIT_LABEL[line.unitKind] ?? line.unitKind}
                    {qty > 0 && ` → ${qty * packSize} Each`}
                    {costCents > 0 &&
                      ` @ ${formatMoney(Math.round(costCents / packSize))}/each (normalized from ${formatMoney(costCents)}/${UNIT_LABEL[line.unitKind] ?? line.unitKind})`}
                  </p>
                ) : (
                  <p className="mt-2 rounded-control bg-warning-50 px-3 py-1.5 text-xs text-warning-700">
                    No &quot;{UNIT_LABEL[line.unitKind] ?? line.unitKind}&quot; unit is configured
                    for this product yet — add one under Units &amp; Packaging on the product page
                    first.
                  </p>
                ))}

              {lines.length > 1 && (
                <div className="mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((cur) => cur.filter((_, i) => i !== index))}
                  >
                    Remove line
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Review before submit — the total is the number the approval tier acts on. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setLines((cur) => [...cur, emptyLine()])}>
            Add line
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-content-secondary">
            Goods total <span className="tnum font-semibold text-content-primary">{formatMoney(goodsTotal)}</span>
          </p>
          <Button variant="primary" size="sm" disabled={busy || !supplierId} onClick={() => void submit()}>
            {busy ? "Creating…" : "Create purchase order"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Type-ahead product lookup against the canonical search endpoint. */
function ProductPicker({
  value,
  displayName,
  onSelect,
  onClear,
}: {
  value: string;
  displayName?: string;
  onSelect: (hit: ProductHit) => void;
  onClear: () => void;
}) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = term.trim();
    if (value || q.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await apiGet<{ products?: ProductHit[] }>(
            `/api/v1/search?q=${encodeURIComponent(q)}&type=product`,
          );
          setHits(res.products ?? []);
        } catch {
          setHits([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [term, value]);

  if (value) {
    return (
      <div>
        <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-content-secondary">
          Product
        </span>
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-content-primary" title={displayName ?? value}>
            {displayName ?? "Selected product"}
          </span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Input
        label="Product"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search name, SKU or barcode"
        aria-describedby="product-picker-hint"
      />
      <p id="product-picker-hint" className="sr-only">
        Type at least two characters to search products.
      </p>
      {searching && hits.length === 0 && term.trim().length >= 2 && (
        <p className="mt-1 text-2xs text-content-tertiary">Searching…</p>
      )}
      {hits.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-control border border-line bg-surface-1">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(hit);
                  setTerm("");
                }}
                className="focus-ring block w-full px-3 py-2 text-left text-sm text-content-primary hover:bg-surface-2"
              >
                <span className="font-medium">{hit.label}</span>
                {hit.sublabel && (
                  <span className="ml-2 font-mono text-2xs text-content-tertiary">{hit.sublabel}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
