"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Built on <dialog> so focus trapping, Esc handling and inertness of the rest
 * of the page come from the platform rather than from hand-rolled listeners.
 * On mobile it docks to the bottom, which is where thumbs are.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Lock background scroll while open — <dialog> alone does not prevent it.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const widths = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-lg",
    lg: "sm:max-w-2xl",
    xl: "sm:max-w-4xl",
  } as const;

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Clicks land on the dialog element itself only when they hit the backdrop.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 w-full max-w-none bg-transparent p-0 backdrop:bg-ink-950/50 backdrop:backdrop-blur-sm",
        "mt-auto max-h-[100dvh] sm:m-auto sm:max-h-[calc(100dvh-4rem)]",
        widths[size],
      )}
    >
      {open && (
        <div
          className={cn(
            "flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface text-start shadow-[var(--shadow-lift)]",
            "rounded-t-[var(--radius-xl)] sm:max-h-[calc(100dvh-4rem)] sm:rounded-[var(--radius-lg)]",
            "animate-[slide-up_0.28s_cubic-bezier(0.22,1,0.36,1)] sm:animate-[scale-in_0.18s_ease-out]",
          )}
        >
          {/* Drag affordance for the mobile sheet presentation. */}
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink-300 sm:hidden" />

          {(title || description) && (
            <div className="flex items-start justify-between gap-4 border-b border-ink-200 p-5">
              <div className="min-w-0">
                {title && <h2 className="text-lg font-bold text-ink-900">{title}</h2>}
                {description && (
                  <p className="mt-1 text-sm text-ink-500">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="بستن"
                className="-me-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
              >
                <X className="size-5" />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

          {footer && (
            <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-ink-200 bg-ink-50 p-4">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

/** Confirmation prompt for destructive actions (delete product, cancel order). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" title={title} description={message}>
      <div className="flex justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="h-11 rounded-[var(--radius-sm)] px-5 text-sm font-semibold text-ink-700 hover:bg-ink-100"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="h-11 rounded-[var(--radius-sm)] bg-danger px-5 text-sm font-semibold text-danger-fg hover:bg-danger-hover disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
