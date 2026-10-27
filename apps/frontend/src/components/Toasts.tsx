import { Check, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";
export type ToastItem = { id: string; title: string; body?: string; kind: ToastKind };

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  return (
    <div className={`fd-toast fd-toast-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
      <div className="fd-toast-icon" aria-hidden="true">
        {toast.kind === "success" ? <Check size={14} /> : toast.kind === "error" ? <X size={14} /> : <Info size={14} />}
      </div>
      <div className="fd-toast-body">
        <strong>{toast.title}</strong>
        {toast.body && <span>{toast.body}</span>}
      </div>
      <button type="button" className="fd-toast-close" onClick={() => onDismiss(toast.id)} aria-label="Закрыть уведомление">
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  // The live region stays mounted so screen readers announce newly added toasts.
  return (
    <div className="fd-toasts" aria-live="polite">
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}
