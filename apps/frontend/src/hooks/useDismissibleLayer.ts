import { useEffect, useRef } from "react";


export function useDismissibleLayer<T extends HTMLElement>(
  open: boolean,
  onDismiss: () => void
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const node = ref.current;
      if (!node || node.contains(event.target as Node)) return;
      onDismiss();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onDismiss]);

  return ref;
}

