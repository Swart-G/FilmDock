import { useEffect, useRef } from "react";


/** Calls `onEscape` when Escape is pressed while `active` is true. */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  const callbackRef = useRef(onEscape);
  callbackRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") callbackRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);
}

export function useDismissibleLayer<T extends HTMLElement>(
  open: boolean,
  onDismiss: () => void
) {
  const ref = useRef<T | null>(null);
  // Keep the latest callback without re-subscribing listeners on every render.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEscapeKey(open, onDismiss);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const node = ref.current;
      if (!node || node.contains(event.target as Node)) return;
      dismissRef.current();
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return ref;
}
