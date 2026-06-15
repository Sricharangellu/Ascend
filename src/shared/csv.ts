/** Minimal RFC4180-ish CSV helpers for catalog bulk import/export (BE-7).
 *  No external dependency: handles quoted fields, escaped quotes ("") and
 *  commas/newlines inside quotes. Good enough for spreadsheet round-trips. */

export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text);
  if (rows.length === 0) return [];
  const header = rows[0]!;
  return rows.slice(1)
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      header.forEach((key, i) => {
        record[key.trim()] = row[i] ?? "";
      });
      return record;
    });
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n");
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => escape(row[col])).join(","));
  }
  return lines.join("\n");
}
