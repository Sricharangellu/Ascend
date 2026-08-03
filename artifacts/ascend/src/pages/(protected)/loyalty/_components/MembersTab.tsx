
import React, { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { TableSkeleton } from "@/components/TableSkeleton";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { fmtDate } from "@/lib/date";
import type { LoyaltyTier, LoyaltyMember, LoyaltyMembersResponse, LoyaltyTierLevel } from "@/api-client/types";

const TIER_BADGE: Record<LoyaltyTierLevel, "yellow" | "gray" | "green" | "purple"> = {
  bronze: "yellow",
  silver: "gray",
  gold: "green",
  platinum: "purple",
};

const inputCls =
  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "mb-1 block text-sm font-medium";

// ── AdjustModal ────────────────────────────────────────────────────────────────

function AdjustModal({
  member,
  onSave,
  onClose,
}: {
  member: LoyaltyMember;
  onSave: () => void;
  onClose: () => void;
}) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = Number(delta);
    if (!d || isNaN(d)) { setErr("Enter a non-zero number of points."); return; }
    setSaving(true); setErr(null);
    try {
      await apiPost(`/api/v1/loyalty/members/${member.id}/adjust`, { delta: d, reason: reason.trim() || undefined });
      onSave();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiResponseError ? e.message : "Failed to adjust points.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex w-full max-w-sm flex-col rounded-xl shadow-xl" style={{ backgroundColor: "var(--color-surface)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Adjust Points</h2>
          <button type="button" onClick={onClose} className="text-xl leading-none" style={{ color: "var(--color-text-muted)" }}>&times;</button>
        </div>
        <form id="adjust-form" onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {err && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: "var(--color-surface-subtle)" }}>
            <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>{member.customer_name}</p>
            <p style={{ color: "var(--color-text-muted)" }}>Current balance: <span className="font-medium" style={{ color: "var(--color-text-secondary)" }}>{member.points_balance.toLocaleString()} pts</span></p>
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--color-text-secondary)" }}>Points adjustment <span className="text-red-500">*</span></label>
            <input className={inputCls} style={{ borderColor: "var(--color-border)" }} type="number" value={delta} onChange={e => setDelta(e.target.value)}
              placeholder="e.g. +50 to add, -20 to deduct" required />
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Positive adds points · Negative deducts points</p>
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--color-text-secondary)" }}>Reason <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span></label>
            <input className={inputCls} style={{ borderColor: "var(--color-border)" }} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Goodwill adjustment, correction" />
          </div>
        </form>
        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-subtle)]"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
            Cancel
          </button>
          <button type="submit" form="adjust-form" disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving…" : "Apply adjustment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MembersTab ─────────────────────────────────────────────────────────────────

export function MembersTab({ tiers }: { tiers: LoyaltyTier[] }) {
  const [members, setMembers] = useState<LoyaltyMember[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [adjustMember, setAdjustMember] = useState<LoyaltyMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (filterTier !== "all") params.set("tier_id", filterTier);
      const data = await apiGet<LoyaltyMembersResponse>(`/api/v1/loyalty/members?${params}`);
      setMembers(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load members.");
    } finally { setLoading(false); }
  }, [search, filterTier]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="min-w-48 flex-1">
            <input className={inputCls} style={{ borderColor: "var(--color-border)" }} placeholder="Search members…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select
            className="rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ border: "1px solid var(--color-border)" }}
            value={filterTier} onChange={e => setFilterTier(e.target.value)}>
            <option value="all">All tiers</option>
            {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{total} members</span>
        </div>

        {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

        {loading ? (
          <TableSkeleton headers={["Customer", "Tier", "Balance", "Lifetime", "Joined", ""]} rows={8} />
        ) : members.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">No members found.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Lifetime</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-table-border)]">
              {members.map(m => (
                <tr key={m.id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                  <td className="px-4 py-3">
                    <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>{m.customer_name}</p>
                    {m.customer_email && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{m.customer_email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={TIER_BADGE[m.tier_level as LoyaltyTierLevel]}>{m.tier_name}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                    {m.points_balance.toLocaleString()} pts
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                    {m.points_lifetime.toLocaleString()} pts
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-muted)" }}>{fmtDate(m.joined_at)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setAdjustMember(m)}
                      className="rounded px-2 py-1 text-xs font-medium hover:bg-[var(--color-surface-subtle)]"
                      style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                      Adjust pts
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {adjustMember && (
        <AdjustModal member={adjustMember} onSave={load} onClose={() => setAdjustMember(null)} />
      )}
    </>
  );
}
