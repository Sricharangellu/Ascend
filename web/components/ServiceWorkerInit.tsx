"use client";

import { useEffect } from "react";

// Registers the production service worker for offline shell support.
// Skipped in development to avoid conflicts with MSW.
export function ServiceWorkerInit() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // SW registration failure is non-fatal — app works without it.
    });
  }, []);

  return null;
}
