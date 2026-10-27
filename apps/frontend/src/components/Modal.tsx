import { useEffect, useRef } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { X } from "lucide-react";

import { useEscapeKey } from "../hooks/useEscapeKey";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  children?: ReactNode;
  footer: ReactNode;
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Dialog shell: Escape / backdrop close, focus trap, focus restore. */
export function Modal({ open, title, description, onClose, onSubmit, children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLFormElement | null>(null);
  useEscapeKey(open, onClose);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>("[autofocus], " + FOCUSABLE)?.focus();
    }
    return () => previous?.focus?.();
  }, [open]);

  if (!open) return null;

  const trapFocus = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <div className="fd-modal-veil" onClick={onClose}>
      <form
        ref={dialogRef}
        className="fd-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        onKeyDown={trapFocus}
        onSubmit={event => { event.preventDefault(); onSubmit?.(event); }}
      >
        <header className="fd-modal-h">
          <div>
            <h3>{title}</h3>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="fd-icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={16} />
          </button>
        </header>
        {children}
        <footer className="fd-modal-f">{footer}</footer>
      </form>
    </div>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, description, confirmLabel, danger, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      onSubmit={onConfirm}
      footer={
        <div className="fd-modal-actions">
          <button type="button" className="fd-btn-ghost" onClick={onCancel} autoFocus>Отмена</button>
          <button type="submit" className={danger ? "fd-btn-danger" : "fd-btn-primary"}>{confirmLabel}</button>
        </div>
      }
    />
  );
}
