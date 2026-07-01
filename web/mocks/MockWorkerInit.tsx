"use client";

/**
 * MockWorkerInit — starts the MSW browser worker.
 *
 * Active when:
 *   - NODE_ENV === "development"
 *   - NEXT_PUBLIC_MOCK=true (build-time env var)
 *   - URL contains ?demo=1  (sets localStorage and activates demo mode)
 *   - localStorage["finder_pos_demo"] === "1" (persists across page loads)
 *
 * In production without any of the above, this component renders children
 * immediately with no delay and the worker never starts.
 */

import { useEffect, useState, type ReactNode } from "react";

const ENV_MOCKS =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_MOCK === "true";

export default function MockWorkerInit({ children }: { children: ReactNode }) {
  // Env-based mocks: block render until the worker registers (original behaviour).
  const [ready, setReady] = useState(!ENV_MOCKS);

  // 1. Env-driven mock startup (development / NEXT_PUBLIC_MOCK=true).
  useEffect(() => {
    if (!ENV_MOCKS) return;
    let active = true;
    const fallback = window.setTimeout(() => {
      if (active) setReady(true);
    }, 4_000);

    import("./browser")
      .then(({ startWorker }) => startWorker())
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(fallback);
        if (active) setReady(true);
      });

    return () => {
      active = false;
      window.clearTimeout(fallback);
    };
  }, []);

  // 2. Runtime demo mode — activates MSW without a rebuild.
  //    ?demo=1 sets localStorage so subsequent pages also use mocks.
  //    The worker registers silently (children are already rendered).
  useEffect(() => {
    if (ENV_MOCKS) return; // already handled above

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("demo") === "1") {
        localStorage.setItem("finder_pos_demo", "1");
        // Strip the ?demo param from the URL so it doesn't persist visually.
        const clean = new URL(window.location.href);
        clean.searchParams.delete("demo");
        window.history.replaceState(null, "", clean.toString());
      }
      if (localStorage.getItem("finder_pos_demo") !== "1") return;
    } catch {
      return; // localStorage blocked (e.g. private browsing edge cases)
    }

    import("./browser")
      .then(({ startWorker }) => startWorker())
      .catch(() => {});
  }, []);

  if (!ready) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-slate-50"
        role="status"
        aria-label="Preparing workspace"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return children;
}
