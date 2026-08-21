"use client";

import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { Button } from "@/components/Button";
import type { ScanResult } from "@/api-client/types";
import { SCAN_FEEDBACK, TONE_CLASS } from "./shared";

/**
 * The scan field, and the answer to the last scan.
 *
 * A receiving desk is a two-hands job: barcode gun in one, box in the other.
 * The field therefore takes focus on mount and takes it back after every scan,
 * every save, and every error — the operator should never have to click into
 * it. A hardware scanner types the code and sends Enter, which is exactly what
 * a keyboard user does too, so there is no separate scanner code path.
 */
export function ScanBar({
  value,
  onChange,
  onScan,
  busy,
  lastScan,
  disabled,
  focusToken,
}: {
  value: string;
  onChange: (v: string) => void;
  onScan: () => void;
  busy: boolean;
  lastScan: ScanResult | null;
  disabled: boolean;
  /** Changing this number pulls focus back to the field. */
  focusToken: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [focusToken, disabled]);

  // "/" jumps back to the scan field from anywhere on the page, the way it
  // does in the rest of Ascend — but never while the operator is typing into
  // some other field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const feedback = lastScan ? SCAN_FEEDBACK[lastScan.result] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 5v14M7 5v14M11 5v14M15 5v10M19 5v14" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={value}
            disabled={disabled || busy}
            aria-label="Scan or type a barcode"
            placeholder={disabled ? "Session is closed" : "Scan a barcode…"}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onScan();
              }
            }}
            className={clsx(
              "min-h-touch w-full rounded-lg border py-2 pl-10 pr-3 font-mono text-[15px]",
              "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text-primary)]",
              "placeholder:font-sans placeholder:text-[var(--color-text-muted)]",
              "focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          />
        </div>
        <Button
          variant="primary"
          size="lg"
          loading={busy}
          disabled={disabled || !value.trim()}
          onClick={onScan}
        >
          Add
        </Button>
        <p className="text-[12px] text-[var(--color-text-muted)]">
          Press <kbd className="rounded border border-[var(--color-border)] px-1 py-0.5 font-sans text-[11px]">/</kbd> to jump back here
        </p>
      </div>

      {/* One line of plain language about what just happened. Announced, so a
          screen-reader user gets the same answer as a sighted one. */}
      <div role="status" aria-live="polite" className="min-h-[2rem]">
        {lastScan && feedback && (
          <div
            className={clsx(
              "flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-[13px]",
              TONE_CLASS[feedback.tone],
            )}
          >
            <span className="font-semibold">{feedback.title}</span>
            <span className="opacity-90">{lastScan.detail}</span>
          </div>
        )}
      </div>
    </div>
  );
}
