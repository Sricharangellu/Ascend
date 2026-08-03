import React from "react";
import { clsx } from "clsx";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  noPadding?: boolean;
  action?: React.ReactNode;
}

export function Card({
  title,
  description,
  footer,
  noPadding = false,
  children,
  className,
  action,
  ...props
}: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border",
        "bg-[var(--color-surface)] border-[var(--color-border)]",
        "shadow-[var(--shadow-sm)]",
        className
      )}
      {...props}
    >
      {(title || description) && (
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)] leading-snug">{title}</h3>
            )}
            {description && (
              <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">{description}</p>
            )}
          </div>
          {action && (
            <div className="shrink-0">{action}</div>
          )}
        </div>
      )}

      <div className={clsx(!noPadding && "px-5 py-4")}>{children}</div>

      {footer && (
        <div className="rounded-b-xl border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-5 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}

export function CardSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "border-t border-[var(--color-border)] px-5 py-4 first:border-0",
        className
      )}
    >
      {children}
    </section>
  );
}
