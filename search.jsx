// Search screen (Новая загрузка)

function SeedersBar({ seeders, leechers }) {
  // Color: green > 100, amber 10-100, red < 10
  const tone = seeders > 500 ? 'high' : seeders > 50 ? 'mid' : 'low';
  return (
    <div className={`fd-sl fd-sl-${tone}`}>
      <span className="fd-sl-up">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M5 8V2M2 5l3-3 3 3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {seeders.toLocaleString('ru-RU')}
      </span>
      <span className="fd-sl-sep" />
      <span className="fd-sl-dn">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M5 2v6M2 5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {leechers}
      </span>
    </div>
  );
}

function ResultCard({ item, onAdd, index }) {
  const [adding, setAdding] = React.useState(false);
  const [added, setAdded] = React.useState(false);
  const click = () => {
    if (adding || added) return;
    setAdding(true);
    setTimeout(() => {
      setAdding(false); setAdded(true);
      onAdd(item);
    }, 700);
  };
  const isHDR = /HDR|DV/.test(item.resolution);
  const is4k = /4K|2160/.test(item.resolution);
  return (
    <article
      className="fd-card"
      style={{ animationDelay: `${index * 28}ms` }}
    >
      <div className="fd-card-bg" aria-hidden="true"
        style={{ '--h': hashHue(item.id + item.title) }}
      />
      <header className="fd-card-h">
        <div className="fd-card-title">
          <h3>{item.title}</h3>
          <div className="fd-card-sub">
            <span>{item.year}</span>
            <span className="fd-dot-sep" />
            <span className="fd-mono">{item.tracker}</span>
            {item.new && <span className="fd-tag fd-tag-new">новое</span>}
            {item.warning && <span className="fd-tag fd-tag-warn">CAM</span>}
          </div>
        </div>
      </header>

      <div className="fd-card-badges">
        <span className={`fd-badge ${is4k ? 'fd-badge-4k' : ''}`}>{item.resolution}</span>
        {isHDR && !is4k && <span className="fd-badge fd-badge-hdr">HDR</span>}
        <span className="fd-badge fd-badge-rel">{item.release}</span>
      </div>

      <div className="fd-card-meta">
        <div className="fd-meta-row">
          <span className="fd-meta-k">Размер</span>
          <span className="fd-meta-v fd-mono">{item.size}</span>
        </div>
        <div className="fd-meta-row">
          <span className="fd-meta-k">Аудио</span>
          <span className="fd-meta-v">{item.audio}</span>
        </div>
        <div className="fd-meta-row">
          <span className="fd-meta-k">Сидеры</span>
          <SeedersBar seeders={item.seeders} leechers={item.leechers} />
        </div>
      </div>

      <button
        className={`fd-add ${adding ? 'is-loading' : ''} ${added ? 'is-done' : ''}`}
        onClick={click}
        disabled={added}
      >
        {added ? (
          <>
            <Icon name="check" size={16} />
            Добавлено
          </>
        ) : adding ? (
          <>
            <span className="fd-spinner" />
            Добавляем…
          </>
        ) : (
          <>
            <Icon name="download" size={16} />
            Добавить
          </>
        )}
      </button>
    </article>
  );
}

function MagnetModal({ open, onClose, onSubmit }) {
  const [val, setVal] = React.useState('');
  React.useEffect(() => {
    if (!open) setVal('');
  }, [open]);
  if (!open) return null;
  const valid = val.startsWith('magnet:?xt=');
  return (
    <div className="fd-modal-veil" onClick={onClose}>
      <div className="fd-modal" onClick={(e) => e.stopPropagation()}>
        <header className="fd-modal-h">
          <div>
            <h3>Magnet-ссылка</h3>
            <p>Вставьте magnet: URI прямо из вашего трекера</p>
          </div>
          <button className="fd-icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="x" size={16} />
          </button>
        </header>
        <textarea
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="magnet:?xt=urn:btih:…"
          rows={5}
          className="fd-modal-input"
        />
        <footer className="fd-modal-f">
          <div className="fd-modal-hint">
            {val && !valid && <span className="fd-warn">Ссылка должна начинаться с magnet:?xt=</span>}
            {valid && <span className="fd-ok">Готово к добавлению</span>}
          </div>
          <div className="fd-modal-actions">
            <button className="fd-btn-ghost" onClick={onClose}>Отмена</button>
            <button
              className="fd-btn-primary"
              disabled={!valid}
              onClick={() => { onSubmit(val); onClose(); }}
            >
              <Icon name="magnet" size={16} />
              Добавить
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FilterChips({ items, value, onChange }) {
  return (
    <div className="fd-chips">
      {items.map((it) => (
        <button
          key={it.id}
          className={`fd-chip ${value === it.id ? 'is-on' : ''}`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function SearchScreen({ pushToast }) {
  const [query, setQuery] = React.useState('Дюна 2');
  const [type, setType] = React.useState('all');
  const [quality, setQuality] = React.useState('any');
  const [release, setRelease] = React.useState('any');
  const [sort, setSort] = React.useState('seeders');
  const [magnetOpen, setMagnetOpen] = React.useState(false);
  const [results, setResults] = React.useState(window.SEARCH_RESULTS);

  // Filter logic
  const filtered = React.useMemo(() => {
    let r = results;
    if (quality === '4k') r = r.filter((x) => /4K|2160/.test(x.resolution));
    else if (quality === 'hdr') r = r.filter((x) => /HDR|DV/.test(x.resolution));
    else if (quality === '1080p') r = r.filter((x) => /1080/.test(x.resolution));
    else if (quality === '720p') r = r.filter((x) => /720/.test(x.resolution));
    if (release === 'remux') r = r.filter((x) => x.release === 'REMUX');
    else if (release === 'webdl') r = r.filter((x) => /WEB-DL/.test(x.release));
    else if (release === 'bdrip') r = r.filter((x) => /BDRip/.test(x.release));
    if (sort === 'seeders') r = [...r].sort((a, b) => b.seeders - a.seeders);
    else if (sort === 'size') r = [...r].sort((a, b) => parseFloat(b.size) - parseFloat(a.size));
    return r;
  }, [results, type, quality, release, sort]);

  const handleAdd = (item) => {
    pushToast({
      title: 'Загрузка добавлена',
      body: `${item.title} · ${item.resolution} · ${item.size}`,
      kind: 'success',
    });
  };

  const handleMagnet = (uri) => {
    pushToast({
      title: 'Magnet добавлен',
      body: uri.slice(0, 64) + '…',
      kind: 'success',
    });
  };

  return (
    <div className="fd-screen fd-screen-search">
      <header className="fd-search-hero">
        <div className="fd-eyebrow">
          <span className="fd-eyebrow-dot" />
          Новая загрузка
        </div>
        <h1 className="fd-h1">
          Найдите что-то новое<br/>
          <span className="fd-h1-soft">для своей библиотеки</span>
        </h1>

        <div className="fd-search-bar">
          <Icon name="search" size={20} style={{ opacity: 0.55 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название фильма, сериала или релиз-группы"
          />
          <div className="fd-search-kbd">⌘K</div>
          <button className="fd-search-go">Искать</button>
        </div>

        <div className="fd-filters">
          <div className="fd-filter-group">
            <label>Тип</label>
            <FilterChips items={window.FILTER_CHIPS.type} value={type} onChange={setType} />
          </div>
          <div className="fd-filter-group">
            <label>Качество</label>
            <FilterChips items={window.FILTER_CHIPS.quality} value={quality} onChange={setQuality} />
          </div>
          <div className="fd-filter-group">
            <label>Релиз</label>
            <FilterChips items={window.FILTER_CHIPS.release} value={release} onChange={setRelease} />
          </div>
          <div className="fd-filter-spacer" />
          <div className="fd-filter-group fd-filter-sort">
            <label>Сортировка</label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="fd-select">
              <option value="seeders">По сидерам</option>
              <option value="size">По размеру</option>
              <option value="date">По дате</option>
            </select>
          </div>
        </div>
      </header>

      <section className="fd-results">
        <div className="fd-results-h">
          <h2>
            Найдено <strong>{filtered.length}</strong> <span>раздач для «{query}»</span>
          </h2>
          <div className="fd-results-sub">
            <span className="fd-pulse" /> Опрошено 4 трекера · 1.2s
          </div>
        </div>

        <div className="fd-results-grid">
          {filtered.map((it, i) => (
            <ResultCard key={it.id} item={it} index={i} onAdd={handleAdd} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="fd-empty">
            <div className="fd-empty-icon"><Icon name="search" size={28} /></div>
            <h3>Ничего не нашлось</h3>
            <p>Попробуйте другие фильтры или вставьте magnet-ссылку напрямую</p>
          </div>
        )}
      </section>

      <button className="fd-fab" onClick={() => setMagnetOpen(true)} title="Magnet-ссылка">
        <Icon name="magnet" size={20} />
        <span>Magnet</span>
      </button>

      <MagnetModal open={magnetOpen} onClose={() => setMagnetOpen(false)} onSubmit={handleMagnet} />
    </div>
  );
}

Object.assign(window, { SearchScreen });
