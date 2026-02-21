import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "bordered" | "elevated";
  className?: string;
}

const variantStyles: Record<NonNullable<CardProps["variant"]>, string> = {
  default: "border border-white/50 bg-white/70 backdrop-blur-xl shadow-soft",
  bordered: "border border-secondary-200 bg-white shadow-sm",
  elevated:
    "border border-secondary-100 bg-white/95 shadow-floating transition-transform duration-200 hover:-translate-y-0.5",
};

function mergeClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  title,
  description,
  children,
  footer,
  variant = "default",
  className,
  ...props
}: CardProps) {
  return (
    <section
      className={mergeClasses("rounded-2xl p-6", variantStyles[variant], className)}
      {...props}
    >
      {(title || description) && (
        <header className="mb-4 space-y-1">
          {title ? (
            <h3 className="text-lg font-semibold text-secondary-900">{title}</h3>
          ) : null}
          {description ? (
            <p className="text-sm text-secondary-600">{description}</p>
          ) : null}
        </header>
      )}
      <div>{children}</div>
      {footer ? <footer className="mt-6 border-t border-secondary-100 pt-4">{footer}</footer> : null}
    </section>
  );
}
