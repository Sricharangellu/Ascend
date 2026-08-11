"use client";

/**
 * MobileTabBar — primary navigation below the `md` breakpoint.
 *
 * WHY THIS EXISTS
 * On a phone the only way into any part of Ascend was the top-bar hamburger,
 * which opens the desktop rail as a 220px overlay: ten collapsed sections, the
 * relevant one expanded, the target link somewhere inside it. Reaching the
 * register — the single most frequent retail task — cost a menu open, a section
 * expand and a link tap, with the tap targets at the rail's desktop density
 * (36px rows) and the whole tree competing for a 375px-wide screen.
 *
 * So the four highest-frequency destinations are lifted out of the tree and put
 * one thumb-tap away, and the tree stays behind "More" for everything else.
 * This is deliberately NOT a compression of the desktop IA: the tabs are chosen
 * by task frequency for a retail operator on the floor, not by mirroring the
 * rail's top level (which would give Home / Sell / Online / Reporting / …).
 *
 * Scan is the centre tab and is an ACTION, not a destination. Scanning is the
 * one interaction that removes typing entirely, and on a phone typing is the
 * expensive part — a 12-digit UPC is ~12 taps and a misread. It opens the
 * global scan sheet over whatever page you are on, so it never costs you your
 * place. It resolves through the same canonical backend endpoint the terminal
 * uses (`/catalog/barcode/:code/pos`); there is no second mobile resolver.
 *
 * GATING
 * Same layers as the rail, in the same order (capabilities → permissions), so
 * a tab can never offer a route the tenant has disabled or the user cannot use.
 * Home and More are never gated: Home is the fallback destination and More is
 * the only way to reach anything not on the bar. Hiding a tab is presentation
 * only — the route itself is still enforced server-side.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCapabilities } from "@/contexts/CapabilitiesContext";
import { usePermissions } from "@/contexts/PermissionsContext";

export interface MobileTabBarProps {
  /** Opens the full navigation drawer (the rail) — the "More" tab. */
  onMoreClick: () => void;
  /** Opens the global scan sheet — the centre tab. */
  onScanClick: () => void;
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

const TABS: Tab[] = [
  { key: "home", label: "Home", href: "/dashboard", icon: <HomeIcon /> },
  { key: "sell", label: "Sell", href: "/terminal", icon: <SellIcon />, featureGate: "register" },
  { key: "stock", label: "Stock", href: "/inventory", icon: <StockIcon />, featureGate: "inventory" },
  { key: "orders", label: "Orders", href: "/orders", icon: <OrdersIcon />, featureGate: "orders" },
];

export function MobileTabBar({ onMoreClick, onScanClick, moreOpen }: MobileTabBarProps) {
  const pathname = usePathname();
  const { hasFeature } = usePermissions();
  const { routeEnabled } = useCapabilities();

  const visible = TABS.filter(
    (t) => routeEnabled(t.href) && (!t.featureGate || hasFeature(t.featureGate)),
  );

  // Split around the centre action so Scan always sits in the middle, even
  // when a gate removes a tab. With everything gated away the bar is still
  // Scan + More, which is the minimum useful mobile surface.
  const half = Math.ceil(visible.length / 2);
  const left = visible.slice(0, half);
  const right = visible.slice(half);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Primary"
      // `pb-safe` clears the iOS home indicator; without it the bottom row of
      // labels sits under the gesture bar on every notched device.
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-surface-1 pb-safe md:hidden"
      style={{ height: "calc(var(--mobile-nav-h) + var(--safe-bottom))" }}
    >
      {left.map((t) => (
        <TabLink key={t.key} tab={t} active={isActive(t.href)} />
      ))}

      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={onScanClick}
          aria-label="Scan a barcode"
          className="focus-ring -mt-4 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-brand-600 text-white shadow-popover transition-colors hover:bg-brand-700 active:bg-brand-800"
        >
          <ScanIcon />
          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide">Scan</span>
        </button>
      </div>

      {right.map((t) => (
        <TabLink key={t.key} tab={t} active={isActive(t.href)} />
      ))}

      <button
        type="button"
        onClick={onMoreClick}
        aria-expanded={moreOpen}
        aria-label="More navigation"
        className={`focus-ring flex flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
          moreOpen ? "text-brand-600" : "text-content-secondary hover:text-content-primary"
        }`}
      >
        <MoreIcon />
        <span className="text-[10px] font-medium leading-none">More</span>
      </button>
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
        {/* Active state is carried by colour AND this bar, so it does not rely
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

// ── Icons — 22px, matching the rail's stroke weight ─────────────────────────

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function SellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function StockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
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
