
/**
 * /gift-cards — Issue, check balance, and void gift cards.
 *
 * Three panels:
 *  1. Issue — create a new card at a chosen amount
 *  2. Check balance — look up any card by code
 *  3. Card list — all cards with status, balance, void action
 */

import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { formatMoney, parseToCents } from "@/lib/money";
import { getUser } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { fmtDate } from "@/lib/date";

interface GiftCard {
  id: string;
  code: string;
  initial_cents: number;
  balance_cents: number;
  status: "active" | "redeemed" | "void";
  created_at: number;
}

const STATUS_BADGE: Record<string, "green" | "gray" | "red"> = {
  active: "green",
  redeemed: "gray",
  void: "red",
};

const QUICK_AMOUNTS = [25, 50, 100, 150, 200, 500];

export default function GiftCardsPage() {
  const user = getUser();
  const canManage = user?.role === "owner" || user?.role === "manager";
  const { addToast } = useToast();

  const [cards, setCards] = useState<GiftCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Issue form
  const [issueAmount, setIssueAmount] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issuedCard, setIssuedCard] = useState<GiftCard | null>(null);

  // Balance check
  const [checkCode, setCheckCode] = useState("");
  const [checkedCard, setCheckedCard] = useState<GiftCard | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: GiftCard[]; total: number }>("/api/v1/giftcards")
      .then(r => { setCards(r.items); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleIssue = async () => {
    const cents = parseToCents(issueAmount);
    if (!cents || cents <= 0) { addToast({ title: "Enter a valid amount", variant: "error" }); return; }
    setIssuing(true);
    try {
      const card = await apiPost<GiftCard>("/api/v1/giftcards", { amountCents: cents });
      setIssuedCard(card);
      setIssueAmount("");
      load();
      addToast({ title: `Gift card ${card.code} issued`, variant: "success" });
    } catch (e) {
      addToast({ title: "Failed to issue card", description: e instanceof Error ? e.message : undefined, variant: "error" });
    } finally { setIssuing(false); }
  };

  const handleCheck = async () => {
    const code = checkCode.trim().toUpperCase();
    if (!code) return;
    setChecking(true); setCheckError(null); setCheckedCard(null);
    try {
      const card = await apiGet<GiftCard>(`/api/v1/giftcards/${encodeURIComponent(code)}`);
      setCheckedCard(card);
    } catch (e) {
      setCheckError(e instanceof ApiResponseError && e.status === 404 ? "Card not found." : (e instanceof Error ? e.message : "Lookup failed."));
    } finally { setChecking(false); }
  };

  const handleVoid = async (code: string) => {
    try {
      await apiPost(`/api/v1/giftcards/${encodeURIComponent(code)}/void`, {});
      load();
      if (checkedCard?.code === code) setCheckedCard(prev => prev ? { ...prev, status: "void" } : null);
      addToast({ title: `Card ${code} voided`, variant: "success" });
    } catch (e) {
      addToast({ title: "Failed to void card", description: e instanceof Error ? e.message : undefined, variant: "error" });
    }
  };

  return (
    <EnterpriseShell active="gift-cards" title="Gift Cards" subtitle="Issue, check balance, and manage gift cards">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6">

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* ── Issue card ─────────────────────────────────────────────── */}
          {canManage && (
            <Card title="Issue Gift Card">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setIssueAmount(String(d))}
                      className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
                      style={issueAmount === String(d) ? {
                        backgroundColor: "var(--color-text-primary)",
                        borderColor: "var(--color-text-primary)",
                        color: "white",
                      } : {
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      ${d}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--color-text-muted)" }}>$</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={issueAmount}
                      onChange={e => setIssueAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") void handleIssue(); }}
                      placeholder="Custom amount"
                      className="w-full rounded-md pl-7 pr-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
                      style={{ border: "1px solid var(--color-border)" }}
                    />
                  </div>
                  <Button variant="primary" loading={issuing} disabled={!issueAmount || issuing} onClick={() => void handleIssue()}>
                    Issue
                  </Button>
                </div>

                {issuedCard && (
                  <div className="rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 p-4 text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-1">Card issued</p>
                    <p className="text-2xl font-bold tracking-widest font-mono" style={{ color: "var(--color-text-primary)" }}>{issuedCard.code}</p>
                    <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>Balance: <span className="font-semibold">{formatMoney(issuedCard.balance_cents)}</span></p>
                    <button onClick={() => void navigator.clipboard.writeText(issuedCard.code).then(() => addToast({ title: "Code copied", variant: "success" }))} className="mt-2 text-xs text-emerald-700 hover:text-emerald-900 font-medium">
                      Copy code
                    </button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* ── Check balance ──────────────────────────────────────────── */}
          <Card title="Check Balance">
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={checkCode}
                  onChange={e => setCheckCode(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter") void handleCheck(); }}
                  placeholder="GC-XXXX-XXXX-XXXX"
                  className="flex-1 rounded-md px-3 py-2.5 text-sm font-mono uppercase tracking-wider focus:border-brand-500 focus:outline-none"
                  style={{ border: "1px solid var(--color-border)" }}
                />
                <Button variant="secondary" loading={checking} disabled={!checkCode.trim() || checking} onClick={() => void handleCheck()}>
                  Check
                </Button>
              </div>

              {checkError && <p role="alert" className="text-sm text-red-600">{checkError}</p>}

              {checkedCard && (
                <div className="rounded-lg p-4 space-y-2" style={{ border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold" style={{ color: "var(--color-text-primary)" }}>{checkedCard.code}</span>
                    <Badge variant={STATUS_BADGE[checkedCard.status] ?? "gray"}>{checkedCard.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Balance</p><p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(checkedCard.balance_cents)}</p></div>
                    <div><p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Original</p><p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(checkedCard.initial_cents)}</p></div>
                  </div>
                  {canManage && checkedCard.status === "active" && (
                    <Button variant="ghost" size="sm" onClick={() => void handleVoid(checkedCard.code)} className="text-red-600 hover:bg-red-50">
                      Void card
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Card list ────────────────────────────────────────────────── */}
        <Card title={`All Gift Cards${total > 0 ? ` (${total})` : ""}`} noPadding>
          {loading ? (
            <div className="space-y-2 p-4">{[...Array(4)].map((_, i) => <div key={i} className="h-10 animate-skeleton rounded" />)}</div>
          ) : cards.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No gift cards issued yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs font-semibold uppercase tracking-[0.08em]"
                  style={{ borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}
                >
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-right hidden sm:table-cell">Original</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden md:table-cell">Issued</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-table-border)]">
                {cards.map(card => (
                  <tr key={card.id} className="hover:bg-[var(--color-surface-subtle)] transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-xs tracking-wider" style={{ color: "var(--color-text-primary)" }}>{card.code}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: "var(--color-text-primary)" }}>{formatMoney(card.balance_cents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell" style={{ color: "var(--color-text-muted)" }}>{formatMoney(card.initial_cents)}</td>
                    <td className="px-4 py-3"><Badge variant={STATUS_BADGE[card.status] ?? "gray"}>{card.status}</Badge></td>
                    <td className="px-4 py-3 text-xs hidden md:table-cell" style={{ color: "var(--color-text-muted)" }}>{fmtDate(card.created_at)}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        {card.status === "active" && (
                          <button onClick={() => void handleVoid(card.code)} className="text-xs text-red-500 hover:text-red-700 font-medium">
                            Void
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

      </div>
    </EnterpriseShell>
  );
}
