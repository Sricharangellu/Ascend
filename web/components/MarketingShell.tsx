import Link from "next/link";

const NAV_LINKS = [
  { label: "Pricing", href: "/plans" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Help Center", href: "/help" },
];

const FOOTER_LINKS = [
  { label: "Pricing", href: "/plans" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Help Center", href: "/help" },
];

/**
 * Shared nav + footer for every public/pre-login marketing page (landing,
 * pricing, about, contact) — these previously had no shared layout at all
 * (each page was self-contained), which is how the landing page ended up on
 * a one-off slate/indigo palette instead of the app's real brand/erp design
 * tokens. Reused here so a future 5th marketing page inherits the same look
 * for free instead of starting from scratch again.
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-page-bg)]">
      {/* Owned by the shell, not the root layout — see app/layout.tsx. */}
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="border-b border-[var(--color-table-border)] bg-[var(--color-surface)]">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Asc<span className="text-brand-600">end</span>
          </Link>
          <div className="hidden items-center gap-6 sm:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Start free
            </Link>
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="border-t border-[var(--color-table-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-[var(--color-text-secondary)]">© 2026 Ascend</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
