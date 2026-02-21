import type { SelectHTMLAttributes } from "react";

interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

function mergeClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Select({
  label,
  error,
  options,
  id,
  name,
  className,
  ...props
}: SelectProps) {
  const selectId = id ?? name;
  const descriptionId = selectId ? `${selectId}-description` : undefined;

  return (
    <div className="w-full space-y-1.5">
      {label ? (
        <label htmlFor={selectId} className="text-sm font-medium text-secondary-700">
          {label}
        </label>
      ) : null}

      <div className="relative">
        <select
          id={selectId}
          name={name}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? descriptionId : undefined}
          className={mergeClasses(
            "h-11 w-full appearance-none rounded-xl border bg-white/95 px-3.5 pr-10 text-sm text-secondary-900 transition-all duration-200 focus:outline-none focus:ring-2",
            error
              ? "border-danger-300 focus:border-danger-500 focus:ring-danger-200"
              : "border-secondary-200 focus:border-primary-500 focus:ring-primary-200",
            className,
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-secondary-500">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 7.5L10 12.5L15 7.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>

      {error ? (
        <p id={descriptionId} className="text-xs text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
