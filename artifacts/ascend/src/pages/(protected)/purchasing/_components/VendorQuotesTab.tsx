
import { Fragment, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { apiGet, apiPatch, apiPost, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { hasRole } from "@/lib/auth";
import { useFlag } from "@/flags/useFlag";
import { NewQuoteModal } from "./NewQuoteModal";
import type { QuoteLine, VendorQuote, VQ_STATUS_BADGE } from "./shared";
import { VQ_STATUS_BADGE as VQ_BADGE } from "./shared";
import { fmtDate, fmtDateTime } from "@/lib/date";

export function VendorQuotesTab() {
  const enabled = useFlag("vendor_quotations");
  const canManage = hasRole("manager");
  const [quotes, setQuotes] = useState<VendorQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewQuoteModal, setShowNewQuoteModal] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await apiGet<{ items: VendorQuote[] }>("/api/v1/purchasing/vendor-quotes");
      setQuotes(res.items ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [enabled]);

  useEffect(() => { void load(); }, [load]);

  const acceptQuote = async (id: string) => {
    setBusy(true);
    try {
      await apiPatch(`/api/v1/purchasing/vendor-quotes/${id}/accept`, {});
      await load();
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const rejectQuote = async (id: string) => {
    setBusy(true);
    try {
      await apiPatch(`/api/v1/purchasing/vendor-quotes/${id}/reject`, {});
      await load();
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const createQuote = async (payload: { vendor: string; line_items: QuoteLine[]; expires_at: number }) => {
    setBusy(true);
    try {
      await apiPost("/api/v1/purchasing/vendor-quotes", payload);
      setShowNewQuoteModal(false);
      await load();
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <svg aria-hidden="true" className="h-10 w-10" style={{ color: "var(--color-text-muted)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
        </svg>
        <p className="text-base font-semibold" style={{ color: "var(--color-text-secondary)" }}>Vendor Quotes — Coming Soon</p>
        <p className="max-w-sm text-sm" style={{ color: "var(--color-text-muted)" }}>Enable the <span className="font-mono font-semibold">vendor_quotations</span> feature flag to manage supplier quotes.</p>
      </div>
    );
  }

  return (
    <>
      <NewQuoteModal open={showNewQuoteModal} busy={busy} onClose={() => setShowNewQuoteModal(false)} onSubmit={(p) => void createQuote(p)} />

      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Quotes received from vendors. Click a row to see line items.</p>
        {canManage && <Button variant="primary" size="sm" onClick={() => setShowNewQuoteModal(true)}>New Quote</Button>}
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <table className="min-w-full divide-y divide-[var(--color-table-border)] text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-[0.08em]" style={{ backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}>
              <tr>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-table-border)]" style={{ backgroundColor: "var(--color-surface)" }}>
              {[0, 1, 2].map((i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><div className="h-4 w-32 animate-skeleton rounded" /></td>
                  <td className="px-4 py-3"><div className="ml-auto h-4 w-16 animate-skeleton rounded" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 animate-skeleton rounded" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-14 animate-skeleton rounded" /></td>
                  {canManage && <td className="px-4 py-3" />}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="min-w-full divide-y divide-[var(--color-table-border)] text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-[0.08em]" style={{ backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}>
              <tr>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-table-border)]" style={{ backgroundColor: "var(--color-surface)" }}>
              {quotes.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-4 py-8 text-center" style={{ color: "var(--color-text-muted)" }}>
                    No vendor quotes yet. Create one with &ldquo;New Quote&rdquo;.
                  </td>
                </tr>
              ) : (
                quotes.map((q) => (
                  <Fragment key={q.id}>
                    <tr
                      className="cursor-pointer transition-colors hover:bg-[var(--color-surface-subtle)]"
                      onClick={() => setExpandedId((cur) => (cur === q.id ? null : q.id))}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>
                        <div className="flex items-center gap-2">
                          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${expandedId === q.id ? "rotate-90" : ""}`} style={{ color: "var(--color-text-muted)" }}>
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          {q.vendor}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(q.total_cents)}</td>
                      <td className="whitespace-nowrap px-4 py-3" style={{ color: "var(--color-text-muted)" }}>{fmtDate(q.expires_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge variant={VQ_BADGE[q.status]}>
                          {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                        </Badge>
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {q.status === "pending" && (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="primary" disabled={busy} onClick={() => void acceptQuote(q.id)}>Accept</Button>
                              <Button size="sm" variant="danger" disabled={busy} onClick={() => void rejectQuote(q.id)}>Reject</Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                    {expandedId === q.id && (
                      <tr key={`${q.id}-detail`}>
                        <td colSpan={canManage ? 5 : 4} className="px-8 py-3" style={{ backgroundColor: "var(--color-table-header)" }}>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                                <th className="pb-1 pr-4">Product</th>
                                <th className="pb-1 pr-4 text-right">Qty</th>
                                <th className="pb-1 pr-4 text-right">Unit price</th>
                                <th className="pb-1 text-right">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-table-border)]">
                              {q.line_items.map((li, idx) => (
                                <tr key={idx}>
                                  <td className="py-1 pr-4 font-medium" style={{ color: "var(--color-text-primary)" }}>{li.product}</td>
                                  <td className="py-1 pr-4 text-right" style={{ color: "var(--color-text-secondary)" }}>{li.qty}</td>
                                  <td className="py-1 pr-4 text-right" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(li.unit_price_cents)}</td>
                                  <td className="py-1 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(li.qty * li.unit_price_cents)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>Created {fmtDateTime(q.created_at)}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
