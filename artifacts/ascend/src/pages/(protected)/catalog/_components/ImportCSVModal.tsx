
import { useState } from "react";
import { apiPost } from "@/api-client/client";

interface ImportResult { imported: number; skipped: number; errors: Array<{ row: number; message: string }> }

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === "," && !inQ) { cells.push(cur); cur = ""; continue; }
      cur += c;
    }
    cells.push(cur);
    return cells.map(s => s.trim());
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(line => {
    const vals = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
  return { headers, rows };
}

export function ImportCSVModal({
  onDone, onClose,
}: {
  onDone: () => Promise<void>; onClose: () => void;
}) {
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const REQUIRED = ["name", "sku", "price"];

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setParseError(null); setParsed(null); setResult(null);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      try {
        const data = parseCSV(text);
        if (data.rows.length === 0) { setParseError("File has no data rows."); return; }
        const missing = REQUIRED.filter(h => !data.headers.some(dh => dh.toLowerCase() === h));
        if (missing.length > 0) { setParseError(`Missing required columns: ${missing.join(", ")}`); return; }
        setParsed(data);
      } catch { setParseError("Could not parse the CSV file."); }
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const r = await apiPost<ImportResult>("/api/v1/catalog/import-csv", { rows: parsed.rows });
      setResult(r);
      await onDone();
    } catch { setParseError("Import failed. Please try again."); }
    finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: "var(--color-surface)" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--color-border)" }}>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Import products from CSV</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-xl transition-colors hover:bg-[var(--color-surface-subtle)]"
            style={{ color: "var(--color-text-muted)" }}>&times;</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!result ? (
            <>
              <div className="rounded-xl border-2 border-dashed p-5 text-center"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
                <p className="mb-1 text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Upload a CSV file</p>
                <p className="mb-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                  Required: <code className="font-mono">name, sku, price</code><br />
                  Optional: <code className="font-mono">category, brand, barcode, cost, tax_class, description</code>
                </p>
                <input type="file" accept=".csv,text/csv" onChange={handleFile}
                  className="mx-auto block text-[13px] file:mr-2 file:cursor-pointer file:rounded-lg file:border file:px-3 file:py-1 file:text-[11px] file:font-medium"
                  style={{ color: "var(--color-text-secondary)" }} />
              </div>

              {parseError && (
                <div className="rounded-xl border px-3 py-2 text-[13px]"
                  style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>
                  {parseError}
                </div>
              )}

              {parsed && (
                <div>
                  <p className="mb-2 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                    Preview — {parsed.rows.length} row{parsed.rows.length !== 1 ? "s" : ""} detected
                  </p>
                  <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
                    <table className="w-full text-[12px]">
                      <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                        <tr>
                          {parsed.headers.map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.rows.slice(0, 8).map((row, i) => (
                          <tr key={i} className="border-b last:border-0 transition-colors duration-75"
                            style={{ borderColor: "var(--color-table-border)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                            {parsed.headers.map((h) => (
                              <td key={h} className="max-w-[140px] truncate px-3 py-1.5" style={{ color: "var(--color-text-secondary)" }}>{row[h] ?? ""}</td>
                            ))}
                          </tr>
                        ))}
                        {parsed.rows.length > 8 && (
                          <tr>
                            <td colSpan={parsed.headers.length} className="px-3 py-2 text-center text-[12px]"
                              style={{ color: "var(--color-text-muted)" }}>
                              +{parsed.rows.length - 8} more rows…
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-success-50 p-4 border border-success-200">
                  <p className="text-[20px] font-bold text-success-700">{result.imported}</p>
                  <p className="mt-0.5 text-[11px] text-success-600">Imported</p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
                  <p className="text-[20px] font-bold" style={{ color: "var(--color-text-primary)" }}>{result.skipped}</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>Skipped</p>
                </div>
                <div className="rounded-xl border border-danger-200 bg-danger-50 p-4">
                  <p className="text-[20px] font-bold text-danger-700">{result.errors.length}</p>
                  <p className="mt-0.5 text-[11px] text-danger-600">Errors</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-xl border border-danger-200 bg-danger-50 p-3">
                  <p className="mb-1 text-[11px] font-semibold text-danger-700">Row errors:</p>
                  <ul className="space-y-0.5 text-[11px] text-danger-600">
                    {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                  </ul>
                </div>
              )}
              {result.imported > 0 && (
                <p className="text-[13px] text-success-700">
                  {result.imported} product{result.imported !== 1 ? "s" : ""} imported as &ldquo;Draft&rdquo; — activate them from the catalog list.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--color-border)" }}>
          <button type="button" onClick={onClose}
            className="h-8 rounded-lg border px-4 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button type="button" disabled={!parsed || importing} onClick={() => void handleImport()}
              className="h-8 rounded-lg bg-brand-600 px-4 text-[13px] font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {importing ? "Importing…" : `Import ${parsed?.rows.length ?? 0} products`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
