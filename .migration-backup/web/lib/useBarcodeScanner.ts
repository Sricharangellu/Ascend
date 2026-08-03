"use client";

import { useEffect, useRef, useCallback } from "react";

interface BarcodeScannerOptions {
  /** Minimum barcode length to fire the callback (default 4). */
  minLength?: number;
  /** Maximum inter-keystroke gap in ms that counts as "scanner input" (default 50). */
  maxKeyGapMs?: number;
  /** Fire even when an input/textarea/select/contenteditable is focused (default false). */
  allowInInputs?: boolean;
  /** Called whenever a complete scan is detected. */
  onScan: (barcode: string) => void;
}

/**
 * useBarcodeScanner — keyboard-wedge barcode scanner support.
 *
 * Hardware barcode scanners emulate a keyboard: they type every character of
 * the barcode in rapid succession (< 50 ms per keystroke) then fire Enter.
 * This hook distinguishes that pattern from normal human typing and fires
 * onScan with the accumulated digits.
 *
 * Usage:
 *   useBarcodeScanner({ onScan: (code) => addProductByBarcode(code) });
 *
 * The hook attaches a keydown listener to the document and is completely
 * passive — it never calls preventDefault so it never blocks other input.
 */
export function useBarcodeScanner({
  minLength = 4,
  maxKeyGapMs = 50,
  allowInInputs = false,
  onScan,
}: BarcodeScannerOptions): void {
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan; // always current without re-registering listener

  const flush = useCallback(() => {
    const code = bufferRef.current;
    bufferRef.current = "";
    lastKeyTimeRef.current = 0;
    if (code.length >= minLength) {
      onScanRef.current(code);
    }
  }, [minLength]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore modifier-key combos (Ctrl+C etc.)
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // Optionally ignore input elements
      if (!allowInInputs) {
        const tag = (e.target as Element)?.tagName?.toLowerCase();
        const isEditable = (e.target as HTMLElement)?.isContentEditable;
        if (tag === "input" || tag === "textarea" || tag === "select" || isEditable) return;
      }

      const now = Date.now();
      const gap = now - lastKeyTimeRef.current;

      // Enter terminates a scan — flush whatever's buffered.
      if (e.key === "Enter") {
        flush();
        return;
      }

      // If the gap since the last keystroke is too long, start a fresh buffer.
      if (lastKeyTimeRef.current > 0 && gap > maxKeyGapMs) {
        bufferRef.current = "";
      }

      // Accumulate printable characters only.
      if (e.key.length === 1) {
        bufferRef.current += e.key;
        lastKeyTimeRef.current = now;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [flush, maxKeyGapMs, allowInInputs]);
}
