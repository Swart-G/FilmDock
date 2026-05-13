import { ArrowUpDown, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

import { useDismissibleLayer } from "../../../hooks/useDismissibleLayer";
import type { TorrentSortBy, TorrentSortOrder } from "../types";

type SortDropdownProps = {
  sortBy: TorrentSortBy;
  sortOrder: TorrentSortOrder;
  onChange: (sortBy: TorrentSortBy, sortOrder: TorrentSortOrder) => void;
};

const OPTIONS: Array<{ value: TorrentSortBy; label: string }> = [
  { value: "relevance", label: "По релевантности" },
  { value: "seeders",   label: "По сидам" },
  { value: "leechers",  label: "По пирам" },
  { value: "quality",   label: "По качеству" },
  { value: "date",      label: "По дате" },
  { value: "size",      label: "По размеру" },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export function SortDropdown({ sortBy, sortOrder, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const ref = useDismissibleLayer<HTMLDivElement>(open && !isMobile, () => setOpen(false));
  const current = OPTIONS.find((o) => o.value === sortBy)?.label ?? "По релевантности";

  const handleSelect = (value: TorrentSortBy) => {
    onChange(value, value === "relevance" ? "desc" : sortOrder);
    setOpen(false);
  };

  const handleToggleOrder = () => {
    onChange(sortBy, sortOrder === "desc" ? "asc" : "desc");
    setOpen(false);
  };

  const triggerButton = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="fd-sort-trigger"
    >
      <ArrowUpDown size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
      <span>{current}</span>
      {sortBy !== "relevance" && (
        <span className="fd-sort-order-badge">
          {sortOrder === "desc" ? "↓" : "↑"}
        </span>
      )}
      {open && isMobile
        ? <ChevronDown size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
        : <ChevronDown size={13} style={{ color: "var(--muted)", flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
      }
    </button>
  );

  /* ── Desktop dropdown ── */
  if (!isMobile) {
    return (
      <div style={{ position: "relative", display: "inline-block" }} ref={ref}>
        {triggerButton}
        {open && (
          <div className="fd-sort-dropdown">
            {OPTIONS.map((option) => {
              const isActive = sortBy === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`fd-sort-option ${isActive ? "is-active" : ""}`}
                >
                  {option.label}
                  {isActive && <Check size={13} />}
                </button>
              );
            })}

            {sortBy !== "relevance" && (
              <>
                <div className="fd-sort-divider" />
                <button
                  type="button"
                  onClick={handleToggleOrder}
                  className="fd-sort-order-btn"
                >
                  {sortOrder === "desc" ? "↓ По убыванию" : "↑ По возрастанию"}
                  <span className="fd-sort-order-hint">переключить</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── Mobile bottom sheet ── */
  return (
    <>
      {triggerButton}

      {open && (
        <div className="fd-sheet-veil" onClick={() => setOpen(false)}>
          <div className="fd-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="fd-sheet-handle" />
            <div className="fd-sheet-header">
              <span className="fd-sheet-title">Сортировка</span>
            </div>
            <div className="fd-sheet-body">
              {OPTIONS.map((option) => {
                const isActive = sortBy === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={`fd-sheet-option ${isActive ? "is-active" : ""}`}
                  >
                    <span>{option.label}</span>
                    {isActive && <Check size={16} strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>

            {sortBy !== "relevance" && (
              <div className="fd-sheet-footer">
                <button
                  type="button"
                  onClick={handleToggleOrder}
                  className="fd-sheet-order-btn"
                >
                  {sortOrder === "desc"
                    ? <><ChevronDown size={15} />По убыванию</>
                    : <><ChevronUp size={15} />По возрастанию</>
                  }
                  <span className="fd-sheet-order-hint">нажмите чтобы сменить</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
