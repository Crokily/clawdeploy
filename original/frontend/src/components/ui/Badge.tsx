import type { ReactNode } from "react";

export interface BadgeProps {
  children: ReactNode;
  variant?: "success" | "warning" | "danger" | "info" | "default";
  size?: "sm" | "md";
  className?: string;
}

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  success: "bg-success-100 text-success-800 border-success-200",
  warning: "bg-warning-100 text-warning-800 border-warning-200",
  danger: "bg-danger-100 text-danger-800 border-danger-200",
  info: "bg-primary-100 text-primary-800 border-primary-200",
  default: "bg-secondary-100 text-secondary-700 border-secondary-200",
};

const sizeStyles: Record<NonNullable<BadgeProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
};

function mergeClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Badge({
  children,
  variant = "default",
  size = "md",
  className,
}: BadgeProps) {
  return (
    <span
      className={mergeClasses(
        "inline-flex items-center rounded-full border font-medium",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
