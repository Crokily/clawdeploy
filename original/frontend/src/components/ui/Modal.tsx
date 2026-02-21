"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof window === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-modal-fade bg-secondary-900/45 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-xl animate-modal-pop rounded-2xl border border-white/60 bg-white/95 p-6 shadow-floating"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-semibold text-secondary-900">
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-secondary-200 px-2.5 py-1.5 text-xs font-medium text-secondary-600 transition-colors hover:bg-secondary-100 hover:text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
            aria-label="Close modal"
          >
            X
          </button>
        </div>

        <div className="text-sm text-secondary-700">{children}</div>

        {footer ? (
          <div className="mt-6 border-t border-secondary-100 pt-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
