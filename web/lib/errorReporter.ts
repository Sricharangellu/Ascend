/**
 * Client-side error reporter.
 *
 * Sends unhandled JS errors and React error boundary catches to the backend
 * POST /api/v1/monitoring/errors endpoint. Falls back to console.error if the
 * request fails. Deduplicates identical errors within a 10s window.
 */

const REPORT_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}/api/v1/monitoring/errors`;
const DEDUP_WINDOW_MS = 10_000;

const recentErrors = new Map<string, number>();

function dedupKey(message: string, source?: string): string {
  return `${message}|${source ?? ""}`;
}

function isDuplicate(message: string, source?: string): boolean {
  const key = dedupKey(message, source);
  const last = recentErrors.get(key);
  if (last && Date.now() - last < DEDUP_WINDOW_MS) return true;
  recentErrors.set(key, Date.now());
  return false;
}

export interface ErrorReport {
  message: string;
  source?: string;
  stack?: string;
  level?: "error" | "warning";
  context?: Record<string, unknown>;
}

export async function reportError(report: ErrorReport): Promise<void> {
  if (isDuplicate(report.message, report.source)) return;

  try {
    const { getAccessToken } = await import("./auth");
    const token = getAccessToken();
    await fetch(REPORT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        ...report,
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      }),
      keepalive: true,
    });
  } catch {
    // Never let error reporting crash the app.
    console.error("[ErrorReporter] failed to send:", report.message);
  }
}

/** Install global window.onerror + unhandledrejection handlers. Call once in layout. */
export function installGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    void reportError({
      message: event.message,
      source: event.filename,
      stack: event.error instanceof Error ? event.error.stack : undefined,
      level: "error",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    void reportError({
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      level: "error",
      context: { type: "unhandledrejection" },
    });
  });
}
