import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { useDismissibleLayer } from "../../../hooks/useDismissibleLayer";

type Option = {
  value: string;
  label: string;
};

type FilterDropdownProps = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
};

export function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useDismissibleLayer<HTMLDivElement>(open, () => setOpen(false));
  const currentLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "все";
  const isDefault = value === options[0]?.value;

  return (
    <div className="home-filter home-filter-dropdown" ref={ref}>
      <button
        type="button"
        className={`home-filter-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen((state) => !state)}
      >
        <span className="home-filter-trigger__label">{label}</span>
        <span className={`home-filter-trigger__value ${isDefault ? "is-default" : ""}`}>{currentLabel}</span>
        <ChevronDown className="home-filter-trigger__icon" />
      </button>
      {open ? (
        <div className="home-filter-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`home-filter-menu__item ${option.value === value ? "is-active" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
