
import type { PurchasingTab } from "./shared";

export function TabBar({
  active,
  onChange,
  showVendorQuotes = true,
}: {
  active: PurchasingTab;
  onChange: (t: PurchasingTab) => void;
  showVendorQuotes?: boolean;
}) {
  const tabs: { key: PurchasingTab; label: string }[] = [
    { key: "orders",        label: "Purchase Orders"     },
    { key: "suppliers",     label: "Suppliers"           },
    { key: "reorder",       label: "Reorder Suggestions" },
    ...(showVendorQuotes ? [{ key: "vendor-quotes" as PurchasingTab, label: "Vendor Quotes" }] : []),
  ];

  return (
    <div className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <nav className="-mb-px flex gap-0 px-4" aria-label="Purchasing tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-current={active === t.key ? "page" : undefined}
            className={[
              "relative min-h-[44px] px-4 text-[13px] font-medium transition-colors duration-150",
              "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-t-full after:transition-all",
              active === t.key
                ? "text-brand-600 after:bg-brand-600"
                : "after:bg-transparent",
            ].join(" ")}
            style={{ color: active === t.key ? undefined : "var(--color-text-secondary)" }}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
