
import { useState, useCallback } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { apiGet, apiPost } from "@/api-client/client";
import type { useToast } from "@/components/Toast";
import { fmtDate } from "@/lib/date";

interface CustomerNote {
  id: string;
  note_type: string;
  content: string;
  created_at: string;
}

const NOTE_TYPE_BADGE: Record<string, string> = {
  general:    "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
  billing:    "bg-blue-100 text-blue-700",
  compliance: "bg-yellow-100 text-yellow-800",
  internal:   "bg-purple-100 text-purple-700",
};

export function NotesPanel({
  customerId,
  canEdit,
  addToast,
}: {
  customerId: string;
  canEdit: boolean;
  addToast: ReturnType<typeof useToast>["addToast"];
}) {
  const [open, setOpen]         = useState(false);
  const [items, setItems]       = useState<CustomerNote[]>([]);
  const [loading, setLoading]   = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const [content, setContent]   = useState("");
  const [noteType, setNoteType] = useState("general");
  const [busy, setBusy]         = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: CustomerNote[] }>(`/api/v1/customers/${customerId}/notes`)
      .then((r) => setItems(r.items ?? []))
      .catch(() => setItems([]))
      .finally(() => { setLoading(false); setLoaded(true); });
  }, [customerId]);

  const toggle = () => {
    setOpen((v) => { if (!v && !loaded) load(); return !v; });
  };

  const addNote = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/api/v1/customers/${customerId}/notes`, {
        note_type: noteType,
        content: content.trim(),
      });
      setContent("");
      setNoteType("general");
      load();
      addToast({ title: "Note added", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-subtle)]"
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Notes</span>
          {loaded && (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
              {items.length}
            </span>
          )}
        </div>
        <svg
          aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--color-text-muted)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {loading && (
            <div className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>Loading…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-4 py-4 text-[13px]" style={{ color: "var(--color-text-muted)" }}>No notes yet.</div>
          )}
          {items.length > 0 && (
            <ul className="divide-y divide-[var(--color-table-border)]">
              {items.map((note) => (
                <li key={note.id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${NOTE_TYPE_BADGE[note.note_type] ?? "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]"}`}
                  >
                    {note.note_type}
                  </span>
                  <p className="flex-1 text-[13px]" style={{ color: "var(--color-text-primary)" }}>{note.content}</p>
                  <span className="shrink-0 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    {fmtDate(new Date(note.created_at).getTime())}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="space-y-3 border-t px-4 py-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
              <div className="flex gap-3">
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="w-36 rounded-lg border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                >
                  <option value="general">General</option>
                  <option value="billing">Billing</option>
                  <option value="compliance">Compliance</option>
                  <option value="internal">Internal</option>
                </select>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={2}
                  placeholder="Add a note…"
                  className="flex-1 resize-none rounded-lg border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="primary" loading={busy} disabled={!content.trim()} onClick={() => void addNote()}>
                  Add note
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
