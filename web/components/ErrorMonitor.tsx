"use client";

import { useEffect } from "react";
import { installGlobalErrorHandlers } from "@/lib/errorReporter";

/** Installs window.onerror + unhandledrejection handlers once on mount. */
export function ErrorMonitor() {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);
  return null;
}
