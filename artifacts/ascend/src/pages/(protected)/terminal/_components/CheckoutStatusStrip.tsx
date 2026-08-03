
type Tone = "neutral" | "success" | "warning" | "brand";

function StatusPill({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const toneClass: Record<Tone, string> = {
    neutral: "border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
    success: "border-success-200 bg-success-50 text-success-700",
    warning: "border-warning-200 bg-warning-50 text-warning-700",
    brand:   "border-brand-200 bg-brand-50 text-brand-700",
  };
  return (
    <div className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-md border px-2.5 ${toneClass[tone]}`}>
      <span className="font-semibold uppercase tracking-[0.08em] opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export function CheckoutStatusStrip({
  cashier,
  isOffline,
  returnMode,
  itemCount,
  onShortcuts,
  activeOutletId,
  outlets,
  onOutletChange,
}: {
  cashier: string;
  isOffline: boolean;
  returnMode: boolean;
  itemCount: number;
  onShortcuts: () => void;
  activeOutletId: string;
  outlets: { id: string; name: string }[];
  onOutletChange: (id: string) => void;
}) {
  const activeOutlet = outlets.find((o) => o.id === activeOutletId);
  const outletName = activeOutlet?.name ?? (activeOutletId ? "Loading…" : "No outlet");

  return (
    <div className="flex flex-none flex-wrap items-center gap-2 px-3 py-2 text-xs sm:px-4" style={{ borderBottomWidth: 1, borderBottomStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <StatusPill label="Store"   value={outletName}                              tone="neutral" />
      <StatusPill label="Cashier" value={cashier}                                 tone="neutral" />
      <StatusPill label="Shift"   value="Open"                                    tone="success" />
      <StatusPill label="Network" value={isOffline ? "Offline queue" : "Online"}  tone={isOffline ? "warning" : "success"} />
      <StatusPill label="Cart"    value={`${itemCount} item${itemCount === 1 ? "" : "s"}`} tone={itemCount > 0 ? "brand" : "neutral"} />
      {returnMode && <StatusPill label="Mode" value="Return" tone="warning" />}
      {outlets.length > 0 && (
        <select
          value={activeOutletId}
          onChange={(e) => onOutletChange(e.target.value)}
          className="ml-auto rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-950"
          style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-secondary)" }}
          aria-label="Active outlet"
        >
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={onShortcuts}
        className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold hover:bg-[var(--color-surface-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>
    </div>
  );
}
