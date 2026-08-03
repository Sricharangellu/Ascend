
import { useState, useCallback, useEffect } from "react";
import { apiGet, apiPut } from "@/api-client/client";
import { Card } from "@/components/Card";
import { useToast } from "@/components/Toast";

interface LoyaltyTierRule {
  id: string;
  tier_level: number;
  name: string;
  min_points: number;
  point_multiplier: number;
  discount_pct: number;
}

const DEFAULT_TIERS = [
  { level: 1, name: "Bronze",   minPoints: 0,    multiplier: 1.0, discount: 0  },
  { level: 2, name: "Silver",   minPoints: 500,  multiplier: 1.25, discount: 2 },
  { level: 3, name: "Gold",     minPoints: 1500, multiplier: 1.5,  discount: 5 },
  { level: 4, name: "Platinum", minPoints: 5000, multiplier: 2.0,  discount: 10 },
];

const TIER_COLOR: Record<number, string> = {
  1: "text-amber-700",
  2: "",
  3: "text-yellow-600",
  4: "text-violet-700",
};

export function LoyaltyTiersSection({ canManage }: { canManage: boolean }) {
  const { addToast } = useToast();
  const [tiers, setTiers]   = useState<LoyaltyTierRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm]     = useState({ name: "", minPoints: "", pointMultiplier: "", discountPct: "" });
  const [busy, setBusy]     = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: LoyaltyTierRule[] }>("/api/v1/customers/loyalty-tiers")
      .then(r => setTiers(r.items ?? []))
      .catch(() => setTiers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (level: number) => {
    const existing = tiers.find(t => t.tier_level === level);
    const def = DEFAULT_TIERS.find(d => d.level === level);
    setForm({
      name:            existing?.name ?? def?.name ?? "",
      minPoints:       String(existing?.min_points ?? def?.minPoints ?? 0),
      pointMultiplier: String(existing?.point_multiplier ?? def?.multiplier ?? 1),
      discountPct:     String(existing?.discount_pct ?? def?.discount ?? 0),
    });
    setEditing(level);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await apiPut(`/api/v1/customers/loyalty-tiers/${editing}`, {
        name: form.name.trim(),
        tierLevel: editing,
        minPoints: parseInt(form.minPoints, 10) || 0,
        pointMultiplier: parseFloat(form.pointMultiplier) || 1,
        discountPct: parseFloat(form.discountPct) || 0,
      });
      setEditing(null);
      load();
      addToast({ title: "Tier saved", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  const seedDefaults = async () => {
    setBusy(true);
    try {
      for (const d of DEFAULT_TIERS) {
        await apiPut(`/api/v1/customers/loyalty-tiers/${d.level}`, {
          name: d.name, tierLevel: d.level, minPoints: d.minPoints, pointMultiplier: d.multiplier, discountPct: d.discount,
        });
      }
      load();
      addToast({ title: "Default tiers created", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  const tierLabel = (level: number) => DEFAULT_TIERS.find(d => d.level === level)?.name ?? `Tier ${level}`;

  return (
    <Card title="Loyalty Tier Rules" className="overflow-hidden">
      <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
        Configure named tiers (Bronze → Platinum) with point thresholds, earn multipliers, and automatic purchase discounts.
        Customers auto-upgrade when their point balance crosses a tier threshold.
      </p>
      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 animate-skeleton rounded" />)}</div>
      ) : (
        <>
          {tiers.length === 0 && (
            <div className="mb-4 rounded-md border border-dashed p-4 text-center" style={{ borderColor: "var(--color-border)" }}>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No tier rules configured.</p>
              {canManage && (
                <button type="button" onClick={() => void seedDefaults()} disabled={busy}
                  className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50">
                  Seed default tiers (Bronze / Silver / Gold / Platinum)
                </button>
              )}
            </div>
          )}
          <div className="space-y-2">
            {[1, 2, 3, 4].map(level => {
              const rule = tiers.find(t => t.tier_level === level);
              return (
                <div key={level} className="flex items-center gap-3 rounded-md px-4 py-3" style={{ border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
                  <div className="flex-1 min-w-0">
                    <span className={`font-semibold ${TIER_COLOR[level] ?? ""}`} style={!TIER_COLOR[level] ? { color: "var(--color-text-secondary)" } : undefined}>{rule?.name ?? tierLabel(level)}</span>
                    {rule ? (
                      <span className="ml-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
                        ≥{rule.min_points.toLocaleString()} pts · {rule.point_multiplier}× earn · {rule.discount_pct}% discount
                      </span>
                    ) : (
                      <span className="ml-3 text-xs italic" style={{ color: "var(--color-text-muted)" }}>not configured</span>
                    )}
                  </div>
                  {canManage && (
                    <button type="button" onClick={() => openEdit(level)} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                      {rule ? "Edit" : "Configure"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {editing !== null && (
        <div className="mt-4 rounded-md p-4 space-y-3" style={{ border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Edit Tier {editing}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" style={{ border: "1px solid var(--color-border)" }} placeholder="e.g. Gold" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Min Points</label>
              <input type="number" value={form.minPoints} onChange={e => setForm(f => ({ ...f, minPoints: e.target.value }))} className="w-full rounded px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" style={{ border: "1px solid var(--color-border)" }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Point Multiplier</label>
              <input type="number" step="0.25" value={form.pointMultiplier} onChange={e => setForm(f => ({ ...f, pointMultiplier: e.target.value }))} className="w-full rounded px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" style={{ border: "1px solid var(--color-border)" }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Discount %</label>
              <input type="number" step="0.5" value={form.discountPct} onChange={e => setForm(f => ({ ...f, discountPct: e.target.value }))} className="w-full rounded px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" style={{ border: "1px solid var(--color-border)" }} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => void save()} disabled={busy || !form.name.trim()} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: "var(--color-sidebar-bg)" }}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-md px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-subtle)]" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>Cancel</button>
          </div>
        </div>
      )}
    </Card>
  );
}
