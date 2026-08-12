
import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { fmtDateTime } from "@/lib/date";
import type {
  CycleCountSession,
  CycleCountSessionsResponse,
  CycleCountLine,
  CycleCountLinesResponse,
} from "@/api-client/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────


function varianceBadge(v: number | null) {
  if (v === null) return <Badge variant="gray">—</Badge>;
  if (v === 0)   return <Badge variant="green">0</Badge>;
  if (v > 0)     return <Badge variant="blue">+{v}</Badge>;
  return <Badge variant="red">{v}</Badge>;
}

// ─── New Session Modal ────────────────────────────────────────────────────────

interface NewSessionModalProps {
  onClose: () => void;
  onCreated: (session: CycleCountSession) => void;
}

function NewSessionModal({ onClose, onCreated }: NewSessionModalProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const session = await apiPost<CycleCountSession>("/api/v1/inventory/counts", {
        note: note.trim() || undefined,
      });
      onCreated(session);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Failed to create session.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-xl"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>New Count Session</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none"
            style={{ color: "var(--color-text-muted)" }}
          >
            &times;
          </button>
        </div>
        <form id="new-session-form" onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
              Note <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span>
            </label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
              placeholder="e.g. Weekly count — main stockroom"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            A new session will be seeded with the current on-hand quantity for every
            active SKU as the expected count.
          </p>
        </form>
        <div
          className="flex justify-end gap-2 border-t px-5 py-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-[var(--color-surface-subtle)]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="new-session-form"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Start Session"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Close Session Confirm Modal ──────────────────────────────────────────────

interface CloseModalProps {
  session: CycleCountSession;
  lines: CycleCountLine[];
  onClose: () => void;
  onClosed: () => void;
}

function CloseSessionModal({ session, lines, onClose, onClosed }: CloseModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uncounted = lines.filter(l => l.counted_qty === null).length;
  const withVariance = lines.filter(l => l.variance !== null && l.variance !== 0).length;

  async function handleClose() {
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/api/v1/inventory/counts/${session.id}/close`, {});
      onClosed();
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Failed to close session.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-xl"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Close Count Session</h2>
          <button type="button" onClick={onClose} className="text-xl leading-none" style={{ color: "var(--color-text-muted)" }}>&times;</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {uncounted > 0 && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
              <strong>{uncounted}</strong> SKU{uncounted !== 1 ? "s" : ""} still uncounted. Their variance will be recorded as 0.
            </div>
          )}
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Closing will post <strong>{withVariance}</strong> inventory adjustment{withVariance !== 1 ? "s" : ""} for
            SKUs with a non-zero variance. This cannot be undone.
          </p>
        </div>
        <div
          className="flex justify-end gap-2 border-t px-5 py-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button type="button" onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-[var(--color-surface-subtle)]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Closing…" : "Close & Post Adjustments"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Session Detail Panel ─────────────────────────────────────────────────────

interface SessionDetailProps {
  session: CycleCountSession;
  onBack: () => void;
  onSessionClosed: (id: string) => void;
}

function SessionDetail({ session, onBack, onSessionClosed }: SessionDetailProps) {
  const [lines, setLines] = useState<CycleCountLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [showClose, setShowClose] = useState(false);

  const loadLines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<CycleCountLinesResponse>(`/api/v1/inventory/counts/${session.id}/lines`);
      setLines(data.items);
      const initial: Record<string, string> = {};
      data.items.forEach(l => {
        if (l.counted_qty !== null) initial[l.product_id] = String(l.counted_qty);
      });
      setCounts(initial);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load lines.");
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => { loadLines(); }, [loadLines]);

  async function submitCount(productId: string) {
    const raw = counts[productId];
    if (raw === undefined || raw === "") return;
    const qty = parseInt(raw, 10);
    if (isNaN(qty) || qty < 0) return;
    setSaving(productId);
    try {
      await apiPost(`/api/v1/inventory/counts/${session.id}/lines`, {
        productId,
        countedQty: qty,
      });
      await loadLines();
    } catch {
      // silently ignore — line stays un-saved
    } finally {
      setSaving(null);
    }
  }

  const countedCount = lines.filter(l => l.counted_qty !== null).length;
  const varianceCount = lines.filter(l => l.variance !== null && l.variance !== 0).length;

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          ← Sessions
        </button>
        <span style={{ color: "var(--color-border)" }}>/</span>
        <span className="text-sm truncate max-w-xs" style={{ color: "var(--color-text-secondary)" }}>
          {session.note ?? "Count session"}
        </span>
        <Badge variant={session.status === "open" ? "blue" : "gray"}>
          {session.status}
        </Badge>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        {[
          { label: "Total SKUs", value: lines.length },
          { label: "Counted", value: countedCount },
          { label: "Remaining", value: lines.length - countedCount },
          { label: "Variances", value: varianceCount },
        ].map(c => (
          <Card key={c.label} className="px-4 py-3">
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{c.label}</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>{c.value}</p>
          </Card>
        ))}
      </div>

      {session.status === "open" && (
        <div className="flex justify-end mb-4">
          <Button variant="danger" onClick={() => setShowClose(true)}>
            Close Session
          </Button>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div
          className="border-b px-5 py-3 flex items-center justify-between"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Count Lines</h3>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {session.status === "open"
              ? "Enter counted quantities and press Enter or Tab to save"
              : `Closed ${session.closed_at ? fmtDateTime(session.closed_at) : ""}`}
          </span>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</div>
        ) : error ? (
          <div className="px-5 py-10 text-center text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead
                className="text-xs uppercase tracking-wide"
                style={{ backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}
              >
                <tr>
                  <th className="px-5 py-3 text-left">Product</th>
                  <th className="px-5 py-3 text-left">SKU</th>
                  <th className="px-5 py-3 text-right">Expected</th>
                  <th className="px-5 py-3 text-right">Counted</th>
                  <th className="px-5 py-3 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--color-table-border)" }}>
                {lines.map(line => (
                  <tr key={line.product_id} className="hover:bg-[var(--color-surface-subtle)]">
                    <td className="px-5 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {line.product_name ?? line.product_id}
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--color-text-muted)" }}>{line.sku ?? "—"}</td>
                    <td className="px-5 py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>{line.expected_qty}</td>
                    <td className="px-5 py-3 text-right">
                      {session.status === "open" ? (
                        <input
                          type="number"
                          min="0"
                          value={counts[line.product_id] ?? ""}
                          placeholder="—"
                          onChange={e => setCounts(prev => ({ ...prev, [line.product_id]: e.target.value }))}
                          onBlur={() => submitCount(line.product_id)}
                          onKeyDown={e => { if (e.key === "Enter") submitCount(line.product_id); }}
                          disabled={saving === line.product_id}
                          className="w-20 rounded border px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
                          style={{ borderColor: "var(--color-border)" }}
                        />
                      ) : (
                        <span style={{ color: "var(--color-text-secondary)" }}>{line.counted_qty ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {varianceBadge(line.variance)}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center" style={{ color: "var(--color-text-muted)" }}>No lines</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showClose && (
        <CloseSessionModal
          session={session}
          lines={lines}
          onClose={() => setShowClose(false)}
          onClosed={() => {
            setShowClose(false);
            onSessionClosed(session.id);
          }}
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CycleCountsPage() {
  const [sessions, setSessions] = useState<CycleCountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<CycleCountSession | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<CycleCountSessionsResponse>("/api/v1/inventory/counts");
      setSessions(data.items);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const openCount = sessions.filter(s => s.status === "open").length;

  function handleSessionClosed(id: string) {
    setSessions(prev =>
      prev.map(s => s.id === id ? { ...s, status: "closed", closed_at: Date.now() } : s)
    );
    setSelected(prev => prev?.id === id ? { ...prev, status: "closed", closed_at: Date.now() } : prev);
  }

  return (
    <EnterpriseShell
      active="inventory-counts"
      title="Cycle Counts"
      subtitle="Physical inventory count sessions"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        {selected ? (
          <SessionDetail
            session={selected}
            onBack={() => setSelected(null)}
            onSessionClosed={handleSessionClosed}
          />
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: "Open Sessions",   value: openCount },
                { label: "Closed Sessions", value: sessions.filter(s => s.status === "closed").length },
                { label: "Total Sessions",  value: sessions.length },
              ].map(c => (
                <Card key={c.label} className="px-4 py-3">
                  <p className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{c.label}</p>
                  <p className="mt-1 text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>{c.value}</p>
                </Card>
              ))}
            </div>

            {/* Sessions list */}
            <Card className="overflow-hidden p-0">
              <div
                className="flex items-center justify-between border-b px-5 py-3"
                style={{ borderColor: "var(--color-border)" }}
              >
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Count Sessions</h2>
                <Button variant="primary" onClick={() => setShowNew(true)}>
                  + New Session
                </Button>
              </div>

              {loading ? (
                <div className="px-5 py-10 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead
                      className="text-xs uppercase tracking-wide"
                      style={{ backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}
                    >
                      <tr>
                        <th className="px-5 py-3 text-left">Started</th>
                        <th className="px-5 py-3 text-left">Note</th>
                        <th className="px-5 py-3 text-left">Opened by</th>
                        <th className="px-5 py-3 text-left">Status</th>
                        <th className="px-5 py-3 text-left">Closed</th>
                        <th className="px-5 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: "var(--color-table-border)" }}>
                      {sessions.map(session => (
                        <tr
                          key={session.id}
                          className="hover:bg-[var(--color-surface-subtle)] cursor-pointer"
                          onClick={() => setSelected(session)}
                        >
                          <td className="px-5 py-3" style={{ color: "var(--color-text-secondary)" }}>{fmtDateTime(session.opened_at)}</td>
                          <td className="px-5 py-3 max-w-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
                            {session.note ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                          </td>
                          <td className="px-5 py-3" style={{ color: "var(--color-text-muted)" }}>{session.opened_by}</td>
                          <td className="px-5 py-3">
                            <Badge variant={session.status === "open" ? "blue" : "gray"}>
                              {session.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {session.closed_at ? fmtDateTime(session.closed_at) : "—"}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className="text-xs text-blue-600 hover:underline">View →</span>
                          </td>
                        </tr>
                      ))}
                      {sessions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-5 py-12 text-center" style={{ color: "var(--color-text-muted)" }}>
                            No count sessions yet. Start one to begin counting.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {showNew && (
        <NewSessionModal
          onClose={() => setShowNew(false)}
          onCreated={session => {
            setShowNew(false);
            setSessions(prev => [session, ...prev]);
            setSelected(session);
          }}
        />
      )}
    </EnterpriseShell>
  );
}
