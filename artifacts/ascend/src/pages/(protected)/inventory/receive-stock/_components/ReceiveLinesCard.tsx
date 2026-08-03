
import { Card } from "@/components/Card";
import { formatMoney } from "@/lib/money";
import type { PendingPO, ReceiveEntry, LocationOption } from "./receiveStockTypes";

export function ReceiveLinesCard({
  entries,
  sortedEntries,
  selectedPO,
  onUpdateEntry,
  locations,
}: {
  entries: ReceiveEntry[];
  sortedEntries: ReceiveEntry[];
  selectedPO: PendingPO;
  onUpdateEntry: (lineId: string, patch: Partial<ReceiveEntry>) => void;
  locations: LocationOption[];
}) {
  const inputCls = "w-full rounded-lg border px-3 py-2 text-sm font-semibold text-center focus:border-blue-500 focus:outline-none";
  const inputStyle = { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" };

  return (
    <Card className="overflow-hidden p-0">
      <div
        className="border-b px-4 py-3 flex items-center justify-between"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Lines to receive</h2>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{entries.length} open line(s)</span>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>All lines have been fully received.</p>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--color-table-border)" }}>
          {sortedEntries.map((entry) => {
            const line = selectedPO.lines?.find((l) => l.id === entry.lineId);
            if (!line) return null;
            const overQty = entry.totalQty > line.remaining_qty;
            return (
              <div
                key={entry.lineId}
                className={`px-4 py-4 transition-colors ${entry.highlighted ? "bg-yellow-50 ring-1 ring-inset ring-yellow-300" : ""}`}
              >
                <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{line.product_name}</p>
                    <p className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>{line.product_sku} · {line.product_barcode ?? "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Unit cost · Remaining</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                      {formatMoney(line.unit_cost_cents)} · <span className="text-amber-700">{line.remaining_qty}</span>
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>Cases</label>
                    <input type="number" min={0} value={entry.cases}
                      onChange={(e) => onUpdateEntry(entry.lineId, { cases: e.target.value })}
                      className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>Units / case</label>
                    <input type="number" min={1} value={entry.unitsPerCase}
                      onChange={(e) => onUpdateEntry(entry.lineId, { unitsPerCase: e.target.value })}
                      className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>Total qty</label>
                    <div className={`rounded-lg border px-3 py-2 text-sm font-bold text-center tabular-nums ${overQty ? "border-red-300 bg-red-50 text-red-700" : ""}`}
                      style={!overQty ? { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-primary)" } : undefined}>
                      {entry.totalQty}
                      {overQty && <span className="ml-1 text-xs font-normal">⚠ over</span>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>Expiry date</label>
                    <input type="date" value={entry.expiryDate}
                      onChange={(e) => onUpdateEntry(entry.lineId, { expiryDate: e.target.value })}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none`}
                      style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>Location</label>
                    <select value={entry.locationId}
                      onChange={(e) => onUpdateEntry(entry.lineId, { locationId: e.target.value })}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none`}
                      style={inputStyle}>
                      <option value="">— select —</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>{loc.code} · {loc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
