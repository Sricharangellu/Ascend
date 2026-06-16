"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/Button";

interface Session {
  id: string;
  register_id: string;
  status: "open" | "closed";
  opening_float_cents: number;
  opened_at: number;
  opened_by: string;
}

interface RegisterSessionGuardProps {
  registerId: string;
  children: React.ReactNode;
}

export function RegisterSessionGuard({ registerId, children }: RegisterSessionGuardProps) {
  const [session, setSession] = useState<Session | null | "loading">("loading");
  const [openFloat, setOpenFloat] = useState("");
  const [closeFloat, setCloseFloat] = useState("");
  const [closeCounted, setCloseCounted] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ items: Session[] }>(`/api/v1/outlets/registers/${registerId}/sessions?limit=1`);
      const latest = res.items[0];
      setSession(latest?.status === "open" ? latest : null);
    } catch {
      setSession(null);
    }
  }, [registerId]);

  useEffect(() => { void load(); }, [load]);

  const handleOpen = async () => {
    setWorking(true); setError(null);
    try {
      const floatCents = Math.round(parseFloat(openFloat || "0") * 100);
      const s = await apiPost<Session>(`/api/v1/outlets/registers/${registerId}/open`, { openingFloatCents: floatCents });
      setSession(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to open register");
    } finally { setWorking(false); }
  };

  const handleClose = async () => {
    if (!session || session === "loading") return;
    setWorking(true); setError(null);
    try {
      const countedCents = Math.round(parseFloat(closeCounted || "0") * 100);
      const closingCents = Math.round(parseFloat(closeFloat || "0") * 100);
      await apiPost(`/api/v1/outlets/registers/${registerId}/close`, { countedCashCents: countedCents, closingFloatCents: closingCents });
      setSession(null); setShowClose(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to close register");
    } finally { setWorking(false); }
  };

  if (session === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-slate-50 p-8">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-600" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Open Register</h2>
              <p className="text-xs text-gray-500">Count your opening cash float</p>
            </div>
          </div>
          {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opening Float ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openFloat}
                onChange={e => setOpenFloat(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <Button variant="primary" fullWidth loading={working} onClick={() => void handleOpen()}>
              Open Register
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Close register banner */}
      {showClose && (
        <div className="flex-none border-b border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-2">Close Register — Count your cash</p>
          {error && <p className="mb-2 rounded bg-red-50 px-3 py-1 text-xs text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-amber-700 mb-1">Counted Cash ($)</label>
              <input type="number" min="0" step="0.01" value={closeCounted} onChange={e => setCloseCounted(e.target.value)}
                placeholder="0.00" className="rounded border border-amber-300 px-2 py-1 text-sm w-28" />
            </div>
            <div>
              <label className="block text-xs text-amber-700 mb-1">Closing Float ($)</label>
              <input type="number" min="0" step="0.01" value={closeFloat} onChange={e => setCloseFloat(e.target.value)}
                placeholder="0.00" className="rounded border border-amber-300 px-2 py-1 text-sm w-28" />
            </div>
            <Button variant="danger" size="sm" loading={working} onClick={() => void handleClose()}>Confirm Close</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowClose(false)}>Cancel</Button>
          </div>
          <p className="mt-1 text-xs text-amber-600">
            Opening float: {formatMoney(session.opening_float_cents)} · Opened {new Date(session.opened_at).toLocaleTimeString()}
          </p>
        </div>
      )}
      {!showClose && (
        <div className="flex-none border-b border-gray-200 bg-white px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Register open · Float: {formatMoney(session.opening_float_cents)}
          </span>
          <button onClick={() => setShowClose(true)} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Close register
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
