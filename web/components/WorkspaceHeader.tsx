"use client";

import Link from "next/link";
import { clsx } from "clsx";

/**
 * The context bar for a focused workspace.
 *
 * Collapsing the global nav buys screen space, but it also removes the only
 * thing telling the operator where they are. This bar pays that back: the way
 * out (breadcrumbs), what they are working on (heading), the facts they would
 * otherwise have to remember or go looking for (supplier, PO number, stage),
 * and the actions for the task — all pinned to the top of the workspace so
 * they survive scrolling through a two-hundred-line receipt.
 *
 * It is deliberately not a page header with a big title and whitespace. This
 * is a working tool: one dense row, then the work.
 */

export interface WorkspaceCrumb {
  label: string;
  href?: string;
}

export interface WorkspaceFact {
  label: string;
  value: React.ReactNode;
  /** Renders the value in the numeric style used across tables. */
  numeric?: boolean;
}

export interface WorkspaceHeaderProps {
  breadcrumbs?: WorkspaceCrumb[];
  heading: string;
  /** Secondary line under the heading — usually the supplier or customer. */
  subheading?: React.ReactNode;
  facts?: WorkspaceFact[];
  actions?: React.ReactNode;
  /** Full-width row below the bar — e.g. a LifecycleTrail or a scan field. */
  children?: React.ReactNode;
  className?: string;
}

export function WorkspaceHeader({
  breadcrumbs,
  heading,
  subheading,
  facts,
  actions,
  children,
  className,
}: WorkspaceHeaderProps) {
  return (
    <header
      className={clsx(
        // Sticky so the supplier/PO/stage context never scrolls away mid-task.
        "sticky top-0 z-20 border-b border-[var(--color-border)]",
        "bg-[var(--color-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/85",
        className,
      )}
    >
      <div className="flex flex-col gap-2 px-4 py-3 lg:px-6">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-[12px] text-[var(--color-text-secondary)]">
              {breadcrumbs.map((crumb, i) => {
                const last = i === breadcrumbs.length - 1;
                return (
                  <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                    {crumb.href && !last ? (
                      <Link
                        href={crumb.href}
                        className="rounded px-1 py-0.5 hover:text-[var(--color-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        className={clsx("px-1 py-0.5", last && "text-[var(--color-text-primary)]")}
                        aria-current={last ? "page" : undefined}
                      >
                        {crumb.label}
                      </span>
                    )}
                    {!last && (
                      <span aria-hidden="true" className="text-[var(--color-text-muted)]">
                        /
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold leading-tight text-[var(--color-text-primary)]">
              {heading}
            </h2>
            {subheading && (
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                {subheading}
              </div>
            )}
          </div>

          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>

        {facts && facts.length > 0 && (
          <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            {facts.map((fact) => (
              <div key={fact.label} className="flex items-baseline gap-1.5">
                <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                  {fact.label}
                </dt>
                <dd
                  className={clsx(
                    "text-[13px] font-semibold text-[var(--color-text-primary)]",
                    fact.numeric && "tabular-nums",
                  )}
                >
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {children && (
        <div className="border-t border-[var(--color-border-subtle)] px-4 py-3 lg:px-6">
          {children}
        </div>
      )}
    </header>
  );
}
