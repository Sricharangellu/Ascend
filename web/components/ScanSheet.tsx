"use client";

/**
 * ScanSheet — the global barcode entry point, opened from the mobile tab bar.
 *
 * WHY A SHEET AND NOT A PAGE
 * Scanning is something you do *while* on another screen (checking a shelf,
 * mid-receiving, answering a customer). A route would cost the user their
 * scroll position, filters and place in a list. A bottom sheet keeps all of it.
 *
 * RESOLUTION IS NOT LOCAL
 * The code goes to `GET /api/v1/catalog/barcode/:code/pos` — the same canonical
 * resolver the terminal uses. That endpoint owns packaging (case vs each),
 * pack size, unit pricing and stock, so a case UPC scanned here reports "case
 * of 12" exactly as it does at the register. There is deliberately no
 * client-side barcode table: a second resolver is how the two surfaces drift.
 *
 * TWO INPUT PATHS, ONE HANDLER
 * Retail floors use HID "wedge" scanners that type the code and press Enter,
 * so the text field is focused on open and handles submit. Phones without one
 * get the camera path via `BarcodeDetector` where the browser ships it
 * (Chrome/Android; absent on iOS Safari as of writing), which is why the camera
 * is a progressive enhancement and the field is the guaranteed path — never
 * the other way round.
 *
 * Not to be confused with `lib/useBarcodeScanner.ts`: that hook listens at the
 * document for wedge input and deliberately ignores keystrokes while an input
 * is focused, which is what a page with no field (the terminal) needs. This
 * sheet owns a focused field, so the wedge types into it directly and the two
 * mechanisms would fight if both were active. Same hardware, opposite side of
 * the same decision — not a second implementation of one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/Button";

// ── BarcodeDetector — a browser API with no lib.dom types yet ───────────────
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}
function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

/** Formats worth asking for: retail UPC/EAN plus the code-128 most vendor
 *  case labels and internal SKU labels use. */
const SCAN_FORMATS = ["upc_a", "upc_e", "ean_13", "ean_8", "code_128", "code_39", "itf"];

interface ResolvedProduct {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  packaging?: { unit: string; displayName: string; packSize: number };
  pricing?: { unitPriceCents: number };
  inventory?: { baseQuantityPerUnit: number; stockOnHandEach: number; availableForSale: boolean };
  price_cents?: number;
}

type ScanState =
  | { kind: "idle" }
  | { kind: "resolving"; code: string }
  | { kind: "found"; code: string; product: ResolvedProduct }
  | { kind: "not_found"; code: string }
  | { kind: "denied"; code: string }
  | { kind: "offline"; code: string }
  | { kind: "failed"; code: string; message: string };

export interface ScanSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ScanSheet({ open, onClose }: ScanSheetProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [state, setState] = useState<ScanState>({ kind: "idle" });
  const [recent, setRecent] = useState<Array<{ code: string; name: string; id: string }>>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const cameraSupported = useRef<boolean>(false);

  useEffect(() => {
    cameraSupported.current =
      getBarcodeDetector() !== null &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia);
  }, []);

  const resolve = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setState({ kind: "resolving", code: trimmed });
    try {
      const product = await apiGet<ResolvedProduct>(
        `/api/v1/catalog/barcode/${encodeURIComponent(trimmed)}/pos`,
      );
      setState({ kind: "found", code: trimmed, product });
      setRecent((prev) =>
        [{ code: trimmed, name: product.name, id: product.id }, ...prev.filter((r) => r.code !== trimmed)].slice(0, 5),
      );
      setCode("");
    } catch (e) {
      // Distinct states, because the recovery differs: a wrong code needs a
      // re-scan, a 403 needs a different user, and a dropped connection needs
      // a retry with the SAME code. A single "Something went wrong" would make
      // all three look identical and send the operator down the wrong path.
      if (e instanceof ApiResponseError) {
        if (e.status === 404) setState({ kind: "not_found", code: trimmed });
        else if (e.status === 401 || e.status === 403) setState({ kind: "denied", code: trimmed });
        else setState({ kind: "failed", code: trimmed, message: e.message });
      } else if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setState({ kind: "offline", code: trimmed });
      } else {
        setState({
          kind: "failed",
          code: trimmed,
          message: e instanceof Error ? e.message : "The lookup did not complete.",
        });
      }
    }
  }, []);

  // Focus the field on open — a wedge scanner types into whatever is focused,
  // so without this the first scan of the session goes nowhere.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Reset transient state when the sheet closes; `recent` deliberately survives
  // so reopening still shows the last few lookups.
  useEffect(() => {
    if (open) return;
    setState({ kind: "idle" });
    setCode("");
    setCameraOn(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const goTo = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end md:items-center md:justify-center">
      <button
        type="button"
        aria-label="Close scanner"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--color-surface-overlay)]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-sheet-title"
        // Full-width sheet on phones, a centred dialog from `md` up. Capped at
        // 92dvh so the sheet cannot exceed the viewport when the on-screen
        // keyboard is up — dvh, not vh, because vh ignores mobile browser chrome.
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface-1 pb-safe shadow-modal md:max-w-md md:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="scan-sheet-title" className="text-md font-semibold text-content-primary">
            Scan
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-control text-content-secondary hover:bg-surface-2 hover:text-content-primary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void resolve(code);
            }}
            className="flex gap-2"
          >
            <label htmlFor="scan-sheet-input" className="sr-only">
              Barcode, UPC or SKU
            </label>
            <input
              ref={inputRef}
              id="scan-sheet-input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Scan or type a barcode…"
              // `inputMode="numeric"` would be wrong: SKUs and code-128 labels
              // are alphanumeric, and it would hide the letters those need.
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
              className="focus-ring min-h-touch w-full flex-1 rounded-control border border-line bg-surface-1 px-3 font-mono text-base text-content-primary placeholder:text-content-muted"
            />
            <Button type="submit" size="lg" disabled={!code.trim() || state.kind === "resolving"}>
              {state.kind === "resolving" ? "…" : "Find"}
            </Button>
          </form>

          {cameraSupported.current && (
            <button
              type="button"
              onClick={() => setCameraOn((c) => !c)}
              className="focus-ring mt-2 flex min-h-touch w-full items-center justify-center gap-2 rounded-control border border-line text-sm font-medium text-content-secondary hover:bg-surface-2 hover:text-content-primary"
            >
              <CameraIcon />
              {cameraOn ? "Stop camera" : "Use camera"}
            </button>
          )}

          {cameraOn && (
            <CameraScanner
              onDetect={(value) => {
                setCameraOn(false);
                void resolve(value);
              }}
              onError={(message) => {
                setCameraOn(false);
                setState({ kind: "failed", code: "", message });
              }}
            />
          )}

          <div aria-live="polite" className="mt-4">
            <ScanStateView state={state} onRetry={resolve} goTo={goTo} />
          </div>

          {recent.length > 0 && state.kind === "idle" && (
            <div className="mt-6">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-content-secondary">
                Recent
              </h3>
              <ul className="mt-2 divide-y divide-line-subtle">
                {recent.map((r) => (
                  <li key={r.code}>
                    <button
                      type="button"
                      onClick={() => goTo(`/catalog/${r.id}`)}
                      className="focus-ring flex min-h-touch w-full items-center justify-between gap-3 rounded-control px-1 text-left hover:bg-surface-2"
                    >
                      <span className="truncate text-sm text-content-primary">{r.name}</span>
                      <span className="shrink-0 font-mono text-2xs text-content-muted">{r.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Result / error states ───────────────────────────────────────────────────
// Every failure states what happened, what it means, and what to do next.

function ScanStateView({
  state,
  onRetry,
  goTo,
}: {
  state: ScanState;
  onRetry: (code: string) => void | Promise<void>;
  goTo: (href: string) => void;
}) {
  if (state.kind === "idle") {
    return (
      <p className="text-sm text-content-secondary">
        Point a scanner at the field above, or type a UPC, case UPC or SKU.
      </p>
    );
  }

  if (state.kind === "resolving") {
    return (
      <div className="rounded-container border border-line bg-surface-2 p-4">
        <div className="h-4 w-2/3 animate-skeleton rounded" />
        <div className="mt-2 h-3 w-1/3 animate-skeleton rounded" />
      </div>
    );
  }

  if (state.kind === "found") {
    const p = state.product;
    const pack = p.packaging;
    const isMultiPack = Boolean(pack && pack.packSize > 1);
    const priceCents = p.pricing?.unitPriceCents ?? p.price_cents ?? 0;
    const stock = p.inventory?.stockOnHandEach;
    return (
      <div className="rounded-container border border-success-border bg-success-bg p-4">
        <p className="text-base font-semibold text-content-primary">{p.name}</p>
        <p className="mt-0.5 font-mono text-xs text-content-secondary">
          {p.sku}
          {p.barcode ? ` · ${p.barcode}` : ""}
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-2xs uppercase tracking-wide text-content-secondary">
              {isMultiPack ? `Price / ${pack!.displayName}` : "Price"}
            </dt>
            <dd className="tnum font-semibold text-content-primary">{formatMoney(priceCents)}</dd>
          </div>
          {stock != null && (
            <div>
              <dt className="text-2xs uppercase tracking-wide text-content-secondary">On hand</dt>
              <dd className="tnum font-semibold text-content-primary">{stock} each</dd>
            </div>
          )}
          {/* Surfaced because it is the single most misread fact on a scan:
              a case UPC and its each UPC look identical on the shelf. */}
          {isMultiPack && (
            <div className="col-span-2">
              <dt className="text-2xs uppercase tracking-wide text-content-secondary">Unit scanned</dt>
              <dd className="font-semibold text-content-primary">
                {pack!.displayName} of {pack!.packSize}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-4 flex gap-2">
          <Button size="lg" onClick={() => goTo(`/catalog/${p.id}`)} fullWidth>
            View product
          </Button>
        </div>
      </div>
    );
  }

  const shell = (title: string, meaning: string, action: React.ReactNode) => (
    <div role="alert" className="rounded-container border border-danger-border bg-danger-bg p-4">
      <p className="text-sm font-semibold text-danger-700">{title}</p>
      <p className="mt-1 text-sm text-content-secondary">{meaning}</p>
      <div className="mt-3">{action}</div>
    </div>
  );

  if (state.kind === "not_found") {
    return shell(
      `No product matches ${state.code}`,
      "The code scanned cleanly but nothing in this catalog carries it. It may be a case UPC that has not been added to the product yet, or the item belongs to another location.",
      <Button size="lg" variant="secondary" onClick={() => goTo("/catalog")}>
        Search the catalog
      </Button>,
    );
  }

  if (state.kind === "denied") {
    return shell(
      "You do not have access to product lookup",
      "Your role cannot read the catalog. This is enforced on the server, so it will not change by retrying.",
      <p className="text-sm text-content-secondary">Ask an owner or manager to grant catalog access.</p>,
    );
  }

  if (state.kind === "offline") {
    return shell(
      "No connection",
      `${state.code} was not sent. Nothing was looked up and nothing was changed.`,
      <Button size="lg" variant="secondary" onClick={() => void onRetry(state.code)}>
        Try again
      </Button>,
    );
  }

  return shell(
    "The lookup failed",
    state.message,
    state.code ? (
      <Button size="lg" variant="secondary" onClick={() => void onRetry(state.code)}>
        Try again
      </Button>
    ) : null,
  );
}

// ── Camera path ─────────────────────────────────────────────────────────────

function CameraScanner({
  onDetect,
  onError,
}: {
  onDetect: (value: string) => void;
  onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const Ctor = getBarcodeDetector();
    if (!Ctor) {
      onError("This browser cannot scan with the camera. Use the field above.");
      return;
    }

    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new Ctor({ formats: SCAN_FORMATS });

    const tick = async () => {
      const video = videoRef.current;
      if (stopped || !video || video.readyState < 2) {
        raf = requestAnimationFrame(() => void tick());
        return;
      }
      try {
        const results = await detector.detect(video);
        const hit = results.find((r) => r.rawValue);
        if (hit) {
          stopped = true;
          onDetect(hit.rawValue);
          return;
        }
      } catch {
        // A single failed frame is normal (motion blur, no barcode in view).
        // Only a getUserMedia/constructor failure is worth surfacing.
      }
      raf = requestAnimationFrame(() => void tick());
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        raf = requestAnimationFrame(() => void tick());
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        onError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser settings, or type the code above."
            : "The camera could not be started. Type the code above instead.",
        );
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect, onError]);

  return (
    <div className="mt-3 overflow-hidden rounded-container border border-line bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Camera viewfinder"
        className="aspect-[4/3] w-full object-cover"
      />
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
