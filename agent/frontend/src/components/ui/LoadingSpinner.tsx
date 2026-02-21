import type { ReactNode } from "react";

export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles: Record<NonNullable<LoadingSpinnerProps["size"]>, string> = {
  sm: "h-3.5 w-3.5 border-[1.5px]",
  md: "h-5 w-5 border-2",
  lg: "h-7 w-7 border-[3px]",
};

function mergeClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function LoadingSpinner({
  size = "md",
  className,
}: LoadingSpinnerProps): ReactNode {
  return (
    <span className={mergeClasses("inline-flex items-center", className)} role="status">
      <span
        aria-hidden="true"
        className={mergeClasses(
          "inline-block animate-spin rounded-full border-current border-r-transparent",
          sizeStyles[size],
        )}
      />
      <span className="sr-only">Loading</span>
    </span>
  );
}
