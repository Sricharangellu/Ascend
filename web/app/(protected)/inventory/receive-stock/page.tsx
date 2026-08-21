"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { formatMoney } from "@/lib/money";
import { apiGet, apiPost, apiPatch, ApiResponseError } from "@/api-client/client";
import { computeTotal, receiveStatusBadge, docTypeLabel, fmtBytes, buildReceiveLines, applyScanToEntries, findScannedLine } from "./_components/receiveStockTypes";
import type { PendingPO, ReceiveEntry, PODocument, SortMode, LocationOption, ResolvedScan } from "./_components/receiveStockTypes";
import { ReceiveLinesCard } from "./_components/ReceiveLinesCard";
import { PendingPOsTable } from "./_components/PendingPOsTable";

export default function ReceiveStockPage() {
  const router = useRouter();
  const scanRef = useRef<HTMLInputElement>(null);

  const [pendingPOs, setPendingPOs] = useState<PendingPO[]>([]);
  const [suppliers, setSuppliers]   = useState<Array<{ id: string; name: string }>>([]);
  const [locations, setLocations]   = useState<LocationOption[]>([]);
  const [selectedPOId, setSelectedPOId] = useState<string>("");
  const [selectedPO, setSelectedPO]     = useState<PendingPO | null>(null);

  const [entries, setEntries]     = useState<ReceiveEntry[]>([]);
  const [sortMode, setSortMode]   = useState<SortMode>("insertion");
  const [scanInput, setScanInput] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const [documents, setDocuments] = useState<PODocument[]>([]);
  const [docName, setDocName]     = useState("");
  const [docType, setDocType]     = useState<string>("invoice");
  const [docBusy, setDocBusy]     = useState(false);

  const [loadingPO, setLoadingPO] = useState(false);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const [ordersRes, suppliersRes, locationsRes] = await Promise.all([
        apiGet<{ items: PendingPO[] }>("/api/v1/purchasing/orders"),
        apiGet<{ items: Array<{ id: string; name: string }> }>("/api/v1/purchasing/suppliers"),
        apiGet<{ items: LocationOption[] }>("/api/v1/inventory/locations"),
      ]);
      const pending = (ordersRes.items ?? []).filter(
        (o) =>
          o.receive_status === "pending" ||
          o.receive_status === "partial" ||
          o.receive_status === "partially_received" ||
          o.status === "ordered" ||
          o.status === "partially_received",
      );
      setPendingPOs(pending);
      setSuppliers(suppliersRes.items ?? []);
      setLocations(locationsRes.items ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  const loadPO = useCallback(async (poId: string) => {
    if (!poId) { setSelectedPO(null); setEntries([]); setDocuments([]); return; }
    setLoadingPO(true); setError(null);
    try {
      const [poRes, docsRes] = await Promise.all([
        apiGet<PendingPO>(`/api/v1/purchasing/orders/${poId}`),
        apiGet<{ items: PODocument[] }>(`/api/v1/purchasing/orders/${poId}/documents`).catch(() => ({ items: [] as PODocument[] })),
      ]);
      const supName = suppliers.find((s) => s.id === poRes.supplier_id)?.name ?? poRes.supplier_id;
      setSelectedPO({ ...poRes, supplier_name: supName });
      setDocuments(docsRes.items ?? []);
      setEntries(
        (poRes.lines ?? [])
          .map((l) => {
            const remaining = Math.max(
              0,
              (l.remaining_qty ?? (l.quantity - (l.received_qty ?? 0))),
            );
            return { line: l, remaining };
          })
          .filter(({ remaining }) => remaining > 0)
          .map(({ line: l, remaining }) => ({
            lineId: l.id,
            cases: l.cases_ordered != null ? String(l.cases_ordered) : "1",
            unitsPerCase: l.units_per_case != null ? String(l.units_per_case) : String(remaining),
            totalQty: remaining,
            expiryDate: l.expiry_date ? new Date(l.expiry_date).toISOString().slice(0, 10) : "",
            lotCode: l.lot_code ?? "",
            locationId: "",
          })),
      );
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load purchase order.");
    } finally { setLoadingPO(false); }
  }, [suppliers]);

  useEffect(() => { void loadPO(selectedPOId); }, [selectedPOId, loadPO]);

  /**
   * Resolve a scanned code through the canonical backend resolver and count it
   * onto the matching line.
   *
   * Two things changed here and both were defects, not preferences:
   *
   * 1. Resolution moved to `GET /catalog/barcode/:code/pos` — the same endpoint
   *    the register uses. The desk previously compared the code against
   *    `product_barcode`/`product_sku` on the PO line, which sees only the one
   *    barcode denormalised onto that line. A case UPC, a vendor UPC or any
   *    second each-code lives in `product_barcodes` and was therefore reported
   *    as "not found on this PO" while sitting on the pallet in front of you.
   *
   * 2. A scan now COUNTS. It used to flash the row yellow for two seconds and
   *    change no quantity, so scanner-first receiving still required typing
   *    every case count by hand — which is the whole cost the scanner exists to
   *    remove, and is worst on a phone.
   *
   * MERGE NOTE — develop's PR #228 fixed the same defect independently, and the
   * two are not equivalent. #228 resolved through the plain
   * `/catalog/barcode/:code` and only HIGHLIGHTED the matched row; this path
   * resolves through `/pos` (the only variant returning `pack_size`) and COUNTS.
   * Both are kept where each is stronger: #228's `findScannedLine` now does the
   * line matching — it matches the line's denormalised barcode, the SKU, *or*
   * the resolved product id, where this branch matched product id alone — and
   * this branch's `applyScanToEntries` does the counting.
   *
   * One piece of #228 is deliberately NOT carried: its `catch {}` fall-through
   * to exact matching when resolution fails. That is safe when a scan only
   * highlights, and unsafe now that a scan counts — a case UPC that failed to
   * resolve would match the line by its each-barcode and book 1 instead of
   * pack_size, which is the exact defect this branch exists to fix. A failed
   * lookup therefore counts nothing and says so.
   */
  const handleScan = async () => {
    const code = scanInput.trim();
    setScanInput(""); setScanError(null); setScanNotice(null);
    if (!code) return;

    setScanning(true);
    let resolved: ResolvedScan;
    try {
      resolved = await apiGet<ResolvedScan>(
        `/api/v1/catalog/barcode/${encodeURIComponent(code)}/pos`,
      );
    } catch (e) {
      // Distinguish "this code is not a product" from "the lookup did not
      // happen". Telling an operator a real case is unknown because the
      // network dropped sends them to re-key a quantity that is already right.
      if (e instanceof ApiResponseError && e.status === 404) {
        setScanError(`No product carries the code "${code}". Check it is in the catalog, or add it as a barcode on the product.`);
      } else if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setScanError(`Offline — "${code}" was not looked up. Nothing was counted. Reconnect and scan it again.`);
      } else {
        setScanError(
          e instanceof ApiResponseError ? e.message : `Could not look up "${code}". Nothing was counted.`,
        );
      }
      return;
    } finally {
      setScanning(false);
    }

    // No PO chosen yet — jump to the one that actually contains this product.
    if (!selectedPO?.lines) {
      // #228's matcher: line barcode, then SKU, then resolved product id.
      const matchingPO = pendingPOs.find((po) => findScannedLine(po.lines, code, resolved.id));
      if (matchingPO) setSelectedPOId(matchingPO.id);
      else setScanError(`${resolved.name} (${resolved.sku}) is not on any pending purchase order.`);
      return;
    }

    const { entries: next, outcome } = applyScanToEntries(resolved, selectedPO.lines, entries);
    setEntries(next);

    if (outcome.kind === "not_on_po") {
      setScanError(`${outcome.productName} (${outcome.sku}) is not on this purchase order.`);
      return;
    }
    if (outcome.kind === "line_complete") {
      setScanError(`${outcome.productName} is already fully counted (${outcome.remaining} expected). Adjust the quantity by hand to receive more.`);
      return;
    }
    setScanNotice(
      outcome.capped
        ? `${outcome.productName} — capped at the ${selectedPO.lines.find((l) => l.id === outcome.lineId)?.remaining_qty ?? 0} still expected.`
        : `+${outcome.addedQty} ${outcome.productName}${outcome.unitLabel !== "each" ? ` (1 ${outcome.unitLabel})` : ""}`,
    );
  };

  const updateEntry = (lineId: string, patch: Partial<ReceiveEntry>) => {
    setEntries((prev) => prev.map((e) => {
      if (e.lineId !== lineId) return e;
      const u = { ...e, ...patch };
      if ("cases" in patch || "unitsPerCase" in patch) {
        u.totalQty = computeTotal(
          "cases" in patch ? (patch.cases ?? e.cases) : e.cases,
          "unitsPerCase" in patch ? (patch.unitsPerCase ?? e.unitsPerCase) : e.unitsPerCase,
        );
      }
      return u;
    }));
  };

  const receiveAll = () => {
    setEntries((prev) => prev.map((e) => {
      const line = selectedPO?.lines?.find((l) => l.id === e.lineId);
      if (!line) return e;
      const upc = parseInt(e.unitsPerCase, 10) || 1;
      const cases = Math.ceil(line.remaining_qty / upc);
      return { ...e, cases: String(cases), totalQty: line.remaining_qty };
    }));
  };

  const uploadDoc = async () => {
    if (!docName.trim() || !selectedPOId) return;
    setDocBusy(true);
    try {
      const doc = await apiPost<PODocument>(`/api/v1/purchasing/orders/${selectedPOId}/documents`, {
        name: docName.trim(), type: docType, size_bytes: Math.round(Math.random() * 500000 + 50000),
      });
      setDocuments((prev) => [...prev, doc]);
      setDocName("");
    } catch { /* ignore */ } finally { setDocBusy(false); }
  };

  const submit = async () => {
    if (!selectedPOId || entries.length === 0) return;
    const lines = buildReceiveLines(entries);
    if (lines.length === 0) { setError("No quantities entered."); return; }
    setBusy(true); setError(null); setSuccess(null);
    try {
      // Enterprise path: begin a receiving session, apply accepted qtys, then
      // close → posts through the existing receive() inventory/accounting path.
      // Fall back to legacy one-shot receive only when session begin itself fails.
      let session: { id: string; lines: Array<{ id: string; po_line_id: string }> } | null = null;
      try {
        session = await apiPost("/api/v1/purchasing/receiving/sessions", {
          poId: selectedPOId,
          dockCode: "RECV-DESK",
        });
      } catch {
        session = null;
      }

      if (session) {
        for (const line of lines) {
          const sessionLine = session.lines.find((l) => l.po_line_id === line.lineId);
          if (!sessionLine) continue;
          await apiPatch(`/api/v1/purchasing/receiving/sessions/${session.id}/lines/${sessionLine.id}`, {
            acceptedQty: line.qty,
            ...(line.expiryDate != null ? { expiryDate: line.expiryDate } : {}),
            ...(line.lotCode ? { lotCode: line.lotCode } : {}),
            ...(line.locationId ? { locationId: line.locationId } : {}),
          });
        }
        await apiPost(`/api/v1/purchasing/receiving/sessions/${session.id}/close`, {});
        setSuccess(`Receiving session closed — ${lines.length} line(s) posted.`);
      } else {
        await apiPost(`/api/v1/purchasing/orders/${selectedPOId}/receive`, { lines });
        setSuccess(`Receipt submitted — ${lines.length} line(s) received.`);
      }
      await loadList();
      setTimeout(() => { setSelectedPOId(""); setSuccess(null); }, 2500);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Receive failed.");
    } finally { setBusy(false); }
  };

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;
  const sortedEntries = sortMode === "alpha"
    ? [...entries].sort((a, b) => {
        const la = selectedPO?.lines?.find((l) => l.id === a.lineId);
        const lb = selectedPO?.lines?.find((l) => l.id === b.lineId);
        return (la?.product_name ?? "").localeCompare(lb?.product_name ?? "");
      })
    : entries;

  return (
    <EnterpriseShell active="inventory" title="Receive Stock" subtitle="Receive incoming shipments against purchase orders" contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">

        {/* Scan + PO select */}
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium uppercase text-content-secondary">Scan barcode / SKU</label>
              <div className="flex gap-2">
                <input
                  ref={scanRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleScan(); }}
                  placeholder="Scan or type barcode…"
                  aria-label="Scan barcode or SKU"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  className="focus-ring min-h-touch flex-1 rounded-control border border-line bg-surface-1 px-3 font-mono text-base text-content-primary placeholder:text-content-muted"
                  autoFocus
                />
                <Button variant="secondary" size="lg" disabled={scanning} onClick={() => void handleScan()}>
                  {scanning ? "…" : "Scan"}
                </Button>
              </div>
              {/* aria-live: a scan is a hands-busy, eyes-on-the-pallet action —
                  the result has to be announced, not just rendered. */}
              <div aria-live="polite">
                {scanError && <p role="alert" className="mt-1 text-xs text-danger-700">{scanError}</p>}
                {!scanError && scanNotice && (
                  <p className="mt-1 text-xs font-medium text-success-700">{scanNotice}</p>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-[260px]">
              <label className="mb-1 block text-xs font-medium uppercase text-content-secondary">Select pending PO</label>
              <select
                value={selectedPOId}
                onChange={(e) => setSelectedPOId(e.target.value)}
                aria-label="Select pending purchase order"
                className="focus-ring min-h-touch w-full rounded-control border border-line bg-surface-1 px-3 text-base text-content-primary"
              >
                <option value="">— Choose a PO to receive —</option>
                {pendingPOs.map((po) => (
                  <option key={po.id} value={po.id}>
                    #{po.po_number ?? po.id} · {supplierName(po.supplier_id)} · {formatMoney(po.total_cost_cents)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {loadingPO && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}
          </div>
        )}

        {selectedPO && !loadingPO && (
          <>
            {/* PO summary */}
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-6">
                  <div><p className="text-xs text-slate-400">PO Number</p><p className="font-bold text-slate-900">#{selectedPO.po_number ?? selectedPO.id}</p></div>
                  <div><p className="text-xs text-slate-400">Supplier</p><p className="font-semibold text-slate-900">{selectedPO.supplier_name}</p></div>
                  <div><p className="text-xs text-slate-400">PO Total</p><p className="font-semibold text-slate-900">{formatMoney(selectedPO.total_cost_cents)}</p></div>
                  <div>
                    <p className="text-xs text-slate-400">Receive status</p>
                    <Badge variant={receiveStatusBadge(selectedPO.receive_status)}>{selectedPO.receive_status ?? "pending"}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Sort:</span>
                  {(["insertion", "alpha"] as SortMode[]).map((m) => (
                    <button key={m} type="button" onClick={() => setSortMode(m)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        sortMode === m ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-600 hover:border-blue-300"
                      }`}>
                      {m === "insertion" ? "As ordered" : "A–Z"}
                    </button>
                  ))}
                  <Button variant="secondary" size="sm" onClick={receiveAll}>Fill all</Button>
                </div>
              </div>
            </Card>

            {error   && <p role="alert"  className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">{error}</p>}
            {success && <p role="status" className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-800 font-medium">{success}</p>}

            <ReceiveLinesCard entries={entries} sortedEntries={sortedEntries} selectedPO={selectedPO} onUpdateEntry={updateEntry} locations={locations} />

            {/* Document upload */}
            <Card>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Attached documents</h3>
              {documents.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <svg aria-hidden="true" className="w-4 h-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                      </svg>
                      <div>
                        <p className="text-xs font-medium text-slate-800">{doc.name}</p>
                        <p className="text-xs text-slate-400">{docTypeLabel(doc.type)} · {fmtBytes(doc.size_bytes)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">File name</label>
                  <input type="text" value={docName} onChange={(e) => setDocName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void uploadDoc(); }} placeholder="Invoice-Acme-2026.pdf"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none w-56" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                  <select value={docType} onChange={(e) => setDocType(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    <option value="invoice">Invoice</option>
                    <option value="delivery_note">Delivery Note</option>
                    <option value="excel">Excel / CSV</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <Button variant="secondary" size="sm" disabled={!docName.trim() || docBusy} onClick={() => void uploadDoc()}>Attach</Button>
              </div>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Button variant="secondary" size="sm" onClick={() => router.push(`/purchasing/${selectedPOId}`)}>View PO detail</Button>
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-500">{entries.filter((e) => e.totalQty > 0).length}/{entries.length} lines ready</p>
                <Button variant="primary" size="sm" disabled={busy || entries.every((e) => e.totalQty === 0)} onClick={() => void submit()}>
                  {busy ? "Submitting…" : "Submit receipt"}
                </Button>
              </div>
            </div>
          </>
        )}

        {!selectedPOId && !loadingPO && (
          <PendingPOsTable
            pendingPOs={pendingPOs}
            suppliers={suppliers}
            onSelect={setSelectedPOId}
            onCreatePO={() => router.push("/purchasing")}
          />
        )}
      </div>
    </EnterpriseShell>
  );
}
