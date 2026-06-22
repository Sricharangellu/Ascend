"use client";

/**
 * MockWorkerInit — starts the MSW browser worker in development mode.
 *
 * Rendered as a Client Component in app/layout.tsx.
 * In production, this component renders nothing and the worker never starts.
 *
 * Enable mocks: set NEXT_PUBLIC_MOCK=true in .env.local
 * (already true by default when NODE_ENV=development via next.config.ts)
 */

import { useEffect, useState, type ReactNode } from "react";

export default function MockWorkerInit({ children }: { children: ReactNode }) {
  const mocksEnabled = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_MOCK === "true";
  const [ready, setReady] = useState(!mocksEnabled);

  useEffect(() => {
    if (!mocksEnabled) return;
    let active = true;
    const fallback = window.setTimeout(() => {
      if (active) setReady(true);
    }, 4_000);

    // Dynamically import so the MSW bundle is excluded from production
    import("./browser").then(({ startWorker }) => {
      return startWorker();
    }).catch(() => {
      // Keep the real backend usable if mock registration is unavailable.
    }).finally(() => {
      window.clearTimeout(fallback);
      if (active) setReady(true);
    });

    return () => {
      active = false;
      window.clearTimeout(fallback);
    };
  }, [mocksEnabled]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50" role="status" aria-label="Preparing workspace">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return children;
}
