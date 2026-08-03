import * as React from 'react';
import { cn } from '@/lib/utils';

// Enterprise card — clean white surfaces, Stripe-style shadow + border

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'raised' | 'flat' | 'ghost' }
>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-xl text-[var(--color-text-primary)] transition-shadow duration-200',
      variant === 'default' && [
        'bg-[var(--color-surface)] border border-[var(--color-border)]',
        'shadow-[var(--shadow-sm)]',
      ].join(' '),
      variant === 'raised' && [
        'bg-[var(--color-surface)] border border-[var(--color-border)]',
        'shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)]',
      ].join(' '),
      variant === 'flat' && [
        'bg-[var(--color-surface)] border border-[var(--color-border)]',
        'shadow-none',
      ].join(' '),
      variant === 'ghost' && [
        'bg-[var(--color-surface-subtle)] border border-transparent',
      ].join(' '),
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-start justify-between gap-4 px-5 pt-5 pb-4',
      'border-b border-[var(--color-border)]',
      className,
    )}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'text-[15px] font-semibold leading-tight text-[var(--color-text-primary)]',
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'text-[13px] text-[var(--color-text-secondary)] mt-0.5',
      className,
    )}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-5 py-4', className)}
    {...props}
  />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-center justify-between gap-3 px-5 py-3',
      'border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)]',
      'rounded-b-xl',
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

// Convenience: card with no internal padding separation (flat sections)
const CardSection = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-5 py-4 border-b border-[var(--color-border)] last:border-0', className)}
    {...props}
  />
));
CardSection.displayName = 'CardSection';

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  CardSection,
};
