import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { Badge } from "@/components/Badge";
import type { BadgeVariant } from "@/components/Badge";

type EdiStatus = "processed" | "failed";

interface EdiImport {
  id: string;
  filename: string;
  format: string;
  supplier_name: string;
  file_size_bytes: number;
  record_count: number;
  status: EdiStatus | string;
  uploaded_at: number;
  processed_at: number | null;
  po_count: number;
  line_count: number;
  error_count: number;
  warnings: string[];
  errors: string[];
  created_po_ids: string[];
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  processed: "green",
  failed: "red",
};

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtBytes(b: number): string {
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
}

export function HistoryTab() {
  const [items, setItems] = useState<EdiImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ items: EdiImport[] }>("/api/v1/purchasing/edi-imports");
      setItems(res.items.filter((i) => ["processed", "failed"].includes(i.status)));
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</div>;
  if (error) return <p role="alert" className="text-sm text-red-700 py-6">{error}</p>;

  return (
    <div>
      <div className="mb-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
        {items.length} completed import{items.length !== 1 ? "s" : ""}
      </div>
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <table className="min-w-full text-sm">
          <thead className="text-xs font-semibold uppercase tracking-wide" style={{ backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}>
            <tr>
              <th className="px-4 py-3 text-left">File</th>
              <th className="px-4 py-3 text-left">Supplier</th>
              <th className="px-4 py-3 text-left">Format</th>
              <th className="px-4 py-3 text-right">POs Created</th>
              <th className="px-4 py-3 text-right">Lines</th>
              <th className="px-4 py-3 text-left">Uploaded</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-table-border)]">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-[var(--color-surface-subtle)]">
                <td className="px-4 py-3">
                  <p className="font-medium truncate max-w-[200px]" style={{ color: "var(--color-text-primary)" }}>{item.filename}</p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{fmtBytes(item.file_size_bytes)}</p>
                </td>
                <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{item.supplier_name}</td>
                <td className="px-4 py-3 text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>{item.format.replace("_", " ")}</td>
                <td className="px-4 py-3 text-right">
                  {item.created_po_ids.length > 0 ? (
                    <div>
                      <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>{item.created_po_ids.length}</p>
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{item.created_po_ids.slice(0, 2).join(", ")}{item.created_po_ids.length > 2 ? "…" : ""}</p>
                    </div>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>{item.line_count || "—"}</td>
                <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(item.uploaded_at)}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_BADGE[item.status] ?? "gray"}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </Badge>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No imports processed yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
