import React from "react";
import { clsx } from "clsx";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  footer?: React.ReactNode;
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
        "rounded-md border border-[#F0F0F0] bg-white",
        className
      )}
      {...props}
    >
      {(title || description) && (
        <div className="border-b border-[#F0F0F0] px-5 py-4">
          {title && (
            <h3 className="text-sm font-semibold text-[rgba(0,0,0,0.88)]">{title}</h3>
          )}
          {description && (
            <p className="mt-1 text-[13px] text-[rgba(0,0,0,0.45)]">{description}</p>
          )}
        </div>
      )}

      <div className={clsx(!noPadding && "px-5 py-4")}>{children}</div>

      {footer && (
        <div className="rounded-b-md border-t border-[#F0F0F0] bg-[#FAFAFA] px-5 py-3">
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
        "border-t border-[#F0F0F0] px-5 py-4 first:border-0",
        className
      )}
    >
      {children}
    </section>
  );
}
