
import { useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { ReportsSubNav } from "@/components/reports/ReportsSubNav";
import { fmtDate } from "@/lib/date";

interface ExpiringLot {
  id: string; product_id: string; name: string; lot_code: string | null;
  quantity: number; unit_cost_cents: number | null; expiry_date: number; days_to_expiry: number;
}
interface ExpiredLot {
  id: string; product_id: string; name: string; lot_code: string | null;
  quantity: number; unit_cost_cents: number | null; expiry_date: number; days_overdue: number;
}
interface ExpirySummary {
  expired: { lots: number; units: number; valueCents: number };
  expiringSoon: { lots: number; units: number; valueCents: number; withinDays: number };
}

function ExpiryBadge({ days }: { days: number }) {
  const cls = days <= 7 ? "bg-red-100 text-red-800" : days <= 14 ? "bg-orange-100 text-orange-800" : "bg-yellow-100 text-yellow-800";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{days}d</span>;
}

export default function ExpiryReportPage() {
  const [days, setDays] = useState(30);
  const [expiring, setExpiring] = useState<ExpiringLot[]>([]);
  const [expired, setExpired] = useState<ExpiredLot[]>([]);
  const [summary, setSummary] = useState<ExpirySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const [expiringData, expiredData, summaryData] = await Promise.all([
          apiGet<{ items: ExpiringLot[] }>(`/api/v1/inventory/expiring?days=${days}`),
          apiGet<{ items: ExpiredLot[] }>("/api/v1/inventory/expired"),
          apiGet<ExpirySummary>(`/api/v1/inventory/expiry-summary?days=${days}`),
        ]);
        if (!cancelled) { setExpiring(expiringData.items ?? []); setExpired(expiredData.items ?? []); setSummary(summaryData); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load expiry data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  const totalAtRiskCents = (summary?.expired.valueCents ?? 0) + (summary?.expiringSoon.valueCents ?? 0);

  return (
    <EnterpriseShell active="reports" title="Expiry Report" subtitle="Near-expiry and expired stock">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-3">
            <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Expiry Report</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Identify stock approaching expiry to mark down or return.</p>
          </div>
          <ReportsSubNav />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Expiring within:</span>
          <div className="inline-flex rounded-xl border p-1 shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            {([7, 14, 30, 60] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)}
                className={`min-h-[34px] rounded-lg px-4 text-[13px] font-medium transition-colors ${
                  days === d ? "bg-brand-600 text-white" : "hover:bg-[var(--color-surface-subtle)]"
                }`}
                style={days !== d ? { color: "var(--color-text-secondary)" } : {}}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border px-4 py-3 text-[13px] text-[var(--color-danger-text)]"
            style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)" }} role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }} aria-busy="true">Loading…</p>
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: "Expired lots", value: summary.expired.lots.toString(), sub: `${summary.expired.units} units`, red: true },
                  { label: "Expired value", value: formatMoney(summary.expired.valueCents), sub: "at cost", red: true },
                  { label: `Expiring ≤${days}d lots`, value: summary.expiringSoon.lots.toString(), sub: `${summary.expiringSoon.units} units`, red: false },
                  { label: "Total at risk", value: formatMoney(totalAtRiskCents), sub: "expired + near-expiry", red: false },
                ].map((card) => (
                  <Card key={card.label}>
                    <p className="text-[10px] font-medium uppercase tracking-[0.07em]" style={{ color: "var(--color-text-secondary)" }}>{card.label}</p>
                    <p className={`mt-1 text-2xl font-bold ${card.red ? "text-red-700" : ""}`}
                      style={!card.red ? { color: "var(--color-text-primary)" } : {}}>{card.value}</p>
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>{card.sub}</p>
                  </Card>
                ))}
              </div>
            )}

            <Card title="Already Expired" description="Stock past its expiry date still on hand — write off or return immediately." noPadding>
              <div className="overflow-x-auto">
                <table className="min-w-full text-[13px]">
                  <thead style={{ backgroundColor: "var(--color-table-header)", borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }}>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.07em]"
                      style={{ color: "var(--color-text-secondary)" }}>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Lot code</th>
                      <th className="px-5 py-3 text-right">Qty</th>
                      <th className="px-5 py-3">Expired</th>
                      <th className="px-5 py-3 text-right">Overdue</th>
                      <th className="px-5 py-3 text-right">Value at cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-table-border)]">
                    {expired.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center" style={{ color: "var(--color-text-muted)" }}>No expired stock on hand.</td></tr>
                    ) : expired.map((lot) => (
                      <tr key={lot.id} className="transition-colors hover:bg-red-50/50">
                        <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{lot.name}</td>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{lot.lot_code ?? "—"}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>{lot.quantity}</td>
                        <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(lot.expiry_date)}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right">
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">{lot.days_overdue}d</span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>
                          {lot.unit_cost_cents != null ? formatMoney(lot.unit_cost_cents * lot.quantity) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title={`Expiring Within ${days} Days`} description="Take action before these lots expire." noPadding>
              <div className="overflow-x-auto">
                <table className="min-w-full text-[13px]">
                  <thead style={{ backgroundColor: "var(--color-table-header)", borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }}>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.07em]"
                      style={{ color: "var(--color-text-secondary)" }}>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Lot code</th>
                      <th className="px-5 py-3 text-right">Qty</th>
                      <th className="px-5 py-3">Expiry date</th>
                      <th className="px-5 py-3 text-right">Days left</th>
                      <th className="px-5 py-3 text-right">Value at cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-table-border)]">
                    {expiring.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center" style={{ color: "var(--color-text-muted)" }}>No stock expiring within {days} days.</td></tr>
                    ) : expiring.map((lot) => (
                      <tr key={lot.id} className="transition-colors hover:bg-amber-50/50">
                        <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{lot.name}</td>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{lot.lot_code ?? "—"}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>{lot.quantity}</td>
                        <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(lot.expiry_date)}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right"><ExpiryBadge days={lot.days_to_expiry} /></td>
                        <td className="whitespace-nowrap px-5 py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>
                          {lot.unit_cost_cents != null ? formatMoney(lot.unit_cost_cents * lot.quantity) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </EnterpriseShell>
  );
}
