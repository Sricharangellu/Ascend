
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { apiGet, apiPost } from "@/api-client/client";
import { formatMoney, parseToCents } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import { fmtBytes, docTypeLabel, type BillingAdj, type PODocument, type PurchaseOrderDetail } from "./shared";
import { BillsSection } from "./BillsSection";

export function BillingTab({
  orderId,
  order,
  canManage,
  goodsTotal,
  extraCharges,
  onLandedSaved,
}: {
  orderId: string;
  order: PurchaseOrderDetail;
  canManage: boolean;
  goodsTotal: number;
  extraCharges: number;
  onLandedSaved: () => void;
}) {
  const [billingAdjs, setBillingAdjs] = useState<BillingAdj[]>([]);
  const [documents, setDocuments] = useState<PODocument[]>([]);
  const [adjReason, setAdjReason] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjLineId, setAdjLineId] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [landedOpen, setLandedOpen] = useState(false);
  const [freight, setFreight] = useState((order.freight_cost_cents / 100).toFixed(2));
  const [otherCharges, setOtherCharges] = useState((order.other_charges_cents / 100).toFixed(2));
  const [landedBusy, setLandedBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [adjRes, docRes] = await Promise.all([
        apiGet<{ items: BillingAdj[] }>(`/api/v1/purchasing/orders/${orderId}/billing-adj`),
        apiGet<{ items: PODocument[] }>(`/api/v1/purchasing/orders/${orderId}/documents`),
      ]);
      setBillingAdjs(adjRes.items ?? []);
      setDocuments(docRes.items ?? []);
    } catch { /* ignore */ }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const createAdj = async () => {
    if (!adjReason.trim() || !adjAmount) { setAdjError("Reason and amount are required."); return; }
    const amountCents = parseToCents(adjAmount);
    if (isNaN(amountCents) || amountCents === 0) { setAdjError("Enter a valid dollar amount (use − for deductions)."); return; }
    setAdjBusy(true); setAdjError(null);
    try {
      const adj = await apiPost<BillingAdj>(`/api/v1/purchasing/orders/${orderId}/billing-adj`, {
        lineId: adjLineId || undefined, reason: adjReason.trim(), amountCents,
      });
      setBillingAdjs((prev) => [...prev, adj]);
      setAdjReason(""); setAdjAmount(""); setAdjLineId("");
    } catch { /* ignore */ } finally { setAdjBusy(false); }
  };

  const saveLandedCosts = async () => {
    setLandedBusy(true);
    try {
      await apiPost(`/api/v1/purchasing/orders/${orderId}/landed-costs`, {
        freightCents: parseToCents(freight || "0"),
        otherChargesCents: parseToCents(otherCharges || "0"),
      });
      setLandedOpen(false);
      onLandedSaved();
    } catch { /* ignore */ } finally { setLandedBusy(false); }
  };

  const adjTotal = billingAdjs.reduce((s, a) => s + a.amount_cents, 0);

  return (
    <div className="space-y-5 p-4">
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-border)" }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Landed costs</p>
          {canManage && <Button variant="secondary" size="sm" onClick={() => setLandedOpen(true)}>Edit</Button>}
        </div>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs" style={{ color: "var(--color-text-muted)" }}>Goods</dt>
            <dd className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(goodsTotal)}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: "var(--color-text-muted)" }}>Freight</dt>
            <dd className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(order.freight_cost_cents)}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: "var(--color-text-muted)" }}>Other charges</dt>
            <dd className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(order.other_charges_cents)}</dd>
          </div>
        </dl>
        <div className="mt-3 flex justify-between border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
          <span className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Total landed</span>
          <span className="font-bold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(goodsTotal + extraCharges)}</span>
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Price adjustments</p>
        {adjError && <p className="mb-2 text-xs text-red-600">{adjError}</p>}
        <div className="mb-4 space-y-2">
          {billingAdjs.map((adj) => (
            <div key={adj.id} className="flex items-center justify-between rounded-lg border px-4 py-2.5" style={{ borderColor: "var(--color-border)" }}>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{adj.reason}</p>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{fmtDate(adj.created_at)}{adj.line_id ? ` · Line ${adj.line_id}` : ""}</p>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${adj.amount_cents < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {adj.amount_cents < 0 ? "−" : "+"}{formatMoney(Math.abs(adj.amount_cents))}
              </span>
            </div>
          ))}
          {billingAdjs.length === 0 && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No adjustments.</p>}
        </div>

        {canManage && (
          <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">New adjustment</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Reason</label>
                <input type="text" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="e.g. Overcharge correction"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  style={{ borderColor: "var(--color-border)" }} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Amount ($, use − for deductions)</label>
                <input type="text" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="-5.00"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  style={{ borderColor: "var(--color-border)" }} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Applies to line (optional)</label>
                <select value={adjLineId} onChange={(e) => setAdjLineId(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: "var(--color-border)" }}>
                  <option value="">Whole PO</option>
                  {order.lines.map((l) => <option key={l.id} value={l.id}>{l.product_sku} — {l.product_name}</option>)}
                </select>
              </div>
              <Button variant="primary" size="sm" disabled={adjBusy || !adjReason.trim() || !adjAmount} onClick={() => void createAdj()} className="mt-5">
                Add adjustment
              </Button>
            </div>
          </div>
        )}

        {(billingAdjs.length > 0 || extraCharges > 0) && (
          <div className="mt-4 flex justify-between rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-table-header)" }}>
            <span className="font-semibold" style={{ color: "var(--color-text-secondary)" }}>Net billing total</span>
            <span className="font-bold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(goodsTotal + extraCharges + adjTotal)}</span>
          </div>
        )}
      </div>

      {documents.filter((d) => d.type === "invoice").length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Billing documents</p>
          <div className="flex flex-wrap gap-2">
            {documents.filter((d) => d.type === "invoice").map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                <svg aria-hidden="true" className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-muted)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>{doc.name}</p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{fmtBytes(doc.size_bytes)} · {fmtDate(doc.uploaded_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-border)" }}>
        <BillsSection order={order} canManage={canManage} documents={documents} />
      </div>

      <Modal open={landedOpen} onClose={() => setLandedOpen(false)} title="Landed Costs" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setLandedOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={landedBusy} onClick={() => void saveLandedCosts()}>Save</Button>
          </div>
        }
      >
        <p className="mb-4 text-sm" style={{ color: "var(--color-text-muted)" }}>Extra charges distributed proportionally across all lines.</p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Freight ($)</label>
            <input type="text" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0.00"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              style={{ borderColor: "var(--color-border)" }} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Other charges ($)</label>
            <input type="text" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} placeholder="0.00"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              style={{ borderColor: "var(--color-border)" }} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
