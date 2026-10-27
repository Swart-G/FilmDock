// Library screen — info cards (no poster images)

function InfoCard({ item, index, onSelect }) {
  const hue = hashHue(item.id + item.title);
  const isMovie = item.type === 'movie';
  return (
    <article
      className="fd-info-card"
      onClick={() => onSelect(item)}
      style={{ animationDelay: `${index * 18}ms`, '--ih': hue }}
    >
      <div className="fd-info-accent" />
      <div className="fd-info-body">
        <div className="fd-info-top">
          <div className="fd-info-icon-wrap">
            <Icon name={isMovie ? 'film' : 'play'} size={14} />
          </div>
          <h4 className="fd-info-title">{item.title}</h4>
          <span className="fd-info-badge">{item.badge}</span>
        </div>
        <div className="fd-info-meta">
          <span className="fd-mono">{item.year}</span>
          <span className="fd-dot-sep" />
          <span>{isMovie ? 'фильм' : 'сериал'}</span>
          {(item.duration || item.episodes) && (
            <>
              <span className="fd-dot-sep" />
              <span>{item.duration || item.episodes}</span>
            </>
          )}
        </div>
        <div className="fd-info-date">{item.added}</div>
      </div>
      <button className="fd-info-arrow" onClick={e => { e.stopPropagation(); onSelect(item); }}>
        <Icon name="chevron" size={14} />
      </button>
    </article>
  );
}

function ListRow({ item, index, onSelect }) {
  const hue = hashHue(item.id + item.title);
  return (
    <button
      className="fd-row"
      onClick={() => onSelect(item)}
      style={{ animationDelay: `${index * 14}ms`, '--ph': hue, '--ph2': (hue + 35) % 360 }}
    >
      <div className="fd-row-thumb" style={{ '--ph': hue, '--ph2': (hue + 35) % 360 }}>
        <span>{item.title.slice(0, 1)}</span>
      </div>
      <div className="fd-row-title">
        <h4>{item.title}</h4>
        <div className="fd-row-meta">
          <span>{item.year}</span>
          <span className="fd-dot-sep" />
          <span className="fd-mono">{item.type === 'series' ? 'сериал' : 'фильм'}</span>
          {item.episodes && (<><span className="fd-dot-sep" /><span>{item.episodes}</span></>)}
          {item.duration && (<><span className="fd-dot-sep" /><span>{item.duration}</span></>)}
        </div>
      </div>
      <span className="fd-row-badge">{item.badge}</span>
      <span className="fd-row-added">{item.added}</span>
      <span className="fd-row-chev"><Icon name="chevron" size={14} /></span>
    </button>
  );
}

function LibraryScreen({ density, pushToast }) {
  const [view, setView] = React.useState('grid');
  const [filter, setFilter] = React.useState('all');
  const [sort, setSort] = React.useState('added');

  const items = React.useMemo(() => {
    let r = window.LIBRARY;
    if (filter === 'movie') r = r.filter(x => x.type === 'movie');
    else if (filter === 'series') r = r.filter(x => x.type === 'series');
    if (sort === 'title') r = [...r].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    else if (sort === 'year') r = [...r].sort((a, b) => b.year - a.year);
    return r;
  }, [filter, sort]);

  const stats = React.useMemo(() => {
    const all = window.LIBRARY;
    return {
      total: all.length,
      movies: all.filter(x => x.type === 'movie').length,
      series: all.filter(x => x.type === 'series').length,
    };
  }, []);

  const handleSelect = (item) => {
    pushToast({
      title: item.title,
      body: `${item.year} · ${item.type === 'series' ? item.episodes : item.duration}`,
      kind: 'info',
    });
  };

  return (
    <div className="fd-screen fd-screen-library">
      <header className="fd-lib-hero">
        <div className="fd-lib-hero-l">
          <div className="fd-eyebrow">
            <span className="fd-eyebrow-dot" />
            Библиотека
          </div>
          <h1 className="fd-h1">
            <span className="fd-mono fd-h1-count">{stats.total}</span> единиц медиа,
            <br />
            <span className="fd-h1-soft">готовых к просмотру</span>
          </h1>
        </div>
        <div className="fd-lib-stats">
          <div className="fd-stat">
            <span className="fd-stat-k">Фильмы</span>
            <span className="fd-stat-v fd-mono">{stats.movies}</span>
          </div>
          <div className="fd-stat-sep" />
          <div className="fd-stat">
            <span className="fd-stat-k">Сериалы</span>
            <span className="fd-stat-v fd-mono">{stats.series}</span>
          </div>
          <div className="fd-stat-sep" />
          <div className="fd-stat">
            <span className="fd-stat-k">Хранилище</span>
            <span className="fd-stat-v fd-mono">847 GB</span>
          </div>
        </div>
      </header>

      <div className="fd-lib-bar">
        <FilterChips items={window.FILTER_CHIPS.type} value={filter} onChange={setFilter} />
        <div className="fd-lib-bar-r">
          <select value={sort} onChange={e => setSort(e.target.value)} className="fd-select fd-select-sm">
            <option value="added">Недавно добавленные</option>
            <option value="title">По алфавиту</option>
            <option value="year">По году</option>
          </select>
          <div className="fd-view-toggle">
            <button className={view === 'grid' ? 'is-on' : ''} onClick={() => setView('grid')} title="Сетка">
              <Icon name="grid" size={16} />
            </button>
            <button className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')} title="Список">
              <Icon name="list" size={16} />
            </button>
          </div>
        </div>
      </div>

      {view === 'grid' ? (
        <div className={`fd-info-grid fd-density-${density}`}>
          {items.map((it, i) => (
            <InfoCard key={it.id} item={it} index={i} onSelect={handleSelect} />
          ))}
        </div>
      ) : (
        <div className="fd-list">
          <div className="fd-list-h">
            <span></span>
            <span>Название</span>
            <span>Качество</span>
            <span>Добавлено</span>
            <span />
          </div>
          {items.map((it, i) => (
            <ListRow key={it.id} item={it} index={i} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { LibraryScreen });
