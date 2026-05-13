import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { useState } from "react";

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

export function SortDropdown({ sortBy, sortOrder, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useDismissibleLayer<HTMLDivElement>(open, () => setOpen(false));
  const current = OPTIONS.find((o) => o.value === sortBy)?.label ?? "По релевантности";
  const orderLabel = sortOrder === "desc" ? "↓" : "↑";

  return (
    <div style={{ position: "relative", display: "inline-block" }} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          height: "34px",
          padding: "0 12px 0 10px",
          border: `1px solid ${open ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "999px",
          background: open ? "color-mix(in oklab, var(--accent) 10%, var(--surface))" : "var(--surface)",
          color: "var(--text)",
          font: "inherit",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "border-color 0.15s, background 0.15s",
          outline: "none",
        }}
      >
        <ArrowUpDown size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
        <span>{current}</span>
        {sortBy !== "relevance" && (
          <span style={{ color: "var(--accent)", fontSize: "11px", fontWeight: 600 }}>{orderLabel}</span>
        )}
        <ChevronDown
          size={13}
          style={{
            color: "var(--muted)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: "200px",
            padding: "4px",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            background: "var(--bg2, var(--surface))",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)",
            zIndex: 200,
          }}
        >
          {OPTIONS.map((option) => {
            const isActive = sortBy === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value, option.value === "relevance" ? "desc" : sortOrder);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "none",
                  background: isActive ? "color-mix(in oklab, var(--accent) 15%, transparent)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--text)",
                  font: "inherit",
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--surface)"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                {option.label}
                {isActive && <Check size={13} />}
              </button>
            );
          })}

          {sortBy !== "relevance" && (
            <>
              <div style={{ height: "1px", background: "var(--border)", margin: "4px 6px" }} />
              <button
                type="button"
                onClick={() => {
                  onChange(sortBy, sortOrder === "desc" ? "asc" : "desc");
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "none",
                  background: "transparent",
                  color: "var(--muted)",
                  font: "inherit",
                  fontSize: "12px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                {sortOrder === "desc" ? "↓ По убыванию" : "↑ По возрастанию"}
                <span style={{ marginLeft: "auto", fontSize: "11px", opacity: 0.6 }}>переключить</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
