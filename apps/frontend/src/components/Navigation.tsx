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
            <Icon size={20} />
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
  return (
    <aside className="fd-sidebar">
      <div className="fd-sb-brand">
        <span className="fd-sb-mark"><Film size={16} /></span>
        <span>FilmDock</span>
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
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <div className="fd-sb-foot">
        <span className="fd-sb-user" title={username}>{username}</span>
        <button type="button" className="fd-icon-btn" title="Выйти" aria-label="Выйти" onClick={onLogout}>
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
