import { useEffect } from "react";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-50 flex items-end sm:items-center
        justify-center bg-ink/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="modal-enter w-full max-w-phone bg-surface-card rounded-t-3xl sm:rounded-3xl
          border border-surface-border flex flex-col max-h-[92vh]"
        style={{ boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hidden sm:block" />
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <span className="w-9 h-1 rounded-full bg-surface-border" aria-hidden="true" />
        </div>
        <div className="px-5 pt-3 pb-2 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          <button
            type="button"
            className="btn-icon -mr-2"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto">{children}</div>
        {footer && (
          <div
            className="px-5 py-3 border-t border-surface-border bg-surface-card
              flex gap-2 justify-end rounded-b-3xl"
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
