/**
 * restore-verify core — dump inventory parsing and comparison logic.
 *
 * Snapshot consistency: expectations (table list + row counts) are derived
 * from the dump file itself, NOT from live queries against the source
 * database. pg_dump takes a consistent snapshot internally; parsing its
 * CREATE TABLE statements and COPY blocks yields exactly what a faithful
 * restore must reproduce, regardless of concurrent writes happening on the
 * live database before/after the dump. Comparing "restored" against "dump"
 * (never against "live source") makes the verification deterministic on an
 * active POS database.
 */

import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

export interface DumpInventory {
  /** All tables created by the dump (public schema). */
  tables: Set<string>;
  /** Row count per table, from COPY block data lines. */
  counts: Map<string, number>;
}

// CREATE TABLE public.foo (   |   CREATE TABLE public."Foo Bar" (
const CREATE_TABLE_RE = /^CREATE TABLE public\.(?:"([^"]+)"|([A-Za-z0-9_]+)) \(/;
// COPY public.foo (col, ...) FROM stdin;   |   COPY public."Foo" (...) FROM stdin;
const COPY_RE = /^COPY public\.(?:"([^"]+)"|([A-Za-z0-9_]+)) \(.*\) FROM stdin;$/;

/**
 * Parse a plain-format pg_dump file into a table/row-count inventory.
 *
 * COPY text format escapes backslashes as `\\`, so a data line can never be
 * exactly `\.` — that line is unambiguously the end-of-data terminator.
 */
export async function parseDumpInventory(dumpFile: string): Promise<DumpInventory> {
  const tables = new Set<string>();
  const counts = new Map<string, number>();

  const rl = createInterface({
    input: createReadStream(dumpFile),
    crlfDelay: Infinity,
  });

  let copyTable: string | null = null;
  let copyRows = 0;

  for await (const line of rl) {
    if (copyTable !== null) {
      if (line === "\\.") {
        counts.set(copyTable, copyRows);
        copyTable = null;
        copyRows = 0;
      } else {
        copyRows++;
      }
      continue;
    }

    const create = CREATE_TABLE_RE.exec(line);
    if (create) {
      tables.add(create[1] ?? create[2]!);
      continue;
    }

    const copy = COPY_RE.exec(line);
    if (copy) {
      copyTable = copy[1] ?? copy[2]!;
      copyRows = 0;
    }
  }

  if (copyTable !== null) {
    throw new Error(
      `dump appears truncated: COPY block for table "${copyTable}" has no terminator`,
    );
  }

  return { tables, counts };
}

export interface ComparisonProblem {
  kind: "missing_table" | "extra_table" | "count_mismatch" | "missing_critical";
  detail: string;
}

/**
 * Compare a restored database's state against the dump inventory.
 *
 * - Every table in the dump must exist in the restore (and vice versa).
 * - Every critical table must be present in the dump at all.
 * - For each table with a known restored count, the count must equal the
 *   dump's COPY row count exactly.
 */
export function compareInventory(
  dump: DumpInventory,
  restoredTables: readonly string[],
  restoredCounts: ReadonlyMap<string, number>,
  criticalTables: readonly string[],
): ComparisonProblem[] {
  const problems: ComparisonProblem[] = [];
  const restoredSet = new Set(restoredTables);

  for (const t of criticalTables) {
    if (!dump.tables.has(t)) {
      problems.push({
        kind: "missing_critical",
        detail: `critical table "${t}" is not in the dump — pg_dump flags may be excluding it`,
      });
    }
  }

  for (const t of dump.tables) {
    if (!restoredSet.has(t)) {
      problems.push({ kind: "missing_table", detail: `table "${t}" missing from restore` });
    }
  }
  for (const t of restoredSet) {
    if (!dump.tables.has(t)) {
      problems.push({ kind: "extra_table", detail: `unexpected table "${t}" in restore` });
    }
  }

  for (const [table, got] of restoredCounts) {
    const want = dump.counts.get(table);
    if (want === undefined) continue; // no COPY block parsed for this table
    if (got !== want) {
      problems.push({
        kind: "count_mismatch",
        detail: `table "${table}": restored ${got} rows, dump contains ${want}`,
      });
    }
  }

  return problems;
}
