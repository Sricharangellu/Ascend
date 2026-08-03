import React, { useId } from "react";
import { clsx } from "clsx";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  label?: string;
  hint?: string;
  error?: string;
  id?: string;
  fullWidth?: boolean;
  adornmentLeft?: React.ReactNode;
  adornmentRight?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      label,
      hint,
      error,
      id: idProp,
      fullWidth = true,
      adornmentLeft,
      adornmentRight,
      className,
      disabled,
      required,
      ...rest
    },
    ref
  ) {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;

    const describedBy = [
      hint ? hintId : null,
      error ? errorId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

    return (
      <div className={clsx("flex flex-col gap-1", fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={id}
            className={clsx(
              "text-sm font-medium text-[var(--color-text-primary)]",
              disabled && "opacity-60"
            )}
          >
            {label}
            {required && (
              <span className="ml-1 text-danger-600" aria-hidden="true">
                *
              </span>
            )}
            {required && <span className="sr-only">(required)</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {adornmentLeft && (
            <div
              className="pointer-events-none absolute left-3 flex items-center text-[var(--color-text-secondary)]"
              aria-hidden="true"
            >
              {adornmentLeft}
            </div>
          )}

          <input
            ref={ref}
            id={id}
            disabled={disabled}
            required={required}
            aria-required={required}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className={clsx(
              "block rounded border bg-white text-[var(--color-text-primary)]",
              "text-base transition-colors duration-150",
              "placeholder:text-[var(--color-text-secondary)]",
              "min-h-[44px] py-2 px-3",
              adornmentLeft && "pl-9",
              adornmentRight && "pr-9",
              !error &&
                "border-[var(--color-table-border)] focus:border-brand-500 focus:ring-2 focus:ring-brand-500 focus:ring-offset-0",
              error &&
                "border-danger-500 focus:border-danger-500 focus:ring-2 focus:ring-danger-500",
              disabled && "opacity-60 cursor-not-allowed bg-[var(--color-page-bg)]",
              fullWidth && "w-full",
              className
            )}
            {...rest}
          />

          {adornmentRight && (
            <div
              className="pointer-events-none absolute right-3 flex items-center text-[var(--color-text-secondary)]"
              aria-hidden="true"
            >
              {adornmentRight}
            </div>
          )}
        </div>

        {hint && !error && (
          <p id={hintId} className="text-sm text-[var(--color-text-secondary)]">
            {hint}
          </p>
        )}

        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-sm text-danger-600"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
