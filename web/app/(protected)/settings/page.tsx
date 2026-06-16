"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getUser } from "@/lib/auth";
import { apiGet, apiPut, apiPost, apiDelete } from "@/api-client/client";
import { useToast } from "@/components/Toast";
import { formatMoney } from "@/lib/money";

type Section = "store" | "shipping" | "terms" | "modes" | "tax" | "flags" | "security";

interface Business { [key: string]: unknown }
interface ShippingMethod { id: string; name: string; amountCents: number; freeLimitCents?: number; ecommerce?: boolean; sequence?: number }
interface PaymentTerm { id: string; name: string; daysDue: number; description?: string }
interface PaymentMode { id: string; name: string }
interface TaxRate { id: string; name: string; rateBps: number; applyToCategory?: string; state?: string }

export default function SettingsPage() {
  const role = getUser()?.role ?? "cashier";
  const canManage = role === "owner" || role === "manager";
  const [section, setSection] = useState<Section>("store");
  const { addToast } = useToast();

  return (
    <EnterpriseShell active="settings" title="Settings" subtitle="Store, payments, shipping, and feature flags" contentClassName="overflow-y-auto">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-4 py-6 xl:grid-cols-[16rem_1fr]">
        <Card className="h-fit p-2">
          <nav aria-label="Settings sections" className="flex flex-col gap-1">
            {(["store", "shipping", "terms", "modes", "tax", "flags", "security"] as Section[]).map((s) => (
              <SectionButton key={s} active={section === s} onClick={() => setSection(s)} label={sectionLabel(s)} />
            ))}
          </nav>
        </Card>

        <div className="flex flex-col gap-5 min-w-0">
          {section === "store" && <StoreSection canManage={canManage} addToast={addToast} />}
          {section === "shipping" && <ShippingSection canManage={canManage} addToast={addToast} />}
          {section === "terms" && <TermsSection canManage={canManage} addToast={addToast} />}
          {section === "modes" && <ModesSection canManage={canManage} addToast={addToast} />}
          {section === "tax" && <TaxSection canManage={canManage} addToast={addToast} />}
          {section === "flags" && <FlagsSection canManage={canManage} addToast={addToast} />}
          {section === "security" && <SecuritySection />}
        </div>
      </div>
    </EnterpriseShell>
  );
}

function sectionLabel(s: Section): string {
  return { store: "Store profile", shipping: "Shipping methods", terms: "Payment terms", modes: "Payment modes", tax: "Tax rates", flags: "Feature flags", security: "Security" }[s];
}

// ─── Store Profile ────────────────────────────────────────────────────────────

const BUSINESS_FIELDS: { key: string; label: string; type?: string }[] = [
  { key: "name", label: "Store name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State / Province" },
  { key: "zip", label: "ZIP / Postal code" },
  { key: "country", label: "Country" },
  { key: "currency", label: "Currency" },
  { key: "timezone", label: "Timezone" },
  { key: "receiptFooter", label: "Receipt footer" },
  { key: "taxId", label: "Tax ID" },
];

function StoreSection({ canManage, addToast }: { canManage: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  const [data, setData] = useState<Business>({});
  const [editing, setEditing] = useState<Business | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Business>("/api/v1/settings/business")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const updated = await apiPut<Business>("/api/v1/settings/business", editing);
      setData(updated);
      setEditing(null);
      addToast({ title: "Store profile saved", variant: "success" });
    } catch (e) {
      addToast({ title: "Save failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const current = editing ?? data;

  return (
    <Card className="flex flex-col gap-4">
      {error && <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Store profile</h2>
          <p className="text-sm text-gray-500">Business identity used on receipts, invoices, and reports.</p>
        </div>
        {canManage && !editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing({ ...data })}>Edit</Button>
        )}
        {editing && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={busy} onClick={save}>Save</Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {BUSINESS_FIELDS.map(({ key, label, type }) =>
          editing ? (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <input
                type={type ?? "text"}
                value={String(editing[key] ?? "")}
                onChange={(e) => setEditing((prev) => ({ ...prev!, [key]: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600 outline-none"
              />
            </div>
          ) : (
            <ReadField key={key} label={label} value={String(current[key] ?? "—")} />
          )
        )}
      </div>
    </Card>
  );
}

// ─── Shipping Methods ─────────────────────────────────────────────────────────

function ShippingSection({ canManage, addToast }: { canManage: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  const [items, setItems] = useState<ShippingMethod[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ name: string; amountCents: string; freeLimit: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShippingMethod | null>(null);

  const load = useCallback(() => {
    apiGet<{ items: ShippingMethod[] }>("/api/v1/settings/shipping-methods").then((r) => setItems(r.items ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form || !form.name.trim()) return;
    setBusy(true);
    try {
      await apiPost("/api/v1/settings/shipping-methods", {
        name: form.name.trim(),
        amountCents: Math.round(parseFloat(form.amountCents || "0") * 100),
        freeLimitCents: form.freeLimit ? Math.round(parseFloat(form.freeLimit) * 100) : undefined,
      });
      setForm(null);
      load();
      addToast({ title: "Shipping method added", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await apiDelete(`/api/v1/settings/shipping-methods/${id}`);
      setDeleteTarget(null);
      load();
      addToast({ title: "Shipping method removed", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  return (
    <>
      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove shipping method"
        message={`Remove "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => deleteTarget && remove(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Shipping methods</h2>
            <p className="text-sm text-gray-500">Available options at checkout and on invoices.</p>
          </div>
          {canManage && !form && (
            <Button variant="primary" size="sm" onClick={() => setForm({ name: "", amountCents: "0", freeLimit: "" })}>Add method</Button>
          )}
        </div>
        {form && canManage && (
          <div className="border-b bg-gray-50 px-4 py-4">
            <div className="flex flex-wrap gap-3">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f!, name: e.target.value }))} placeholder="Name" className="flex-1 min-w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600" />
              <input value={form.amountCents} onChange={(e) => setForm((f) => ({ ...f!, amountCents: e.target.value }))} placeholder="Rate ($)" type="number" min="0" step="0.01" className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600" />
              <input value={form.freeLimit} onChange={(e) => setForm((f) => ({ ...f!, freeLimit: e.target.value }))} placeholder="Free above ($)" type="number" min="0" step="0.01" className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600" />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
                <Button size="sm" variant="primary" loading={busy} disabled={!form.name.trim()} onClick={add}>Add</Button>
              </div>
            </div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500"><th className="px-4 py-3">Name</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Free above</th>{canManage && <th className="px-4 py-3" />}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No shipping methods yet</td></tr>}
            {items.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium">{m.name}</td>
                <td className="px-4 py-3">{formatMoney(m.amountCents)}</td>
                <td className="px-4 py-3">{m.freeLimitCents ? formatMoney(m.freeLimitCents) : "—"}</td>
                {canManage && <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setDeleteTarget(m)}>Remove</Button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ─── Payment Terms ────────────────────────────────────────────────────────────

function TermsSection({ canManage, addToast }: { canManage: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  const [items, setItems] = useState<PaymentTerm[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ name: string; daysDue: string; description: string } | null>(null);

  const load = useCallback(() => {
    apiGet<{ items: PaymentTerm[] }>("/api/v1/settings/payment-terms").then((r) => setItems(r.items ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form || !form.name.trim()) return;
    setBusy(true);
    try {
      await apiPost("/api/v1/settings/payment-terms", { name: form.name.trim(), daysDue: parseInt(form.daysDue || "0", 10), description: form.description.trim() || undefined });
      setForm(null);
      load();
      addToast({ title: "Payment term added", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Payment terms</h2>
          <p className="text-sm text-gray-500">Net terms available on invoices and sales orders.</p>
        </div>
        {canManage && !form && <Button variant="primary" size="sm" onClick={() => setForm({ name: "", daysDue: "30", description: "" })}>Add term</Button>}
      </div>
      {form && canManage && (
        <div className="border-b bg-gray-50 px-4 py-4">
          <div className="flex flex-wrap gap-3">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f!, name: e.target.value }))} placeholder='e.g. "Net 30"' className="flex-1 min-w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600" />
            <input value={form.daysDue} onChange={(e) => setForm((f) => ({ ...f!, daysDue: e.target.value }))} placeholder="Days due" type="number" min="0" className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600" />
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f!, description: e.target.value }))} placeholder="Description (optional)" className="flex-1 min-w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600" />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
              <Button size="sm" variant="primary" loading={busy} disabled={!form.name.trim()} onClick={add}>Add</Button>
            </div>
          </div>
        </div>
      )}
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500"><th className="px-4 py-3">Name</th><th className="px-4 py-3">Days due</th><th className="px-4 py-3">Description</th></tr></thead>
        <tbody className="divide-y divide-gray-100">
          {items.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No payment terms yet</td></tr>}
          {items.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 font-medium">{t.name}</td>
              <td className="px-4 py-3">{t.daysDue}</td>
              <td className="px-4 py-3 text-gray-500">{t.description ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Payment Modes ────────────────────────────────────────────────────────────

function ModesSection({ canManage, addToast }: { canManage: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  const [items, setItems] = useState<PaymentMode[]>([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    apiGet<{ items: PaymentMode[] }>("/api/v1/settings/payment-modes").then((r) => setItems(r.items ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiPost("/api/v1/settings/payment-modes", { name: name.trim() });
      setName(""); setAdding(false);
      load();
      addToast({ title: "Payment mode added", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Payment modes</h2>
          <p className="text-sm text-gray-500">Tender types accepted at checkout (cash, card, etc.).</p>
        </div>
        {canManage && !adding && <Button variant="primary" size="sm" onClick={() => setAdding(true)}>Add mode</Button>}
      </div>
      {adding && canManage && (
        <div className="border-b bg-gray-50 px-4 py-4 flex gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "Bank transfer"' className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600" />
          <Button size="sm" variant="secondary" onClick={() => { setAdding(false); setName(""); }}>Cancel</Button>
          <Button size="sm" variant="primary" loading={busy} disabled={!name.trim()} onClick={add}>Add</Button>
        </div>
      )}
      <ul className="divide-y divide-gray-100">
        {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No payment modes yet</li>}
        {items.map((m) => <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm"><span className="font-medium">{m.name}</span></li>)}
      </ul>
    </Card>
  );
}

// ─── Tax Rates ────────────────────────────────────────────────────────────────

function TaxSection({ canManage, addToast }: { canManage: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  const [items, setItems] = useState<TaxRate[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ name: string; ratePct: string; category: string; state: string } | null>(null);

  const load = useCallback(() => {
    apiGet<{ items: TaxRate[] }>("/api/v1/settings/tax-rates").then((r) => setItems(r.items ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form || !form.name.trim()) return;
    setBusy(true);
    try {
      await apiPost("/api/v1/settings/tax-rates", {
        name: form.name.trim(),
        rateBps: Math.round(parseFloat(form.ratePct || "0") * 100),
        applyToCategory: form.category.trim() || undefined,
        state: form.state.trim() || undefined,
      });
      setForm(null);
      load();
      addToast({ title: "Tax rate added", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Tax rates</h2>
          <p className="text-sm text-gray-500">Configured rates applied to line items at checkout.</p>
        </div>
        {canManage && !form && <Button variant="primary" size="sm" onClick={() => setForm({ name: "", ratePct: "", category: "", state: "" })}>Add rate</Button>}
      </div>
      {form && canManage && (
        <div className="border-b bg-gray-50 px-4 py-4">
          <div className="flex flex-wrap gap-3">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f!, name: e.target.value }))} placeholder='e.g. "CA Sales Tax"' className="flex-1 min-w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600" />
            <input value={form.ratePct} onChange={(e) => setForm((f) => ({ ...f!, ratePct: e.target.value }))} placeholder="Rate %" type="number" min="0" step="0.01" className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600" />
            <input value={form.category} onChange={(e) => setForm((f) => ({ ...f!, category: e.target.value }))} placeholder="Category (optional)" className="flex-1 min-w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600" />
            <input value={form.state} onChange={(e) => setForm((f) => ({ ...f!, state: e.target.value }))} placeholder="State (optional)" className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600" />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
              <Button size="sm" variant="primary" loading={busy} disabled={!form.name.trim() || !form.ratePct} onClick={add}>Add</Button>
            </div>
          </div>
        </div>
      )}
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500"><th className="px-4 py-3">Name</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">State</th></tr></thead>
        <tbody className="divide-y divide-gray-100">
          {items.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No tax rates yet</td></tr>}
          {items.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 font-medium">{t.name}</td>
              <td className="px-4 py-3">{(t.rateBps / 100).toFixed(2)}%</td>
              <td className="px-4 py-3 text-gray-500">{t.applyToCategory ?? "All"}</td>
              <td className="px-4 py-3 text-gray-500">{t.state ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Feature Flags ────────────────────────────────────────────────────────────

function FlagsSection({ canManage, addToast }: { canManage: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  useEffect(() => {
    apiGet<Record<string, boolean>>("/api/v1/settings/feature-flags").then((f) => setFlags(f));
  }, []);

  const merged = useMemo(() => ({ ...flags, ...dirty }), [flags, dirty]);

  const toggle = (key: string) => {
    if (!canManage) return;
    setDirty((d) => ({ ...d, [key]: !merged[key] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await apiPut<Record<string, boolean>>("/api/v1/settings/feature-flags", merged);
      setFlags(updated);
      setDirty({});
      addToast({ title: "Feature flags saved", variant: "success" });
    } catch (e) {
      addToast({ title: "Save failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setSaving(false); }
  };

  const hasDirty = Object.keys(dirty).length > 0;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Feature flags</h2>
          <p className="text-sm text-gray-500">Per-tenant toggles. Manager or owner required to change.</p>
        </div>
        {canManage && hasDirty && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDirty({})}>Reset</Button>
            <Button size="sm" variant="primary" loading={saving} onClick={save}>Save changes</Button>
          </div>
        )}
      </div>
      <ul className="divide-y divide-gray-100">
        {Object.entries(merged).length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No feature flags configured</li>}
        {Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)).map(([key, enabled]) => (
          <li key={key} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="font-mono text-sm font-semibold text-gray-900">{key}</span>
            <button
              type="button"
              disabled={!canManage}
              aria-pressed={enabled}
              onClick={() => toggle(key)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-brand-600" : "bg-gray-300"} ${!canManage ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
            >
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
              <span className="sr-only">{key}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Security ─────────────────────────────────────────────────────────────────

function SecuritySection() {
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Multi-factor authentication</h2>
            <p className="text-sm text-gray-500">Add an extra layer of sign-in security to your account.</p>
          </div>
          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">Not enabled</span>
        </div>
        <p className="text-sm text-gray-500">MFA enrollment is not yet wired to the backend. Once implemented, you'll be prompted for a second factor at <span className="font-mono">/login/mfa</span> on every sign-in.</p>
        <Button variant="primary" size="sm" disabled>Set up MFA</Button>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-gray-900">Security posture</h2>
        <div className="flex flex-col gap-2 text-sm">
          <SecurityRow label="Role-based access" value="Enabled" ok />
          <SecurityRow label="Access token TTL" value="15 minutes" ok />
          <SecurityRow label="Refresh token rotation" value="Planned (BE-2)" />
          <SecurityRow label="MFA" value="Planned" />
          <SecurityRow label="Rate limiting" value="In-memory (DB-2 pending)" />
          <SecurityRow label="Row-level security" value="Planned (DB-1)" />
          <SecurityRow label="Audit log" value="Backend-owned" ok />
        </div>
      </Card>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-gray-900 break-words">{value}</p>
    </div>
  );
}

function SecurityRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <span className="text-gray-600">{label}</span>
      <span className={`font-semibold ${ok ? "text-green-700" : "text-gray-500"}`}>{value}</span>
    </div>
  );
}

function SectionButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] rounded-lg px-3 text-left text-sm font-medium transition-colors ${active ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
    >
      {label}
    </button>
  );
}
