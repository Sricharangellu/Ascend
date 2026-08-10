"use client";

/**
 * PageShell — the one page frame.
 *
 * WHY THIS EXISTS
 * `<main>` in EnterpriseShell has no max-width and no padding container, so
 * every page invented its own. The audit found SIX different answers in use
 * (max-w-7xl ×25, 6xl ×33, 5xl ×28, 4xl ×14, 2xl ×16, [1400px] ×2), which is
 * why adjacent modules visibly misalign as you navigate between them, and why
 * tables stretch their columns apart on a 1920px monitor.
 * (WORK/audits/AUDIT_2026-08-10T174500Z-ui-ux-platform-audit.md §4)
 *
 * Pages stop deciding their own width. They declare intent instead:
 *   - "default"   → 1600px max, centred, gutters grow on ultrawide
 *   - "narrow"    → 72ch, for reading/forms
 *   - "full"      → edge to edge, for the two views that want every pixel
 *                   (Terminal, wide report tables)
 *
 * It also answers the directive's three questions on every screen:
 *   Where am I?          → breadcrumbs + title
 *   What matters most?   → description + summary slot
 *   What do I do next?   → primaryAction, visually singular
 */

import React from "react";
import Link from "next/link";
import { clsx } from "clsx";

export type PageWidth = "default" | "narrow" | "full";

export interface Crumb {
  label: string;
  href?: string;
}

export interface PageShellProps {
  title: string;
  /** One line. What this page is for, or the most important fact about it. */
  description?: string;
  breadcrumbs?: Crumb[];
  /** The single most important action. Rendered last, visually dominant. */
  primaryAction?: React.ReactNode;
  /** Everything else — never competes with primaryAction. */
  secondaryActions?: React.ReactNode;
  /** KPI row, filter bar, or tabs — sits directly under the header. */
  summary?: React.ReactNode;
  width?: PageWidth;
  /** Sticks the header to the top while the content scrolls. */
  stickyHeader?: boolean;
  children: React.ReactNode;
  className?: string;
}

const widthClass: Record<PageWidth, string> = {
  default: "mx-auto w-full max-w-page",
  narrow: "mx-auto w-full max-w-prose",
  full: "w-full",
};

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-content-secondary">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="focus-ring rounded-control hover:text-content-primary hover:underline"
                >
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={clsx(last && "text-content-primary")}>
                  {c.label}
                </span>
              )}
              {!last && (
                <span aria-hidden="true" className="text-content-muted">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageShell({
  title,
  description,
  breadcrumbs,
  primaryAction,
  secondaryActions,
  summary,
  width = "default",
  stickyHeader = false,
  children,
  className,
}: PageShellProps) {
  return (
    <div className={clsx("min-h-full bg-canvas", className)}>
      <header
        className={clsx(
          "border-b border-line bg-surface-1",
          stickyHeader && "sticky top-0 z-10"
        )}
      >
        <div className={clsx(widthClass[width], "px-6 py-4")}>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="mb-2">
              <Breadcrumbs items={breadcrumbs} />
            </div>
          )}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-content-primary">{title}</h1>
              {description && (
                <p className="mt-1 max-w-prose text-sm text-content-secondary">{description}</p>
              )}
            </div>
            {(primaryAction || secondaryActions) && (
              <div className="flex shrink-0 items-center gap-2">
                {secondaryActions}
                {primaryAction}
              </div>
            )}
          </div>
          {summary && <div className="mt-4">{summary}</div>}
        </div>
      </header>

      <div className={clsx(widthClass[width], "px-6 py-6")}>{children}</div>
    </div>
  );
}

/**
 * Sticky bar for pending changes in create/edit flows. Keeps Save reachable
 * without scrolling to the bottom of a long form.
 */
export function PageActionBar({
  children,
  message,
}: {
  children: React.ReactNode;
  message?: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-6 mt-6 border-t border-line bg-surface-1 px-6 py-3 shadow-popover">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-content-secondary">{message}</p>
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
