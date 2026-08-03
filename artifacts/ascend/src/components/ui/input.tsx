import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Enterprise input — clean, precise, Stripe-inspired
          'flex h-9 w-full rounded-lg border bg-white px-3 py-1',
          'text-[14px] text-[var(--color-text-primary)]',
          'placeholder:text-[var(--color-text-muted)]',
          'transition-all duration-150',
          // Border — subtle default, brand on focus
          'border-[var(--color-border)]',
          'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
          // Disabled
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--color-surface-subtle)]',
          // File input
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--color-text-primary)]',
          // Dark mode
          'dark:bg-[var(--color-surface)] dark:border-[var(--color-border)]',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
