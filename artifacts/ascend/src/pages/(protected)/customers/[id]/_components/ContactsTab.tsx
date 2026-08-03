
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/api-client/client";
import type { useToast } from "@/components/Toast";

interface CustomerContact {
  id: string;
  contact_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
}

export function ContactsTab({
  customerId,
  canEdit,
  addToast,
}: {
  customerId: string;
  canEdit: boolean;
  addToast: ReturnType<typeof useToast>["addToast"];
}) {
  const [items, setItems] = useState<CustomerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ contact_name: "", title: "", email: "", phone: "", is_primary: false });
  const [editTarget, setEditTarget] = useState<CustomerContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerContact | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: CustomerContact[] }>(`/api/v1/customers/${customerId}/contacts`)
      .then((r) => setItems(r.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!form.contact_name.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/api/v1/customers/${customerId}/contacts`, {
        contactName: form.contact_name.trim(),
        title: form.title.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        isPrimary: form.is_primary,
      });
      setShowForm(false);
      setForm({ contact_name: "", title: "", email: "", phone: "", is_primary: false });
      load();
      addToast({ title: "Contact added", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setBusy(true);
    try {
      await apiPatch(`/api/v1/customers/${customerId}/contacts/${editTarget.id}`, {
        contactName: editTarget.contact_name,
        title: editTarget.title || null,
        email: editTarget.email || null,
        phone: editTarget.phone || null,
        isPrimary: editTarget.is_primary,
      });
      setEditTarget(null);
      load();
      addToast({ title: "Contact updated", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await apiDelete(`/api/v1/customers/${customerId}/contacts/${id}`);
      setDeleteTarget(null);
      load();
      addToast({ title: "Contact removed", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove contact"
        message={`Remove ${deleteTarget?.contact_name ?? "this contact"} from this account?`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => deleteTarget && void remove(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditTarget(null)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-2xl p-6 shadow-2xl"
            style={{ backgroundColor: "var(--color-surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Edit Contact</h2>
            <div className="space-y-3">
              <input
                value={editTarget.contact_name}
                onChange={(e) => setEditTarget((t) => t && ({ ...t, contact_name: e.target.value }))}
                placeholder="Name"
                className="w-full rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <input
                value={editTarget.title ?? ""}
                onChange={(e) => setEditTarget((t) => t && ({ ...t, title: e.target.value }))}
                placeholder="Title"
                className="w-full rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <input
                type="email"
                value={editTarget.email ?? ""}
                onChange={(e) => setEditTarget((t) => t && ({ ...t, email: e.target.value }))}
                placeholder="Email"
                className="w-full rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <input
                type="tel"
                value={editTarget.phone ?? ""}
                onChange={(e) => setEditTarget((t) => t && ({ ...t, phone: e.target.value }))}
                placeholder="Phone"
                className="w-full rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={editTarget.is_primary}
                  onChange={(e) => setEditTarget((t) => t && ({ ...t, is_primary: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
                Primary contact
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button size="sm" variant="primary" loading={busy} onClick={() => void saveEdit()}>Save</Button>
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Contacts</span>
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
              {items.length}
            </span>
          </div>
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "+ Add contact"}
            </Button>
          )}
        </div>

        {showForm && canEdit && (
          <div className="space-y-3 border-b px-4 py-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
            <div className="flex flex-wrap gap-3">
              <input
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                placeholder="Name (required)"
                className="min-w-36 flex-1 rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Title"
                className="w-36 rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Email"
                className="w-48 rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Phone"
                className="w-36 rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_primary}
                  onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
                Primary contact
              </label>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setShowForm(false);
                    setForm({ contact_name: "", title: "", email: "", phone: "", is_primary: false });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy}
                  disabled={!form.contact_name.trim()}
                  onClick={() => void add()}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Primary</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-table-border)]">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>Loading…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No contacts yet.</td></tr>
            )}
            {items.map((contact) => (
              <tr key={contact.id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                <td className="px-4 py-3 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{contact.contact_name}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>{contact.title ?? "—"}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>{contact.email ?? "—"}</td>
                <td className="px-4 py-3 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>{contact.phone ?? "—"}</td>
                <td className="px-4 py-3">
                  {contact.is_primary ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      Primary
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditTarget({ ...contact })}
                        className="text-[11px] text-brand-600 underline hover:text-brand-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(contact)}
                        className="text-[11px] text-danger-600 underline hover:text-danger-700"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
