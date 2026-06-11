"use client";

/**
 * Toast notification system.
 *
 * Usage:
 *   const { addToast } = useToast();
 *   addToast({ title: "Saved", variant: "success" });
 *
 * Accessibility:
 * - Role="status" for info/success (polite)
 * - Role="alert" for error/warning (assertive)
 * - Toasts are removed from the DOM after they expire so screen-reader
 *   announcements don't linger.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
} from "react";
import { clsx } from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  /** Duration in ms before auto-dismiss (0 = sticky) */
  duration?: number;
}

export interface AddToastOptions
  extends Omit<Toast, "id"> {
  /** Default 4000 ms */
  duration?: number;
}

interface ToastContextValue {
  addToast: (options: AddToastOptions) => string;
  removeToast: (id: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const baseId = useId();
  let counter = 0;

  const addToast = useCallback(
    (options: AddToastOptions): string => {
      const id = `${baseId}-${++counter}`;
      const toast: Toast = {
        ...options,
        id,
        duration: options.duration ?? 4000,
      };

      setToasts((prev) => [...prev, toast]);

      if (toast.duration && toast.duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, toast.duration);
      }

      return id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseId]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastRegion toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

// ─── Toast region (ARIA live region) ─────────────────────────────────────────

function ToastRegion({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

// ─── Individual toast ─────────────────────────────────────────────────────────

const variantConfig: Record<
  ToastVariant,
  { classes: string; icon: string; role: "alert" | "status" }
> = {
  success: {
    classes: "bg-success-600 text-white",
    icon: "✓",
    role: "status",
  },
  error: {
    classes: "bg-danger-600 text-white",
    icon: "✕",
    role: "alert",
  },
  warning: {
    classes: "bg-warning-600 text-white",
    icon: "⚠",
    role: "alert",
  },
  info: {
    classes: "bg-brand-600 text-white",
    icon: "i",
    role: "status",
  },
};

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const { classes, icon, role } = variantConfig[toast.variant];

  return (
    <div
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      aria-atomic="true"
      className={clsx(
        "pointer-events-auto flex items-start gap-3 rounded-lg px-4 py-3 shadow-lg",
        "max-w-sm w-full animate-slide-in-right",
        classes
      )}
    >
      <span className="mt-0.5 shrink-0 font-bold text-lg leading-none" aria-hidden="true">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{toast.title}</p>
        {toast.description && (
          <p className="text-sm opacity-90 mt-0.5">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss notification"
        className={clsx(
          "shrink-0 rounded p-1 opacity-80 hover:opacity-100",
          "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1",
          "min-h-[44px] min-w-[44px] flex items-center justify-center"
        )}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
