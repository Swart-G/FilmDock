// Sidebar — fixed left, icon-only by default, expands on hover
// Uses Lucide icons via window.lucide

function Icon({ name, size = 20, strokeWidth = 1.6, style }) {
  // Inline SVG paths for the few icons we need — avoids loading the whole lucide lib
  const paths = {
    library: <><rect x="3" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/><path d="M17 4l4 16"/></>,
    search:   <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>,
    user:     <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    logout:   <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></>,
    plus:     <><path d="M12 5v14M5 12h14"/></>,
    magnet:   <><path d="M6 15a6 6 0 0 0 12 0V4h-4v11a2 2 0 0 1-4 0V4H6Z"/><path d="M6 8h4M14 8h4"/></>,
    filter:   <><path d="M3 6h18M6 12h12M10 18h4"/></>,
    sun:      <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></>,
    moon:     <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    grid:     <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    list:     <><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    check:    <><path d="m5 12 5 5L20 7"/></>,
    x:        <><path d="m6 6 12 12M18 6 6 18"/></>,
    chevron:  <><path d="m9 6 6 6-6 6"/></>,
    seed:     <><path d="m12 19-7-7 7-7"/><path d="m19 19-7-7 7-7"/></>, // double-chevron-up logic via rotation
    play:     <><path d="m6 4 14 8-14 8Z"/></>,
    film:     <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 7h18M3 12h18M3 17h18M8 3v18M16 3v18"/></>,
    bell:     <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    sparkle:  <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></>,
    folder:   <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" style={style}>
      {paths[name] || null}
    </svg>
  );
}

function Sidebar({ route, onNavigate, accent }) {
  const [expanded, setExpanded] = React.useState(false);
  const isMobile = () => window.innerWidth <= 640;
  const items = [
    { id: 'library',  label: 'Библиотека', icon: 'library' },
    { id: 'search',   label: 'Поиск',       icon: 'search' },
    { id: 'settings', label: 'Настройки',   icon: 'settings' },
    { id: 'profile',  label: 'Профиль',     icon: 'user' },
  ];
  return (
    <aside
      className={`fd-sidebar ${expanded ? 'is-expanded' : ''}`}
      onMouseEnter={() => { if (!isMobile()) setExpanded(true); }}
      onMouseLeave={() => { if (!isMobile()) setExpanded(false); }}
    >
      <div className="fd-sb-brand">
        <div className="fd-sb-mark">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 4h12l4 4v12H4z" strokeLinejoin="round"/>
            <path d="M16 4v4h4" strokeLinejoin="round"/>
            <circle cx="12" cy="14" r="3"/>
          </svg>
        </div>
        <div className="fd-sb-name">
          <span>FilmDock</span>
          <em>media library</em>
        </div>
      </div>

      <nav className="fd-sb-nav">
        {items.map((it) => {
          const active = it.id === route;
          return (
            <button
              key={it.id}
              className={`fd-sb-item ${active ? 'is-active' : ''}`}
              onClick={() => onNavigate(it.id)}
              title={it.label}
            >
              <span className="fd-sb-glow" />
              <span className="fd-sb-icon"><Icon name={it.icon} size={20} /></span>
              <span className="fd-sb-label">{it.label}</span>
              {active && <span className="fd-sb-dot" />}
            </button>
          );
        })}
      </nav>

      <div className="fd-sb-foot">
        <button className="fd-sb-item fd-sb-avatar" title="alex@filmdock">
          <span className="fd-sb-icon">
            <span className="fd-sb-avatar-circle">А</span>
          </span>
          <span className="fd-sb-label fd-sb-label-stack">
            <span>Алекс</span>
            <em>alex@filmdock</em>
          </span>
        </button>
        <button className="fd-sb-item fd-sb-logout" title="Выйти">
          <span className="fd-sb-icon"><Icon name="logout" size={18} /></span>
          <span className="fd-sb-label">Выйти</span>
        </button>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar, Icon });
