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

import { useEffect } from "react";

export default function MockWorkerInit() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "development" &&
      process.env.NEXT_PUBLIC_MOCK !== "true"
    ) {
      return;
    }

    // Dynamically import so the MSW bundle is excluded from production
    import("./browser").then(({ startWorker }) => {
      void startWorker();
    });
  }, []);

  return null;
}
