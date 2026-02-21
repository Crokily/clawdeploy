import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

function mergeClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  id,
  name,
  className,
  ...props
}: InputProps) {
  const inputId = id ?? name;
  const descriptionId = inputId ? `${inputId}-description` : undefined;
  const message = error ?? helperText;

  return (
    <div className="w-full space-y-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-secondary-700">
          {label}
        </label>
      ) : null}

      <div className="relative">
        {leftIcon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-secondary-500">
            {leftIcon}
          </span>
        ) : null}

        <input
          id={inputId}
          name={name}
          aria-invalid={Boolean(error)}
          aria-describedby={message ? descriptionId : undefined}
          className={mergeClasses(
            "h-11 w-full rounded-xl border bg-white/95 text-sm text-secondary-900 transition-all duration-200 placeholder:text-secondary-400 focus:outline-none focus:ring-2",
            leftIcon ? "pl-10" : "pl-3.5",
            rightIcon ? "pr-10" : "pr-3.5",
            error
              ? "border-danger-300 focus:border-danger-500 focus:ring-danger-200"
              : "border-secondary-200 focus:border-primary-500 focus:ring-primary-200",
            className,
          )}
          {...props}
        />

        {rightIcon ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-secondary-500">
            {rightIcon}
          </span>
        ) : null}
      </div>

      {message ? (
        <p
          id={descriptionId}
          className={mergeClasses(
            "text-xs",
            error ? "text-danger-600" : "text-secondary-500",
          )}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
