import type { ReactNode } from "react";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

function DefaultEmptyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-8 w-8 text-primary-600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 7.5C4 6.12 5.12 5 6.5 5H17.5C18.88 5 20 6.12 20 7.5V16.5C20 17.88 18.88 19 17.5 19H6.5C5.12 19 4 17.88 4 16.5V7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 10H16M8 14H12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-secondary-300 bg-white/70 p-8 text-center backdrop-blur-sm">
      <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50">
        {icon ?? <DefaultEmptyIcon />}
      </div>
      <h3 className="text-lg font-semibold text-secondary-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-secondary-600">{description}</p>
      {action ? (
        <div className="mt-6">
          <Button onClick={action.onClick}>{action.label}</Button>
        </div>
      ) : null}
    </div>
  );
}
