import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/lib/router";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { apiGet, apiPost, apiPatch, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { TeeSlot, TeeSlotStatus } from "@/api-client/types";

type BadgeVariant = "green" | "yellow" | "red" | "gray" | "blue" | "purple";

const SLOT_BADGE: Record<TeeSlotStatus, BadgeVariant> = {
  available: "green",
  booked: "blue",
  hold: "yellow",
  closed: "gray",
};

const SLOT_LABEL: Record<TeeSlotStatus, string> = {
  available: "Available",
  booked: "Booked",
  hold: "Hold",
  closed: "Closed",
};

interface SlotResponse { items: TeeSlot[]; date: string; }

interface SlotFormState {
  date: string;
  tee_time: string;
  holes: "9" | "18";
  max_players: string;
  price_cents: string;
  cart_fee_cents: string;
  notes: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function AddSlotModal({ date, onClose, onSaved }: { date: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<SlotFormState>({
    date,
    tee_time: "08:00",
    holes: "18",
    max_players: "4",
    price_cents: "95.00",
    cart_fee_cents: "18.00",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (k: keyof SlotFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await apiPost("/api/v1/golf/tee-slots", {
        date: form.date,
        tee_time: form.tee_time,
        holes: Number(form.holes),
        max_players: Number(form.max_players),
        price_cents: Math.round(parseFloat(form.price_cents) * 100),
        cart_fee_cents: Math.round(parseFloat(form.cart_fee_cents) * 100),
        notes: form.notes.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Failed to add slot.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onClose}>
      <div className="w-full max-w-md rounded-xl shadow-xl flex flex-col"
           style={{ backgroundColor: "var(--color-surface)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Add Tee Slot</h2>
          <button type="button" onClick={onClose} aria-label="Close"
                  className="text-xl leading-none" style={{ color: "var(--color-text-muted)" }}>&times;</button>
        </div>
        <form id="slot-form" onSubmit={submit} className="flex flex-col gap-3 px-5 py-4">
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }} htmlFor="sf-date">Date</label>
              <input id="sf-date" type="date" value={form.date} onChange={field("date")} required
                     className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-600"
                     style={{ border: "1px solid var(--color-border)" }} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }} htmlFor="sf-time">Tee Time</label>
              <input id="sf-time" type="time" value={form.tee_time} onChange={field("tee_time")} required
                     className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-600"
                     style={{ border: "1px solid var(--color-border)" }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }} htmlFor="sf-holes">Holes</label>
              <select id="sf-holes" value={form.holes} onChange={field("holes")}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-600"
                      style={{ border: "1px solid var(--color-border)" }}>
                <option value="9">9 Holes</option>
                <option value="18">18 Holes</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }} htmlFor="sf-max">Max Players</label>
              <input id="sf-max" type="number" min="1" max="8" value={form.max_players} onChange={field("max_players")} required
                     className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-600"
                     style={{ border: "1px solid var(--color-border)" }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }} htmlFor="sf-price">Green Fee ($)</label>
              <input id="sf-price" type="number" step="0.01" min="0" value={form.price_cents} onChange={field("price_cents")} required
                     className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-600"
                     style={{ border: "1px solid var(--color-border)" }} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }} htmlFor="sf-cart">Cart Fee ($)</label>
              <input id="sf-cart" type="number" step="0.01" min="0" value={form.cart_fee_cents} onChange={field("cart_fee_cents")} required
                     className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-600"
                     style={{ border: "1px solid var(--color-border)" }} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }} htmlFor="sf-notes">Notes</label>
            <textarea id="sf-notes" rows={2} value={form.notes} onChange={field("notes")} placeholder="Optional…"
                      className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-600"
                      style={{ border: "1px solid var(--color-border)" }} />
          </div>
        </form>
        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--color-border)" }}>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" type="submit" form="slot-form" disabled={saving}>
            {saving ? "Adding…" : "Add Slot"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: TeeSlotStatus }) {
  return <Badge variant={SLOT_BADGE[status]}>{SLOT_LABEL[status]}</Badge>;
}

function SlotCard({ slot, onStatusChange }: { slot: TeeSlot; onStatusChange: () => void }) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);

  async function setStatus(status: TeeSlotStatus) {
    setUpdating(true);
    try { await apiPatch(`/api/v1/golf/tee-slots/${slot.id}`, { status }); onStatusChange(); }
    finally { setUpdating(false); }
  }

  const pct = slot.max_players > 0 ? Math.round((slot.booked_players / slot.max_players) * 100) : 0;
  const barColor = slot.status === "booked" ? "bg-blue-500" : slot.status === "available" ? "bg-green-500" : "bg-[var(--color-surface-subtle)]";

  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-2 transition-opacity ${updating ? "opacity-50" : ""}`}
      style={{
        borderColor: slot.status === "closed" ? "var(--color-border)" : "var(--color-border)",
        backgroundColor: slot.status === "closed" ? "var(--color-surface-subtle)" : "var(--color-surface)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>{slot.tee_time}</p>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{slot.holes} holes</p>
        </div>
        <StatusPill status={slot.status} />
      </div>

      {/* Capacity bar */}
      <div>
        <div className="mb-1 flex justify-between text-xs" style={{ color: "var(--color-text-muted)" }}>
          <span>{slot.booked_players}/{slot.max_players} players</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-subtle)]">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
        Green fee: <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{formatMoney(slot.price_cents)}</span>
        {" · "}Cart: <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{formatMoney(slot.cart_fee_cents)}</span>
      </div>

      {slot.notes && <p className="text-xs italic" style={{ color: "var(--color-text-muted)" }}>{slot.notes}</p>}

      <div className="flex gap-1.5 pt-1">
        <button onClick={() => router.push(`/golf/bookings?slot=${slot.id}`)}
                disabled={slot.status === "closed"}
                className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed">
          Book
        </button>
        {slot.status !== "closed" && (
          <button onClick={() => setStatus("closed")} disabled={updating}
                  className="rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--color-surface-subtle)]"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
            Close
          </button>
        )}
        {slot.status === "closed" && (
          <button onClick={() => setStatus("available")} disabled={updating}
                  className="rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--color-surface-subtle)]"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
            Reopen
          </button>
        )}
        {slot.status === "available" && (
          <button onClick={() => setStatus("hold")} disabled={updating}
                  className="rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--color-surface-subtle)]"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
            Hold
          </button>
        )}
        {slot.status === "hold" && (
          <button onClick={() => setStatus("available")} disabled={updating}
                  className="rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--color-surface-subtle)]"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
            Release
          </button>
        )}
      </div>
    </div>
  );
}

export default function GolfTeeSheetPage() {
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState<TeeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiGet<SlotResponse>(`/api/v1/golf/tee-sheet?date=${date}`);
      setSlots(data.items ?? []);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load tee sheet.");
    } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  const byHoles: Record<number, TeeSlot[]> = {};
  for (const s of slots) {
    if (!byHoles[s.holes]) byHoles[s.holes] = [];
    byHoles[s.holes].push(s);
  }

  const summary = {
    total: slots.length,
    available: slots.filter(s => s.status === "available").length,
    booked: slots.filter(s => s.status === "booked").length,
    hold: slots.filter(s => s.status === "hold").length,
  };

  return (
    <EnterpriseShell active="golf" title="Tee Sheet" subtitle="Manage tee times and availability"
      contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6">

        {/* Sub-nav */}
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/golf" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white">Tee Sheet</a>
          <a href="/golf/bookings" className="rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-subtle)]"
             style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>Bookings</a>
          <a href="/golf/members" className="rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-subtle)]"
             style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>Members</a>
          <a href="/golf/pro-shop" className="rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-subtle)]"
             style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>Pro Shop</a>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
                   className="rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-600"
                   style={{ border: "1px solid var(--color-border)" }} />
            <div className="flex gap-1">
              <button onClick={() => setDate(d => { const dt = new Date(d); dt.setDate(dt.getDate() - 1); return dt.toISOString().slice(0, 10); })}
                      className="rounded-lg px-2 py-2 text-sm hover:bg-[var(--color-surface-subtle)]"
                      style={{ border: "1px solid var(--color-border)" }} aria-label="Previous day">‹</button>
              <button onClick={() => setDate(todayISO())}
                      className="rounded-lg px-3 py-2 text-xs hover:bg-[var(--color-surface-subtle)]"
                      style={{ border: "1px solid var(--color-border)" }}>Today</button>
              <button onClick={() => setDate(d => { const dt = new Date(d); dt.setDate(dt.getDate() + 1); return dt.toISOString().slice(0, 10); })}
                      className="rounded-lg px-2 py-2 text-sm hover:bg-[var(--color-surface-subtle)]"
                      style={{ border: "1px solid var(--color-border)" }} aria-label="Next day">›</button>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ Add Slot</Button>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>{summary.total} slots</span>
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">{summary.available} available</span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{summary.booked} booked</span>
          {summary.hold > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">{summary.hold} on hold</span>}
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-skeleton rounded-xl" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>No tee slots for {date}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Add slots manually or configure recurring slots in Settings.</p>
            <button onClick={() => setShowAdd(true)}
                    className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Add First Slot
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {[18, 9].filter(h => byHoles[h]?.length).map(h => (
              <div key={h}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{h} Holes</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {byHoles[h].map(slot => (
                    <SlotCard key={slot.id} slot={slot} onStatusChange={load} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddSlotModal date={date} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); void load(); }} />
      )}
    </EnterpriseShell>
  );
}
