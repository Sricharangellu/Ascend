/**
 * Input — accessible form input primitive.
 *
 * - Always has an associated <label> (via `label` prop or external htmlFor)
 * - Error/hint text linked via aria-describedby
 * - Focus ring visible to keyboard users
 * - Minimum 44px height touch target
 */

import React, { useId } from "react";
import { clsx } from "clsx";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Visible label — required for accessibility */
  label?: string;
  /** Optional hint text shown below the input */
  hint?: string;
  /** Error message; when set the input is styled as invalid */
  error?: string;
  /** Allow overriding the generated id */
  id?: string;
  /** Render a full-width block input */
  fullWidth?: boolean;
  /** Icon or adornment on the left */
  adornmentLeft?: React.ReactNode;
  /** Icon or adornment on the right */
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
              "text-sm font-medium text-gray-700",
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
              className="pointer-events-none absolute left-3 flex items-center text-gray-400"
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
              // Base
              "block rounded border bg-white text-gray-900",
              "text-base transition-colors duration-150",
              "placeholder:text-gray-400",
              // Minimum touch target height
              "min-h-[44px] py-2 px-3",
              // Adornment padding
              adornmentLeft && "pl-9",
              adornmentRight && "pr-9",
              // Border states
              !error &&
                "border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 focus:ring-offset-0",
              error &&
                "border-danger-500 focus:border-danger-500 focus:ring-2 focus:ring-danger-500",
              // Disabled
              disabled && "opacity-60 cursor-not-allowed bg-gray-50",
              // Width
              fullWidth && "w-full",
              className
            )}
            {...rest}
          />

          {adornmentRight && (
            <div
              className="pointer-events-none absolute right-3 flex items-center text-gray-400"
              aria-hidden="true"
            >
              {adornmentRight}
            </div>
          )}
        </div>

        {hint && !error && (
          <p id={hintId} className="text-sm text-gray-500">
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
