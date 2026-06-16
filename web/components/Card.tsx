/**
 * Card — layout container primitive.
 *
 * Provides a surface, rounded corners, shadow, and optional header/footer slots.
 */

import React from "react";
import { clsx } from "clsx";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional heading rendered in the card header */
  title?: string;
  /** Optional description below the title */
  description?: string;
  /** Content for the footer area */
  footer?: React.ReactNode;
  /** Remove the default padding from the body */
  noPadding?: boolean;
}

export function Card({
  title,
  description,
  footer,
  noPadding = false,
  children,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-md border border-slate-200 bg-white shadow-sm",
        className
      )}
      {...props}
    >
      {(title || description) && (
        <div className="border-b border-slate-200 px-5 py-4">
          {title && (
            <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          )}
          {description && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
        </div>
      )}

      <div className={clsx(!noPadding && "px-5 py-4")}>{children}</div>

      {footer && (
        <div className="rounded-b-md border-t border-slate-200 bg-slate-50 px-5 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── CardSection ─────────────────────────────────────────────────────────────
// A semantic section divider within a card body

export function CardSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx("border-t border-slate-200 px-5 py-4 first:border-0", className)}
    >
      {children}
    </section>
  );
}
