// Shared date/time formatters — import from here, never define locally in pages.

const EN_US = "en-US";

export function fmtDate(ms: number | null | undefined, fallback = "—"): string {
  if (ms == null) return fallback;
  return new Date(ms).toLocaleDateString(EN_US, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateShort(ms: number | null | undefined, fallback = "—"): string {
  if (ms == null) return fallback;
  return new Date(ms).toLocaleDateString(EN_US, { month: "short", day: "numeric" });
}

export function fmtDateTime(ms: number | null | undefined, fallback = "—"): string {
  if (ms == null) return fallback;
  return new Date(ms).toLocaleString(EN_US, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtTime(ms: number | null | undefined, fallback = "—"): string {
  if (ms == null) return fallback;
  return new Date(ms).toLocaleTimeString(EN_US, { hour: "2-digit", minute: "2-digit" });
}
