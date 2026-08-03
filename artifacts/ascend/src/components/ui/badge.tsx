import * as React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'whitespace-nowrap inline-flex items-center gap-1 rounded-md font-semibold transition-colors select-none',
  {
    variants: {
      variant: {
        // Neutral default
        default:     'bg-[var(--color-primary-subtle)] text-brand-700 border border-[var(--color-primary-border)] text-[11px] px-2 py-0.5',
        secondary:   'bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] border border-[var(--color-border)] text-[11px] px-2 py-0.5',
        outline:     'text-[var(--color-text-primary)] border border-[var(--color-border)] text-[11px] px-2 py-0.5',
        // Status semantic
        success:     'bg-[var(--color-success-bg)] text-[var(--color-success-text)] border border-[var(--color-success-border)] text-[11px] px-2 py-0.5',
        warning:     'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] border border-[var(--color-warning-border)] text-[11px] px-2 py-0.5',
        destructive: 'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] border border-[var(--color-danger-border)] text-[11px] px-2 py-0.5',
        info:        'bg-[var(--color-info-bg)] text-[var(--color-info-text)] border border-[var(--color-info-border)] text-[11px] px-2 py-0.5',
        // Solid variants (for higher-contrast needs)
        'solid-success': 'bg-success-500 text-white text-[11px] px-2 py-0.5',
        'solid-warning': 'bg-warning-500 text-white text-[11px] px-2 py-0.5',
        'solid-danger':  'bg-danger-500 text-white text-[11px] px-2 py-0.5',
        'solid-brand':   'bg-brand-600 text-white text-[11px] px-2 py-0.5',
      },
      size: {
        sm:      'text-[10px] px-1.5 py-px',
        default: 'text-[11px] px-2 py-0.5',
        md:      'text-xs px-2.5 py-0.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
