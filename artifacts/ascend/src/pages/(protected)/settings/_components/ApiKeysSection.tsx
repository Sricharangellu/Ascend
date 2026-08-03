
import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiDelete } from "@/api-client/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { fmtDate } from "@/lib/date";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
  return `${Math.floor(diffMonths / 12)} year${Math.floor(diffMonths / 12) > 1 ? "s" : ""} ago`;
}

const ALL_SCOPES = ["read", "write", "admin"] as const;

export function ApiKeysSection({ canManage, addToast }: { canManage: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  const [items, setItems] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", scopes: [] as string[], expiresAt: "" });
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<{ key: string; copied: boolean } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: ApiKey[] }>("/api/identity/api-keys")
      .then(r => setItems(r.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: form.name.trim() };
      if (form.scopes.length > 0) body.scopes = JSON.stringify(form.scopes);
      if (form.expiresAt) body.expiresAt = form.expiresAt;
      const res = await apiPost<{ id: string; key: string; prefix: string }>("/api/identity/api-keys", body);
      setNewKey({ key: res.key, copied: false });
      setShowForm(false);
      setForm({ name: "", scopes: [], expiresAt: "" });
      load();
      addToast({ title: "API key created", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed to create key", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await apiDelete(`/api/identity/api-keys/${id}`);
      setDeleteTarget(null);
      if (newKey) setNewKey(null);
      load();
      addToast({ title: "API key revoked", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed to revoke key", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  const toggleScope = (scope: string) => {
    setForm(f => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter(s => s !== scope) : [...f.scopes, scope],
    }));
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.key);
      setNewKey(k => k ? { ...k, copied: true } : k);
    } catch {
      // clipboard not available
    }
  };

  return (
    <>
      <ConfirmDialog
        open={!!deleteTarget}
        title="Revoke API key"
        message={`Revoke key "${deleteTarget?.name}"? Any integrations using this key will stop working immediately.`}
        confirmLabel="Revoke"
        destructive
        onConfirm={() => deleteTarget && void revoke(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>API Keys</h2>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>API keys grant programmatic access to Ascend. Only show the full key once at creation — it cannot be retrieved again.</p>
          </div>
          {canManage && !showForm && (
            <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>Create key</Button>
          )}
        </div>

        {newKey && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-600">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">Your new API key (shown once)</p>
                <p className="mt-1 text-xs text-amber-700">Copy this key now. You will not be able to see it again after you dismiss this notice.</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 min-w-0 truncate rounded bg-amber-100 px-3 py-1.5 font-mono text-xs text-amber-950 border border-amber-200">
                    {newKey.key}
                  </code>
                  <Button size="sm" variant="secondary" onClick={() => void copyKey()}>
                    {newKey.copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Dismiss</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showForm && canManage && (
          <div className="px-4 py-4 space-y-3" style={{ borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
            <div className="flex flex-wrap gap-3">
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Key name (e.g. integration name)"
                className="flex-1 min-w-48 rounded-md px-3 py-2 text-sm outline-none"
                style={{ border: "1px solid var(--color-border)" }}
              />
              <input
                type="date"
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="w-44 rounded-md px-3 py-2 text-sm outline-none"
                style={{ border: "1px solid var(--color-border)" }}
                title="Expiry date (optional)"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>Scopes</span>
              {ALL_SCOPES.map(scope => (
                <label key={scope} className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={form.scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="h-4 w-4 rounded accent-blue-600"
                    style={{ borderColor: "var(--color-border)" }}
                  />
                  <span className="capitalize">{scope}</span>
                </label>
              ))}
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" variant="primary" loading={busy} disabled={!form.name.trim()} onClick={() => void create()}>Create</Button>
              </div>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.08em]" style={{ borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}>
              <th className="px-4 py-3">Key name</th>
              <th className="px-4 py-3">Prefix</th>
              <th className="px-4 py-3">Scopes</th>
              <th className="px-4 py-3">Last used</th>
              <th className="px-4 py-3">Expires</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-table-border)]">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center" style={{ color: "var(--color-text-muted)" }}>Loading…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center" style={{ color: "var(--color-text-muted)" }}>No API keys. Create one to enable programmatic access.</td></tr>
            )}
            {items.map(key => {
              let parsedScopes: string[] = [];
              try { parsedScopes = JSON.parse(key.scopes ?? "[]"); } catch { parsedScopes = []; }
              return (
                <tr key={key.id} className="hover:bg-[var(--color-surface-subtle)]">
                  <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{key.name}</td>
                  <td className="px-4 py-3">
                    <code className="rounded px-1.5 py-0.5 font-mono text-xs" style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
                      {key.key_prefix}{"••••••••"}
                    </code>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-muted)" }}>
                    {parsedScopes.length > 0 ? parsedScopes.join(", ") : "all"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-muted)" }}>
                    {key.last_used_at ? relativeTime(key.last_used_at) : "Never"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-muted)" }}>
                    {key.expires_at ? fmtDate(new Date(key.expires_at).getTime()) : "Never"}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(key)}>Revoke</Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
