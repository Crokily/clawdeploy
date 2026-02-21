import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoadingSpinner } from "./LoadingSpinner";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const baseStyles =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-gradient-to-r from-primary-500 via-primary-600 to-accent-500 text-white shadow-soft hover:-translate-y-0.5 hover:shadow-floating",
  secondary:
    "border border-secondary-300 bg-white/90 text-secondary-800 shadow-sm hover:bg-secondary-50 hover:border-secondary-400",
  danger:
    "bg-gradient-to-r from-danger-500 to-danger-600 text-white shadow-soft hover:-translate-y-0.5 hover:shadow-floating",
  ghost:
    "bg-transparent text-secondary-700 hover:bg-secondary-100 hover:text-secondary-900",
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

function mergeClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      className={mergeClasses(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={isDisabled}
      {...props}
    >
      {isLoading ? (
        <LoadingSpinner size={size === "lg" ? "md" : "sm"} />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
}
