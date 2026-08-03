
import { useState, useCallback, useEffect } from "react";
import { apiGet, apiPost } from "@/api-client/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import type { Account } from "@/api-client/types";

export function CoaSection({ canManage }: { canManage: boolean }) {
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", type: "asset" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: Account[] }>("/api/v1/accounting/accounts")
      .then(r => setAccounts(r.items ?? []))
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    setBusy(true);
    try {
      await apiPost("/api/v1/accounting/accounts", { code: form.code.trim(), name: form.name.trim(), type: form.type });
      setShowAdd(false);
      setForm({ code: "", name: "", type: "asset" });
      load();
      addToast({ title: "Account added", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  const typeOrder = ["asset", "liability", "income", "expense"];
  const grouped = typeOrder.reduce<Record<string, Account[]>>((acc, t) => {
    acc[t] = accounts.filter(a => a.type === t);
    return acc;
  }, {});
  accounts.forEach(a => {
    if (!typeOrder.includes(a.type)) {
      if (!grouped[a.type]) grouped[a.type] = [];
      grouped[a.type]!.push(a);
    }
  });

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Chart of Accounts</h2>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>General ledger accounts grouped by type.</p>
        </div>
        {canManage && !showAdd && <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>Add account</Button>}
      </div>
      {showAdd && canManage && (
        <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
          <div className="flex flex-wrap gap-3">
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="Code (e.g. 1000)" className="w-28 rounded-md px-3 py-2 text-sm outline-none" style={{ border: "1px solid var(--color-border)" }} />
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Account name" className="flex-1 min-w-40 rounded-md px-3 py-2 text-sm outline-none" style={{ border: "1px solid var(--color-border)" }} />
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="rounded-md px-3 py-2 text-sm outline-none" style={{ border: "1px solid var(--color-border)" }}>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" variant="primary" loading={busy} disabled={!form.code.trim() || !form.name.trim()} onClick={add}>Add</Button>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading accounts…</div>
      ) : accounts.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No accounts yet. Add your first account above.</div>
      ) : (
        <div className="divide-y divide-[var(--color-table-border)]">
          {Object.entries(grouped).filter(([, rows]) => rows.length > 0).map(([type, rows]) => (
            <div key={type}>
              <div className="px-4 py-2" style={{ backgroundColor: "var(--color-table-header)" }}>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{type}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-[var(--color-table-border)]">
                  {rows.sort((a, b) => a.code.localeCompare(b.code)).map(account => (
                    <tr key={account.id} className="hover:bg-[var(--color-surface-subtle)]">
                      <td className="px-4 py-3 w-24"><span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-subtle)" }}>{account.code}</span></td>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{account.name}</td>
                      <td className="px-4 py-3 capitalize" style={{ color: "var(--color-text-muted)" }}>{account.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
