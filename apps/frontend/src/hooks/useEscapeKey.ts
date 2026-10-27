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
