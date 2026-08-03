
/**
 * /reports/end-of-day — Z-report / end-of-day summary.
 */

import { useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { ReportsSubNav } from "@/components/reports/ReportsSubNav";
import { Card } from "@/components/Card";
import { formatMoney } from "@/lib/money";
import { apiGet } from "@/api-client/client";
import { fmtTime } from "@/lib/date";

interface EndOfDayReport {
  date: string;
  businessDate: string;
  openedAt: number | null;
  closedAt: number | null;
  status: "open" | "closed" | "no_session";
  transactions: { count: number; voidCount: number; refundCount: number; averageTicket_cents: number };
  sales: { grossSales_cents: number; discounts_cents: number; refunds_cents: number; netSales_cents: number; taxCollected_cents: number; totalCollected_cents: number };
  tenders: Array<{ method: string; count: number; total_cents: number }>;
  topItems: Array<{ productId: string; productName: string; quantitySold: number; total_cents: number }>;
  cashDrawer: { openingFloat_cents: number; cashSales_cents: number; cashRefunds_cents: number; expectedCash_cents: number; actualCash_cents: number | null; variance_cents: number | null };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function EndOfDayPage() {
  const [date, setDate] = useState<string>(todayISO());
  const [report, setReport] = useState<EndOfDayReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setReport(null);
    void (async () => {
      try {
        const data = await apiGet<EndOfDayReport>(`/api/v1/reports/end-of-day?date=${date}`);
        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) setError("Failed to load end-of-day report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date]);

  return (
    <EnterpriseShell active="reports" title="End-of-Day Report" subtitle="Z-Report — daily shift summary"
      contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6">
        <ReportsSubNav />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>End-of-Day Summary</h1>
            {report && <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>{report.businessDate}</p>}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="eod-date" className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Date</label>
            <input id="eod-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} />
          </div>
        </div>

        {loading && <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }} aria-busy="true">Loading report…</p>}
        {error && !loading && <Card><p role="alert" className="text-[13px] text-red-700">{error}</p></Card>}

        {!loading && !error && report && (
          <>
            {report.status === "no_session" ? (
              <div className="rounded-xl border px-4 py-3 text-[13px]"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
                <span className="font-semibold">No register session</span> was opened on this day — drawer figures show sales activity only.
              </div>
            ) : report.status === "open" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                <span className="font-semibold">Shift is still open</span> — figures may change until the shift is closed.
              </div>
            ) : (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[13px] text-green-800">
                <span className="font-semibold">Shift closed</span> at {report.closedAt ? fmtTime(report.closedAt) : "—"}
              </div>
            )}

            <Card className="overflow-hidden p-0">
              <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Sales Summary</h2>
              </div>
              <div className="grid grid-cols-1 gap-px sm:grid-cols-3"
                style={{ backgroundColor: "var(--color-border)" }}>
                <SalesTile label="Gross Sales" value={formatMoney(report.sales.grossSales_cents)} />
                <SalesTile label="Net Sales" value={formatMoney(report.sales.netSales_cents)} />
                <SalesTile label="Tax Collected" value={formatMoney(report.sales.taxCollected_cents)} />
              </div>
              <div className="grid grid-cols-2 gap-px border-t sm:grid-cols-3"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-border)" }}>
                <SalesTile label="Discounts" value={formatMoney(report.sales.discounts_cents)} sub />
                <SalesTile label="Refunds" value={formatMoney(report.sales.refunds_cents)} sub />
                <SalesTile label="Total Collected" value={formatMoney(report.sales.totalCollected_cents)} sub />
              </div>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Transactions</h2>
              </div>
              <div className="grid grid-cols-2 gap-px sm:grid-cols-4"
                style={{ backgroundColor: "var(--color-border)" }}>
                <SalesTile label="Total Transactions" value={String(report.transactions.count)} />
                <SalesTile label="Avg Ticket" value={formatMoney(report.transactions.averageTicket_cents)} />
                <SalesTile label="Voids" value={String(report.transactions.voidCount)} />
                <SalesTile label="Refunds" value={String(report.transactions.refundCount)} />
              </div>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Tender Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.08em]"
                      style={{ color: "var(--color-text-secondary)" }}>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3 text-right">Transactions</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-table-border)]">
                    {report.tenders.map((t) => (
                      <tr key={t.method} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                        <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{t.method}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{t.count}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(t.total_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "1px solid var(--color-border)", backgroundColor: "var(--color-table-header)" }}>
                      <td className="px-4 py-3 font-bold" style={{ color: "var(--color-text-primary)" }}>Subtotal</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: "var(--color-text-primary)" }}>{report.tenders.reduce((s, t) => s + t.count, 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(report.tenders.reduce((s, t) => s + t.total_cents, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Cash Drawer</h2>
              </div>
              <div className="grid grid-cols-1 gap-6 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <CashDrawerRow label="Opening Float" value={formatMoney(report.cashDrawer.openingFloat_cents)} />
                  <CashDrawerRow label="Cash Sales" value={formatMoney(report.cashDrawer.cashSales_cents)} />
                  <CashDrawerRow label="Cash Refunds" value={`–${formatMoney(report.cashDrawer.cashRefunds_cents)}`} />
                  <div className="border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
                    <CashDrawerRow label="Expected Cash" value={formatMoney(report.cashDrawer.expectedCash_cents)} bold />
                  </div>
                </div>
                <div className="space-y-2">
                  <CashDrawerRow label="Actual Cash"
                    value={report.cashDrawer.actualCash_cents !== null ? formatMoney(report.cashDrawer.actualCash_cents) : "—"} />
                  <CashDrawerRow label="Variance"
                    value={report.cashDrawer.variance_cents !== null ? formatMoney(report.cashDrawer.variance_cents) : "—"}
                    varianceCents={report.cashDrawer.variance_cents} />
                </div>
              </div>
              <p className="border-t px-4 py-2 text-[11px]"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                Actual cash and variance are recorded when the shift is closed.
              </p>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Top Items</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.08em]"
                      style={{ color: "var(--color-text-secondary)" }}>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3 text-right">Qty Sold</th>
                      <th className="px-4 py-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-table-border)]">
                    {report.topItems.slice(0, 10).map((item, i) => (
                      <tr key={item.productId} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                        <td className="px-4 py-3 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{i + 1}</td>
                        <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{item.productName}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{item.quantitySold}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(item.total_cents)}</td>
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

function SalesTile({ label, value, sub = false }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className="px-4 py-3" style={{ backgroundColor: "var(--color-surface)" }}>
      <p className={`tabular-nums font-bold ${sub ? "text-lg" : "text-xl"}`}
        style={{ color: sub ? "var(--color-text-secondary)" : "var(--color-text-primary)" }}>{value}</p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--color-text-muted)" }}>{label}</p>
    </div>
  );
}

function CashDrawerRow({ label, value, bold = false, varianceCents }: {
  label: string; value: string; bold?: boolean; varianceCents?: number | null;
}) {
  let valueClass = "";
  let valueStyle: React.CSSProperties = { color: "var(--color-text-primary)" };
  if (varianceCents !== undefined && varianceCents !== null) {
    if (varianceCents === 0) { valueClass = "text-green-700"; valueStyle = {}; }
    else if (varianceCents < 0) { valueClass = "text-red-600"; valueStyle = {}; }
    else { valueClass = "text-amber-600"; valueStyle = {}; }
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`text-[13px] ${bold ? "font-semibold" : ""}`}
        style={{ color: bold ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>{label}</span>
      <span className={`text-[13px] tabular-nums ${bold ? "font-bold" : "font-medium"} ${valueClass}`}
        style={valueStyle}>{value}</span>
    </div>
  );
}
