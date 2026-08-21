import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  // Base — enterprise style: clean, precise, no decoration noise
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium text-sm transition-all duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
    'select-none',
  ].join(' '),
  {
    variants: {
      variant: {
        // Primary CTA — brand purple, Stripe-style
        default: [
          'bg-brand-600 text-white border border-brand-700/40',
          'hover:bg-brand-700 active:bg-brand-800 active:scale-[0.99]',
          'focus-visible:ring-brand-400',
          'shadow-xs',
        ].join(' '),

        // Secondary — neutral outlined
        secondary: [
          'text-[#1A1F36] border',
          'hover:bg-[var(--color-surface-subtle)] active:bg-[var(--color-surface-subtle)] active:scale-[0.99]',
          'focus-visible:ring-brand-400',
          'shadow-xs',
          '[background-color:var(--color-surface)]',
          '[border-color:var(--color-border)]',
        ].join(' '),

        // Outline — ghost with border
        outline: [
          'bg-transparent text-[color:var(--color-text-primary)] border',
          'hover:bg-[color:var(--color-surface-subtle)] active:scale-[0.99]',
          'focus-visible:ring-brand-400',
          '[border-color:var(--color-border)]',
        ].join(' '),

        // Ghost — no border, no background
        ghost: [
          'bg-transparent text-[color:var(--color-text-secondary)] border border-transparent',
          'hover:bg-[color:var(--color-surface-subtle)] hover:text-[color:var(--color-text-primary)]',
          'active:scale-[0.99]',
          'focus-visible:ring-brand-400',
        ].join(' '),

        // Destructive — danger red
        destructive: [
          'bg-danger-600 text-white border border-danger-700/40',
          'hover:bg-danger-700 active:bg-danger-700 active:scale-[0.99]',
          'focus-visible:ring-danger-400',
          'shadow-xs',
        ].join(' '),

        // Destructive outline
        'destructive-outline': [
          'bg-transparent border text-danger-600 border-danger-200',
          'hover:bg-danger-50 active:scale-[0.99]',
          'focus-visible:ring-danger-400',
        ].join(' '),

        // Link style
        link: [
          'text-brand-600 underline-offset-4 hover:underline border border-transparent',
          'focus-visible:ring-brand-400',
        ].join(' '),
      },

      size: {
        xs:      'h-7 px-2.5 text-xs rounded-md [&_svg]:size-3',
        sm:      'h-8 px-3 text-[13px] rounded-md [&_svg]:size-3.5',
        default: 'h-9 px-4 text-sm rounded-lg [&_svg]:size-4',
        lg:      'h-10 px-5 text-[15px] rounded-lg [&_svg]:size-4',
        xl:      'h-11 px-6 text-base rounded-lg [&_svg]:size-5',
        icon:    'h-9 w-9 rounded-lg [&_svg]:size-4',
        'icon-sm':'h-8 w-8 rounded-md [&_svg]:size-3.5',
        'icon-xs':'h-7 w-7 rounded-md [&_svg]:size-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
