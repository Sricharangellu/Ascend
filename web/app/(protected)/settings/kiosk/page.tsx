"use client";

/**
 * Kiosk Mode settings — Preview only.
 *
 * There is no backend persistence for these toggles today. Save must not pretend
 * to succeed (Ponytail Wave 0 honesty). Nav marks this page `partial: true`.
 */

import { useState } from "react";
import Link from "next/link";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Button } from "@/components/Button";

type PaymentMethod = "card" | "cash" | "loyalty" | "gift_card";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "Credit / Debit Card",
  cash: "Cash",
  loyalty: "Loyalty Points",
  gift_card: "Gift Card",
};

const TIMEOUT_OPTIONS = [
  { value: "30", label: "30 seconds" },
  { value: "60", label: "1 minute" },
  { value: "120", label: "2 minutes" },
  { value: "300", label: "5 minutes" },
];

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-erp-table-border bg-white px-4 py-4 shadow-sm">
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-erp-text-primary">{label}</p>
        {description && <p className="text-xs text-erp-text-secondary">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-brand-600" : "bg-erp-table-border"
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-[2px]"
          }`}
        />
      </button>
    </div>
  );
}

export default function KioskSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [pin, setPin] = useState("1234");
  const [showPin, setShowPin] = useState(false);
  const [idleTimeout, setIdleTimeout] = useState("120");
  const [showPrices, setShowPrices] = useState(true);
  const [allowedMethods, setAllowedMethods] = useState<Set<PaymentMethod>>(
    new Set(["card", "cash"]),
  );

  const toggleMethod = (m: PaymentMethod) => {
    setAllowedMethods((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  // Relative path only — never hard-code a legacy product host.
  const KIOSK_URL = "/kiosk";

  return (
    <EnterpriseShell
      active="kiosk-settings"
      title="Kiosk Mode"
      subtitle="Self-checkout terminal setup"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <div
          className="mb-4 rounded-lg border border-warning-100 bg-warning-50 px-3 py-2 text-xs text-warning-700"
          role="status"
        >
          <span className="font-semibold">Preview:</span> kiosk settings are not
          saved yet — there is no backend for these toggles. Changes stay in this
          browser session only and are discarded on reload.
        </div>

        <div className="mb-6">
          <h1 className="text-lg font-semibold text-erp-text-primary">Kiosk Mode</h1>
          <p className="mt-1 text-sm text-erp-text-secondary">
            Configure a customer-facing self-checkout terminal on a dedicated tablet or touchscreen.
            Staff use a PIN to exit kiosk mode and return to the back office.
          </p>
        </div>

        <SectionCard>
          <ToggleRow
            label="Enable Kiosk Mode"
            description="When enabled, this terminal locks into a simplified customer checkout interface."
            checked={enabled}
            onChange={setEnabled}
          />
        </SectionCard>

        {enabled && (
          <div className="mt-4 space-y-4">
            <SectionCard>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-erp-text-secondary">
                Kiosk URL
              </p>
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-erp-page px-3 py-2.5">
                <span className="flex-1 select-all font-mono text-sm text-erp-text-primary">
                  {KIOSK_URL}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(KIOSK_URL)}
                >
                  Copy
                </Button>
              </div>
              <p className="mt-2 text-xs text-erp-text-secondary">
                Open this path on a dedicated tablet once kiosk mode ships end-to-end.
              </p>
            </SectionCard>

            <SectionCard>
              <label className="block text-sm font-medium text-erp-text-primary" htmlFor="kiosk-pin">
                Exit PIN
              </label>
              <p className="mt-0.5 text-xs text-erp-text-secondary">
                Staff enter this PIN to exit kiosk mode and return to the back office.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="kiosk-pin"
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  className="w-32 rounded-lg border border-erp-table-border px-3 py-2 font-mono text-lg tracking-widest focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowPin((v) => !v)}>
                  {showPin ? "Hide" : "Show"}
                </Button>
              </div>
            </SectionCard>

            <SectionCard>
              <label className="block text-sm font-medium text-erp-text-primary" htmlFor="kiosk-timeout">
                Idle Timeout
              </label>
              <p className="mt-0.5 text-xs text-erp-text-secondary">
                Return to the welcome screen after this period of inactivity.
              </p>
              <select
                id="kiosk-timeout"
                value={idleTimeout}
                onChange={(e) => setIdleTimeout(e.target.value)}
                className="mt-2 rounded-lg border border-erp-table-border px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                {TIMEOUT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </SectionCard>

            <SectionCard>
              <ToggleRow
                label="Show Product Prices"
                description="Display retail prices in the product browser and cart."
                checked={showPrices}
                onChange={setShowPrices}
              />
            </SectionCard>

            <SectionCard>
              <p className="text-sm font-medium text-erp-text-primary">Allowed Payment Methods</p>
              <p className="mt-0.5 text-xs text-erp-text-secondary">
                Only selected methods will be offered to customers at checkout.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["card", "cash", "loyalty", "gift_card"] as PaymentMethod[]).map((m) => {
                  const active = allowedMethods.has(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMethod(m)}
                      className={`min-h-touch rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                        active
                          ? "bg-brand-600 text-white"
                          : "border border-erp-table-border text-erp-text-secondary hover:bg-erp-page"
                      }`}
                    >
                      {METHOD_LABELS[m]}
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <div className="flex items-start gap-2 rounded-lg border border-erp-table-border bg-erp-page px-3 py-2.5 text-xs text-erp-text-secondary">
              <p>
                When a real kiosk backend ships, enablement will also require{" "}
                <Link href="/settings/modes" className="font-medium text-brand-600 hover:underline">
                  Business Modes
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button type="button" variant="primary" disabled title="No kiosk settings API yet">
            Save unavailable
          </Button>
        </div>
      </div>
    </EnterpriseShell>
  );
}
