"use client";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-md bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">Import products from CSV</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-md text-xl text-slate-400 hover:bg-slate-100">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!result ? (
            <>
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                <p className="mb-1 text-sm font-semibold text-slate-700">Upload a CSV file</p>
                <p className="mb-3 text-xs text-slate-400">
                  Required: <code className="font-mono">name, sku, price</code><br />
                  Optional: <code className="font-mono">category, brand, barcode, cost, tax_class, description</code>
                </p>
                <input type="file" accept=".csv,text/csv" onChange={handleFile}
                  className="mx-auto block text-sm text-slate-600 file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
              </div>

              {parseError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{parseError}</p>
              )}

              {parsed && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">
                    Preview — {parsed.rows.length} row{parsed.rows.length !== 1 ? "s" : ""} detected
                  </p>
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          {parsed.headers.map(h => <th key={h} className="px-3 py-2 font-semibold text-slate-500">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsed.rows.slice(0, 8).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            {parsed.headers.map(h => (
                              <td key={h} className="max-w-[140px] truncate px-3 py-1.5 text-slate-700">{row[h] ?? ""}</td>
                            ))}
                          </tr>
                        ))}
                        {parsed.rows.length > 8 && (
                          <tr>
                            <td colSpan={parsed.headers.length} className="px-3 py-2 text-center text-slate-400">
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
                <div className="rounded-md bg-green-50 p-4">
                  <p className="text-2xl font-bold text-green-700">{result.imported}</p>
                  <p className="text-xs text-green-600 mt-0.5">Imported</p>
                </div>
                <div className="rounded-md bg-slate-50 p-4">
                  <p className="text-2xl font-bold text-slate-700">{result.skipped}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Skipped</p>
                </div>
                <div className="rounded-md bg-red-50 p-4">
                  <p className="text-2xl font-bold text-red-700">{result.errors.length}</p>
                  <p className="text-xs text-red-600 mt-0.5">Errors</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="mb-1 text-xs font-semibold text-red-700">Row errors:</p>
                  <ul className="space-y-0.5 text-xs text-red-600">
                    {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                  </ul>
                </div>
              )}
              {result.imported > 0 && (
                <p className="text-sm text-green-700">
                  {result.imported} product{result.imported !== 1 ? "s" : ""} imported as &ldquo;Draft&rdquo; — activate them from the catalog list.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose}
            className="min-h-[40px] rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button type="button" disabled={!parsed || importing} onClick={() => void handleImport()}
              className="min-h-[40px] rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {importing ? "Importing…" : `Import ${parsed?.rows.length ?? 0} products`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
