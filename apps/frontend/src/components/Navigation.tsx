import { useState } from "react";
import type { FocusEvent } from "react";
import { Film, Library, LogOut, Search, Settings } from "lucide-react";

export type NavId = "library" | "search" | "settings";

const NAV_ITEMS: Array<{ id: NavId; label: string; Icon: typeof Library }> = [
  { id: "library",  label: "Библиотека", Icon: Library },
  { id: "search",   label: "Поиск",      Icon: Search },
  { id: "settings", label: "Настройки",  Icon: Settings },
];

export function MobileNav({ activeNav, onNavigate }: { activeNav: NavId; onNavigate: (id: NavId) => void }) {
  return (
    <nav className="fd-mobile-nav" aria-label="Навигация">
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const active = id === activeNav;
        return (
          <button
            key={id}
            type="button"
            className={`fd-mobile-nav-item ${active ? "is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(id)}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

type SidebarProps = {
  activeNav: NavId;
  onNavigate: (id: NavId) => void;
  username: string;
  onLogout: () => void;
};

export function Sidebar({ activeNav, onNavigate, username, onLogout }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const avatarLetter = username[0]?.toUpperCase() ?? "?";
  // Expand for keyboard users too, not just on hover.
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false);
  };
  return (
    <aside
      className={`fd-sidebar ${expanded ? "is-expanded" : ""}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={handleBlur}
    >
      <div className="fd-sb-brand">
        <div className="fd-sb-mark">
          <Film size={20} />
        </div>
        <div className="fd-sb-name">
          <span>FilmDock</span>
          <em>media library</em>
        </div>
      </div>
      <nav className="fd-sb-nav" aria-label="Навигация">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = id === activeNav;
          return (
            <button
              key={id}
              type="button"
              className={`fd-sb-item ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(id)}
              title={label}
            >
              <span className="fd-sb-icon"><Icon size={20} /></span>
              <span className="fd-sb-label">{label}</span>
              {active && <span className="fd-sb-dot" />}
            </button>
          );
        })}
      </nav>
      <div className="fd-sb-foot">
        <button type="button" className="fd-sb-item fd-sb-avatar" title={username} onClick={() => onNavigate("settings")}>
          <span className="fd-sb-icon">
            <span className="fd-sb-avatar-circle">{avatarLetter}</span>
          </span>
          <span className="fd-sb-label fd-sb-label-stack">
            <span>{username}</span>
            <em>FilmDock</em>
          </span>
        </button>
        <button type="button" className="fd-sb-item" title="Выйти" onClick={onLogout}>
          <span className="fd-sb-icon"><LogOut size={18} /></span>
          <span className="fd-sb-label">Выйти</span>
        </button>
      </div>
    </aside>
  );
}
