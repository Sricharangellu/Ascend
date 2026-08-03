
import Link from "@/lib/link";
import { usePathname } from "@/lib/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/lib/useAuth";
import { useOffline } from "@/lib/useOffline";
import { useFinderContext } from "@/lib/useFinderContext";
import { useModuleFlags } from "@/hooks/useModuleFlags";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useCapabilities } from "@/contexts/CapabilitiesContext";

// ── NavKey ────────────────────────────────────────────────────────────────────

export type NavKey =
  | "dashboard" | "register" | "inventory" | "purchasing" | "customers"
  | "orders" | "sales" | "accounting" | "shipping" | "discounts" | "ecommerce"
  | "reports" | "settings" | "operations" | "team" | "insights" | "finance"
  | "catalog" | "gift-cards" | "vendors" | "payments" | "returns"
  | "tax-compliance" | "integrations" | "imports-exports" | "workflows"
  | "quotes" | "loyalty" | "notifications" | "audit-log" | "service-orders"
  | "inventory-locations" | "inventory-expiry" | "invoicing" | "inventory-serials"
  | "inventory-reorder" | "inventory-counts" | "inventory-pipeline" | "workforce" | "appointments"
  | "healthcare" | "automotive" | "hospitality" | "manufacturing" | "rental"
  | "entertainment" | "education" | "module-marketplace" | "kitchen" | "bar-tabs"
  | "golf" | "golf-bookings" | "golf-members" | "golf-pro-shop"
  | "restaurant-dashboard" | "restaurant-floor-plan" | "restaurant-tabs"
  | "permissions" | "modes" | "kiosk-settings" | "b2b-settings"
  | "warehouse" | "pricing" | "edi-imports" | "promotions" | "documents"
  | "inventory-errors" | "bills" | "delivery";

// ── Section / nav tree ────────────────────────────────────────────────────────

type RailSection =
  | "home" | "sell" | "online" | "reporting" | "catalog"
  | "inventory" | "customers" | "finance" | "setup";

const SECTION_MAP: Record<NavKey, RailSection> = {
  dashboard: "home",
  register: "sell", sales: "sell", orders: "sell", quotes: "sell",
  returns: "sell", payments: "sell", "service-orders": "sell",
  ecommerce: "online",
  reports: "reporting", insights: "reporting", "tax-compliance": "reporting",
  catalog: "catalog", discounts: "catalog", "gift-cards": "catalog",
  loyalty: "catalog", promotions: "catalog", pricing: "catalog",
  inventory: "inventory", operations: "inventory", purchasing: "inventory",
  "edi-imports": "inventory",
  vendors: "inventory", shipping: "inventory", "inventory-locations": "inventory",
  "inventory-expiry": "inventory", "inventory-serials": "inventory",
  "inventory-reorder": "inventory", "inventory-counts": "inventory", "inventory-pipeline": "inventory", "inventory-errors": "inventory", workforce: "inventory",
  warehouse: "inventory", delivery: "inventory",
  customers: "customers", appointments: "customers", healthcare: "customers",
  finance: "finance", accounting: "finance", invoicing: "finance", bills: "finance",
  settings: "setup", team: "setup", workflows: "setup", integrations: "setup",
  notifications: "setup", "audit-log": "setup", "imports-exports": "setup",
  "module-marketplace": "setup", documents: "setup",
  automotive: "setup", hospitality: "setup", manufacturing: "setup",
  rental: "setup", entertainment: "setup", education: "setup",
  kitchen: "sell", "bar-tabs": "sell",
  "restaurant-dashboard": "sell", "restaurant-floor-plan": "sell", "restaurant-tabs": "sell",
  golf: "sell", "golf-bookings": "sell", "golf-members": "sell", "golf-pro-shop": "sell",
  permissions: "setup", modes: "setup", "kiosk-settings": "setup", "b2b-settings": "setup",
} as Record<NavKey, RailSection>;

type NavChild = {
  label: string;
  href: string;
  featureGate?: string;
  partial?: boolean;
};

const SHOW_PARTIAL_PAGES = import.meta.env.VITE_SHOW_PARTIAL_PAGES === "true";

/**
 * Whether a nav child is visible — four-layer gate (partial → tenant route
 * → user feature). Pure/exported for unit testing without rendering the shell.
 */
export function isNavChildVisible(
  child: NavChild,
  deps: { showPartial: boolean; routeEnabled: (href: string) => boolean; hasFeature: (f: string) => boolean },
): boolean {
  if (child.partial && !deps.showPartial) return false;
  if (!deps.routeEnabled(child.href)) return false;
  if (child.featureGate && !deps.hasFeature(child.featureGate)) return false;
  return true;
}

type NavSection = {
  section: RailSection;
  label: string;
  href?: string;
  icon: React.ReactNode;
  children?: NavChild[];
  moduleGate?: string;
  featureGate?: string;
};

const NAV_TREE: NavSection[] = [
  {
    section: "home",
    label: "Dashboard",
    href: "/dashboard",
    icon: <HomeIcon />,
  },
  {
    section: "sell",
    label: "Sales",
    icon: <SellIcon />,
    children: [
      { label: "Register",       href: "/terminal",       featureGate: "register" },
      { label: "Sales",          href: "/sales",          featureGate: "sales" },
      { label: "Orders",         href: "/orders",         featureGate: "orders" },
      { label: "Quotes",         href: "/quotes",         featureGate: "quotes" },
      { label: "Returns",        href: "/returns",        featureGate: "returns" },
      { label: "Payments",       href: "/payments",       featureGate: "payments" },
      { label: "Service Orders", href: "/service-orders", featureGate: "service-orders" },
    ],
  },
  {
    section: "catalog",
    label: "Catalog",
    icon: <CatalogIcon />,
    children: [
      { label: "Products",    href: "/catalog",            featureGate: "catalog" },
      { label: "Pricing",     href: "/pricing",            featureGate: "catalog",    partial: true },
      { label: "Promotions",  href: "/catalog/promotions", featureGate: "catalog",    partial: true },
      { label: "Discounts",   href: "/discounts",          featureGate: "discounts" },
      { label: "Gift Cards",  href: "/gift-cards",         featureGate: "gift-cards" },
      { label: "Loyalty",     href: "/loyalty",            featureGate: "loyalty" },
    ],
  },
  {
    section: "inventory",
    label: "Inventory",
    icon: <InventoryIcon />,
    children: [
      { label: "Overview",       href: "/inventory",               featureGate: "inventory" },
      { label: "Pipeline",       href: "/inventory/pipeline",      featureGate: "inventory" },
      { label: "Receive Stock",  href: "/inventory/receive-stock", featureGate: "inventory" },
      { label: "Purchasing",     href: "/purchasing",              featureGate: "purchasing" },
      { label: "Purchase",       href: "/purchase",                featureGate: "purchasing" },
      { label: "Expiry",         href: "/inventory/expiry-pool",   featureGate: "inventory" },
      { label: "Cycle Counts",   href: "/inventory/counts",        featureGate: "inventory" },
      { label: "Reorder",        href: "/inventory/reorder",       featureGate: "inventory" },
      { label: "Serial Numbers", href: "/inventory/serials",       featureGate: "inventory" },
      { label: "Locations",      href: "/inventory/locations",     featureGate: "inventory" },
      { label: "Vendors",        href: "/vendors",                 featureGate: "vendors" },
      { label: "Warehouse",      href: "/warehouse",               featureGate: "inventory", partial: true },
      { label: "Delivery",       href: "/delivery",                featureGate: "shipping" },
      { label: "EDI Imports",    href: "/purchasing/edi-imports",  featureGate: "purchasing" },
      { label: "Error Center",   href: "/inventory/errors",        featureGate: "inventory" },
      { label: "Operations",     href: "/operations",              featureGate: "operations" },
    ],
  },
  {
    section: "customers",
    label: "Customers",
    icon: <CustomersIcon />,
    children: [
      { label: "Customers",    href: "/customers",    featureGate: "customers" },
      { label: "Appointments", href: "/appointments", featureGate: "appointments" },
    ],
  },
  {
    section: "finance",
    label: "Finance",
    icon: <FinanceIcon />,
    children: [
      { label: "Overview",   href: "/finance",    featureGate: "finance" },
      { label: "Accounting", href: "/accounting", featureGate: "accounting" },
      { label: "Bills",      href: "/bills",      featureGate: "accounting" },
      { label: "Invoicing",  href: "/invoicing",  featureGate: "invoicing" },
    ],
  },
  {
    section: "reporting",
    label: "Analytics",
    icon: <ReportingIcon />,
    children: [
      { label: "Reports",        href: "/reports",        featureGate: "reports" },
      { label: "Insights",       href: "/insights",       featureGate: "insights" },
      { label: "Tax Compliance", href: "/tax-compliance", featureGate: "tax-compliance" },
    ],
  },
  {
    section: "online",
    label: "Online",
    href: "/ecommerce",
    icon: <OnlineIcon />,
    moduleGate: "ecommerce",
    featureGate: "ecommerce",
  },
  {
    section: "setup",
    label: "Settings",
    icon: <SetupIcon />,
    children: [
      { label: "General",         href: "/settings",             featureGate: "settings" },
      { label: "Permissions",     href: "/settings/permissions", featureGate: "settings" },
      { label: "Business Modes",  href: "/settings/modes",       featureGate: "settings" },
      { label: "Kiosk Mode",      href: "/settings/kiosk",       featureGate: "settings" },
      { label: "B2B Portal",      href: "/settings/b2b",         featureGate: "settings" },
      { label: "Team",            href: "/team",                 featureGate: "team" },
      { label: "Workflows",       href: "/workflows",            featureGate: "workflows" },
      { label: "Integrations",    href: "/integrations",         featureGate: "integrations" },
      { label: "Imports/Exports", href: "/imports-exports",      featureGate: "imports-exports" },
      { label: "Document Center", href: "/documents",            featureGate: "documents", partial: true },
      { label: "Audit Log",       href: "/audit-log",            featureGate: "audit-log" },
    ],
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface EnterpriseShellProps {
  active: NavKey;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  banner?: React.ReactNode;
  contentClassName?: string;
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function EnterpriseShell({
  active,
  title,
  children,
  banner,
  contentClassName,
}: EnterpriseShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 768
  );

  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "/")) {
      e.preventDefault();
      setPaletteOpen((o) => !o);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [handleGlobalKey]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      setCompactViewport(media.matches);
      setSidebarExpanded((expanded) => (media.matches ? false : expanded || true));
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const sidebarW = sidebarExpanded ? 224 : 52;

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--color-page-bg)" }}>
      <a href="#main-content" className="skip-link">Skip to content</a>

      <TopBar
        sidebarExpanded={sidebarExpanded}
        onSearchClick={() => setPaletteOpen(true)}
        onMenuToggle={() => setSidebarExpanded((e) => !e)}
      />

      <div className="flex flex-1 pt-[52px]">
        {compactViewport && sidebarExpanded && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-x-0 bottom-0 top-[52px] z-30 bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarExpanded(false)}
          />
        )}
        <LeftRail
          active={active}
          expanded={sidebarExpanded}
          compact={compactViewport}
          onCollapseToggle={() => setSidebarExpanded((e) => !e)}
        />

        <main
          id="main-content"
          className={[
            "flex flex-1 flex-col min-w-0 transition-[margin-left] duration-200 ease-spring md:ml-[var(--sidebar-w)]",
            contentClassName ?? "overflow-y-auto",
          ].join(" ")}
          style={{ "--sidebar-w": `${sidebarW}px` } as React.CSSProperties}
        >
          <h1 className="sr-only">{title}</h1>
          {banner}
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────

function TopBar({
  sidebarExpanded,
  onSearchClick,
  onMenuToggle,
}: {
  sidebarExpanded: boolean;
  onSearchClick: () => void;
  onMenuToggle: () => void;
}) {
  const { user, logout } = useAuth();
  const { isOffline } = useOffline();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "U";

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex h-[52px] items-center gap-0 border-b"
      style={{
        backgroundColor: "var(--color-topbar-bg)",
        borderBottomColor: "rgba(255,255,255,0.07)",
      }}
    >
      {/* Brand / logo area — matches sidebar width */}
      <div
        className="flex items-center gap-2.5 px-4 shrink-0 transition-[width] duration-200 ease-spring overflow-hidden"
        style={{ width: sidebarExpanded ? 224 : 52 }}
      >
        {/* Logo mark */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </div>
        {/* Wordmark — only visible when expanded */}
        {sidebarExpanded && (
          <span className="text-[15px] font-bold tracking-[-0.02em] text-white whitespace-nowrap">
            Ascend
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="h-5 w-px shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />

      {/* Hamburger */}
      <button
        type="button"
        onClick={onMenuToggle}
        className="flex h-[52px] w-10 items-center justify-center text-white/50 hover:text-white/80 transition-colors shrink-0"
        aria-label="Toggle sidebar"
      >
        <HamburgerIcon />
      </button>

      {/* Search bar */}
      <button
        type="button"
        onClick={onSearchClick}
        className="flex flex-1 max-w-xl items-center gap-2.5 rounded-lg border px-3 h-8 text-[13px] text-white/40 hover:text-white/60 hover:bg-white/8 transition-all mx-4"
        style={{ borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.05)" }}
        aria-label="Open search (⌘/)"
      >
        <SearchIcon />
        <span className="flex-1 text-left font-normal">Search or jump to…</span>
        <div className="flex items-center gap-1">
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] font-medium" style={{ borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}>⌘</kbd>
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] font-medium" style={{ borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}>/</kbd>
        </div>
      </button>

      {/* Right controls */}
      <div className="flex items-center gap-1 pr-3 shrink-0">
        {isOffline && (
          <span className="rounded-full bg-warning-500 px-2.5 py-0.5 text-[11px] font-semibold text-white">
            Offline
          </span>
        )}

        {/* Help */}
        <a
          href="/help"
          className="hidden sm:flex items-center justify-center h-8 w-8 rounded-lg text-white/45 hover:text-white/70 hover:bg-white/8 transition-colors"
          title="Help"
        >
          <HelpIcon />
        </a>

        {/* Notifications */}
        <div className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-white/8 transition-colors">
          <NotificationBell />
        </div>

        {/* User menu */}
        <div className="relative ml-1" ref={menuRef}>
          <button
            type="button"
            aria-label="User menu"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg px-2 h-8 text-white/70 hover:text-white hover:bg-white/8 transition-colors"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white shrink-0 ring-1 ring-white/20">
              {initials}
            </div>
            <span className="hidden sm:block text-[13px] font-medium max-w-[100px] truncate">
              {user?.name?.split(" ")[0] ?? "User"}
            </span>
            <ChevronDown className="text-white/40" />
          </button>

          {userMenuOpen && (
            <div
              className="absolute right-0 top-10 z-50 w-52 rounded-xl border overflow-hidden animate-fade-up"
              style={{
                backgroundColor: "var(--color-surface)",
                borderColor: "var(--color-border)",
                boxShadow: "var(--shadow-xl)",
              }}
            >
              {/* User info */}
              <div className="px-3 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{user?.name}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--color-text-secondary)" }}>{user?.email}</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="py-1">
                <Link
                  href="/setup"
                  className="flex items-center gap-2 px-3 py-2 text-[13px] transition-colors hover:bg-[var(--color-surface-subtle)]"
                  style={{ color: "var(--color-text-primary)" }}
                  onClick={() => setUserMenuOpen(false)}
                >
                  <SettingsSmIcon /> Account settings
                </Link>
                <Link
                  href="/team"
                  className="flex items-center gap-2 px-3 py-2 text-[13px] transition-colors hover:bg-[var(--color-surface-subtle)]"
                  style={{ color: "var(--color-text-primary)" }}
                  onClick={() => setUserMenuOpen(false)}
                >
                  <TeamSmIcon /> Team
                </Link>
              </div>

              <div className="border-t py-1" style={{ borderColor: "var(--color-border)" }}>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-danger-600 hover:bg-danger-50 transition-colors"
                >
                  <LogOutSmIcon /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Left rail / sidebar ───────────────────────────────────────────────────────

function LeftRail({
  active,
  expanded,
  compact,
  onCollapseToggle,
}: {
  active: NavKey;
  expanded: boolean;
  compact: boolean;
  onCollapseToggle: () => void;
}) {
  const pathname = usePathname();
  const { enabled: enabledModules } = useModuleFlags();
  const { hasFeature, error: permissionsError } = usePermissions();
  const { routeEnabled } = useCapabilities();
  const activeSection = SECTION_MAP[active] ?? "home";
  const { registerId } = useFinderContext();

  const [openSections, setOpenSections] = useState<Set<RailSection>>(
    new Set([activeSection])
  );

  useEffect(() => {
    setOpenSections((prev) => new Set([...prev, activeSection]));
  }, [activeSection]);

  const toggleSection = (section: RailSection) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const childVisible = (c: NavChild) =>
    isNavChildVisible(c, { showPartial: SHOW_PARTIAL_PAGES, routeEnabled, hasFeature });

  const navItems = NAV_TREE.filter((item) => {
    if (item.moduleGate && !enabledModules.has(item.moduleGate) && !enabledModules.has("*")) return false;
    if (item.href && !routeEnabled(item.href)) return false;
    if (item.featureGate && !hasFeature(item.featureGate)) return false;
    if (item.children) {
      const visible = item.children.filter(childVisible);
      if (visible.length === 0) return false;
    }
    return true;
  });

  const sidebarWidth = compact && !expanded ? 0 : expanded ? 224 : 52;

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed left-0 top-[52px] bottom-0 z-40 flex flex-col overflow-hidden transition-[width] duration-200 ease-spring"
      style={{
        width: sidebarWidth,
        backgroundColor: "var(--color-sidebar-bg)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* ── Nav items ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 scrollbar-hide">

        {/* Permissions error */}
        {permissionsError && expanded && (
          <div
            role="alert"
            className="mx-3 mb-3 rounded-lg px-3 py-2.5 text-[12px] leading-snug"
            style={{ backgroundColor: "rgba(250,173,20,0.15)", color: "#FCD34D" }}
          >
            Permissions couldn't load. Some features are hidden — refresh to retry.
          </div>
        )}

        {navItems.map((item) => {
          const isActive = activeSection === item.section;
          const hasChildren = !!(item.children && item.children.length > 0);
          const isOpen = openSections.has(item.section);
          const visibleChildren = item.children?.filter(childVisible) ?? [];

          return (
            <div key={item.section}>
              {/* Section row */}
              {hasChildren || !item.href ? (
                <button
                  type="button"
                  title={expanded ? undefined : item.label}
                  aria-label={item.label}
                  aria-expanded={hasChildren ? isOpen : undefined}
                  onClick={() => {
                    if (hasChildren) toggleSection(item.section);
                    else if (item.href) window.location.href = item.href;
                  }}
                  className={[
                    "group relative flex w-full items-center gap-3 px-3 py-[9px] transition-all duration-150",
                    isActive
                      ? "text-white"
                      : "text-white/50 hover:text-white/80",
                  ].join(" ")}
                  style={{
                    backgroundColor: isActive && !expanded
                      ? "var(--color-sidebar-active)"
                      : "transparent",
                  }}
                >
                  {/* Active bar — expanded */}
                  {expanded && isActive && (
                    <span
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-600"
                    />
                  )}

                  {/* Icon */}
                  <span
                    className={[
                      "shrink-0 transition-colors",
                      isActive ? "text-white" : "text-white/45 group-hover:text-white/70",
                    ].join(" ")}
                  >
                    {item.icon}
                  </span>

                  {/* Label + chevron */}
                  {expanded && (
                    <>
                      <span className="flex-1 truncate text-left text-[13.5px] font-medium">
                        {item.label}
                      </span>
                      {hasChildren && (
                        <ChevronSmall
                          className={`shrink-0 transition-transform duration-200 text-white/30 ${isOpen ? "rotate-90" : ""}`}
                        />
                      )}
                    </>
                  )}

                  {/* Tooltip (collapsed) */}
                  {!expanded && (
                    <span
                      className="pointer-events-none absolute left-[54px] z-50 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                      style={{ backgroundColor: "rgba(10,37,64,0.95)", boxShadow: "var(--shadow-lg)" }}
                    >
                      {item.label}
                    </span>
                  )}
                </button>
              ) : (
                <Link
                  href={item.href}
                  title={expanded ? undefined : item.label}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={[
                    "group relative flex w-full items-center gap-3 px-3 py-[9px] transition-all duration-150",
                    isActive ? "text-white" : "text-white/50 hover:text-white/80",
                  ].join(" ")}
                  style={{
                    backgroundColor: isActive && !expanded
                      ? "var(--color-sidebar-active)"
                      : "transparent",
                  }}
                >
                  {expanded && isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-600" />
                  )}
                  <span className={["shrink-0 transition-colors", isActive ? "text-white" : "text-white/45 group-hover:text-white/70"].join(" ")}>
                    {item.icon}
                  </span>
                  {expanded && (
                    <span className="flex-1 truncate text-left text-[13.5px] font-medium">
                      {item.label}
                    </span>
                  )}
                  {!expanded && (
                    <span
                      className="pointer-events-none absolute left-[54px] z-50 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                      style={{ backgroundColor: "rgba(10,37,64,0.95)", boxShadow: "var(--shadow-lg)" }}
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
              )}

              {/* Sub-items */}
              {expanded && hasChildren && isOpen && visibleChildren.length > 0 && (
                <div className="pb-1">
                  {/* Register context header for Sales section */}
                  {item.section === "sell" && (
                    <div
                      className="mx-3 mb-1.5 mt-0.5 flex items-center justify-between rounded-md px-2.5 py-1.5"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                    >
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                          {registerId ?? "Main Register"}
                        </p>
                        <p className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Main Outlet</p>
                      </div>
                      <button
                        type="button"
                        className="text-[10px] font-semibold transition-colors"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.65)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
                      >
                        Switch
                      </button>
                    </div>
                  )}

                  {visibleChildren.map((child) => {
                    const isCurrent =
                      pathname === child.href ||
                      pathname.startsWith(child.href + "/");
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={[
                          "group flex items-center gap-2 py-[7px] pl-11 pr-3 text-[13px] transition-all duration-100",
                          isCurrent
                            ? "font-semibold text-white"
                            : "font-normal hover:text-white/80",
                        ].join(" ")}
                        style={{ color: isCurrent ? undefined : "rgba(255,255,255,0.45)" }}
                      >
                        {isCurrent ? (
                          <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-brand-600" />
                        ) : (
                          <span className="h-[5px] w-[5px] shrink-0 rounded-full opacity-0 group-hover:opacity-30 bg-white transition-opacity" />
                        )}
                        <span>{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Bottom: collapse toggle ─────────────────────────────────── */}
      <div className="shrink-0 border-t p-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <button
          type="button"
          onClick={onCollapseToggle}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors"
          style={{ color: "rgba(255,255,255,0.3)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.06)";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.3)";
          }}
        >
          <CollapseIcon flipped={expanded} />
          {expanded && (
            <span className="text-[12px] font-medium">Collapse</span>
          )}
        </button>
      </div>
    </nav>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function SellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function OnlineIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ReportingIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

function CatalogIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="7" height="7" rx="1" />
      <rect x="15" y="3" width="7" height="7" rx="1" />
      <rect x="2" y="14" width="7" height="7" rx="1" />
      <rect x="15" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function InventoryIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function CustomersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function FinanceIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function SetupIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronSmall({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CollapseIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg
      width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`transition-transform duration-200 ${flipped ? "" : "rotate-180"}`}
    >
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function SettingsSmIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--color-text-muted)" }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TeamSmIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--color-text-muted)" }}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function LogOutSmIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
