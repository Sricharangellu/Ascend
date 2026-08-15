"use client";

/**
 * MobileTabBar — primary navigation below the `md` breakpoint.
 *
 * WHY THIS EXISTS
 * On a phone the only way into any part of Ascend was the top-bar hamburger,
 * which opens the desktop rail as a 220px overlay: ten collapsed sections, the
 * relevant one expanded, the target link somewhere inside it. Reaching anything
 * cost a menu open, a section expand and a link tap, at the rail's desktop row
 * density, on a 375px screen.
 *
 * THE TAB SET IS NOT A FRESH DESIGN — IT MIRRORS THE NATIVE APP
 * `artifacts/ascend-mobile` is an Expo app titled "Ascend Mobile" whose tabs are
 * Dashboard / Inventory / Orders / Search. This bar deliberately matches it, on
 * Sri's call (2026-08-15), so a user moving between the native app and the web
 * app on a phone meets the same four destinations in the same order.
 *
 * Two places where a literal port is impossible, and what was done instead:
 *
 *  - **More has no native counterpart and cannot be dropped.** The native app
 *    has four screens in total, so four tabs reach all of it. The web app has
 *    ~100 routes; without More, every route outside the four tabs — the
 *    register, purchasing, receiving, customers, settings, reports — becomes
 *    unreachable on a phone. More is a web-only structural necessity, not an
 *    extra tab.
 *  - **Search has no route.** The native Search tab is a screen; the web app has
 *    no `/search` page, it has a command palette. So Search opens that palette,
 *    which already resolves products, orders, customers, vendors and POs and
 *    deep-links to their detail pages.
 *
 * WHAT THIS COST, RECORDED HONESTLY
 * The previous iteration of this bar carried Sell (`/terminal`) and a centre
 * Scan action, which took the register from three taps to one and a barcode
 * lookup from ~12 taps of typing to one. Aligning to the native IA removes both
 * from the bar: Sell now lives under More, and Scan moved into the palette that
 * Search opens — one tap further than before, rather than deleted. The native
 * app has neither a register nor a scanner, so there was nothing to align them
 * to.
 *
 * GATING
 * Same layers as the rail, in the same order (capabilities → permissions), so a
 * tab can never offer a route the tenant has disabled or the user cannot use.
 * Dashboard, Search and More are never gated: Dashboard is the fallback
 * destination and the other two are the only ways to reach anything not on the
 * bar. Hiding a tab is presentation only — the route is still enforced
 * server-side.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCapabilities } from "@/contexts/CapabilitiesContext";
import { usePermissions } from "@/contexts/PermissionsContext";

export interface MobileTabBarProps {
  /** Opens the full navigation drawer (the rail) — the "More" tab. */
  onMoreClick: () => void;
  /** Opens the command palette — the "Search" tab. */
  onSearchClick: () => void;
  /** True while the drawer is open, so "More" reports its state. */
  moreOpen: boolean;
}

type Tab = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Permissions-layer gate, matching the rail's `featureGate`. */
  featureGate?: string;
};

/** Order and labels mirror `artifacts/ascend-mobile/app/(tabs)/_layout.tsx`. */
const TABS: Tab[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: <HomeIcon /> },
  { key: "inventory", label: "Inventory", href: "/inventory", icon: <BoxIcon />, featureGate: "inventory" },
  { key: "orders", label: "Orders", href: "/orders", icon: <ClipboardIcon />, featureGate: "orders" },
];

export function MobileTabBar({ onMoreClick, onSearchClick, moreOpen }: MobileTabBarProps) {
  const pathname = usePathname();
  const { hasFeature } = usePermissions();
  const { routeEnabled } = useCapabilities();

  const visible = TABS.filter(
    (t) => routeEnabled(t.href) && (!t.featureGate || hasFeature(t.featureGate)),
  );

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      // NOT "Primary" — the rail already exposes a landmark named "Primary
      // navigation", and two nav landmarks whose names differ by one word are
      // indistinguishable when a screen reader lists them.
      aria-label="Quick navigation"
      // `pb-safe` clears the iOS home indicator; without it the bottom row of
      // labels sits under the gesture bar on every notched device.
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-surface-1 pb-safe md:hidden"
      style={{ height: "calc(var(--mobile-nav-h) + var(--safe-bottom))" }}
    >
      {visible.map((t) => (
        <TabLink key={t.key} tab={t} active={isActive(t.href)} />
      ))}

      <TabButton label="Search" onClick={onSearchClick} icon={<SearchIcon />} />

      <TabButton
        label="More"
        onClick={onMoreClick}
        icon={<MoreIcon />}
        ariaLabel="More navigation"
        expanded={moreOpen}
        active={moreOpen}
      />
    </nav>
  );
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={`focus-ring flex flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
        active ? "text-brand-600" : "text-content-secondary hover:text-content-primary"
      }`}
    >
      <span className="relative">
        {tab.icon}
        {/* Active state is carried by colour AND this bar, so it never relies
            on colour alone (design-system accessibility rule). */}
        {active && (
          <span
            aria-hidden="true"
            className="absolute -top-2 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-brand-600"
          />
        )}
      </span>
      <span className="text-[10px] font-medium leading-none">{tab.label}</span>
    </Link>
  );
}

/** A tab that performs an action rather than navigating — Search and More. */
function TabButton({
  label,
  onClick,
  icon,
  ariaLabel,
  expanded,
  active = false,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  ariaLabel?: string;
  expanded?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      aria-expanded={expanded}
      className={`focus-ring flex flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
        active ? "text-brand-600" : "text-content-secondary hover:text-content-primary"
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}

// ── Icons — 22px, matching the rail's stroke weight. Shapes chosen to echo the
//    native app's SF Symbols (house / shippingbox / list.clipboard / magnifyingglass).

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
