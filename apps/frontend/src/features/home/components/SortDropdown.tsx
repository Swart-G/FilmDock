import { ArrowDownWideNarrow, ChevronDown } from "lucide-react";
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
  { value: "seeders", label: "По сидам" },
  { value: "leechers", label: "По пирам" },
  { value: "quality", label: "По качеству" },
  { value: "date", label: "По дате" },
  { value: "size", label: "По размеру" },
];

export function SortDropdown({ sortBy, sortOrder, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useDismissibleLayer<HTMLDivElement>(open, () => setOpen(false));
  const current = OPTIONS.find((option) => option.value === sortBy)?.label ?? "По релевантности";

  return (
    <div className="home-filter home-sort" ref={ref}>
      <button type="button" className={`home-sort-trigger ${open ? "is-open" : ""}`} onClick={() => setOpen((value) => !value)}>
        <ArrowDownWideNarrow className="home-sort-trigger__icon" />
        <span>{current}</span>
        <ChevronDown className="home-sort-trigger__chevron" />
      </button>
      {open ? (
        <div className="home-sort-menu">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`home-sort-menu__item ${sortBy === option.value ? "is-active" : ""}`}
              onClick={() => {
                onChange(option.value, option.value === "relevance" ? "desc" : sortOrder);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            className="home-sort-menu__item home-sort-menu__item--order"
            onClick={() => {
              onChange(sortBy, sortOrder === "desc" ? "asc" : "desc");
              setOpen(false);
            }}
          >
            {sortOrder === "desc" ? "Порядок: по убыванию" : "Порядок: по возрастанию"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
