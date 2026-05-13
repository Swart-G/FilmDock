import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import { SortDropdown } from "./components/SortDropdown";
import { TorrentResultCard } from "./components/TorrentResultCard";
import type { TorrentAddState, TorrentResult, TorrentSortBy, TorrentSortOrder } from "./types";

type HomePageProps = {
  queryInput: string; magnetInput: string; query: string;
  resolution: string; dub: string; subtitles: string;
  sortBy: TorrentSortBy; sortOrder: TorrentSortOrder;
  results: TorrentResult[]; loading: boolean; error: string | null;
  addState: TorrentAddState;
  onQueryInputChange: (value: string) => void;
  onMagnetInputChange: (value: string) => void;
  onSearch: () => void; onAddByMagnet: () => void;
  onResolutionChange: (value: string) => void;
  onDubChange: (value: string) => void;
  onSubtitlesChange: (value: string) => void;
  onSortChange: (sortBy: TorrentSortBy, sortOrder: TorrentSortOrder) => void;
  onAdd: (item: TorrentResult) => void;
};

const QUALITY_RANKS: Record<string, number> = { "2160p": 5, "1440p": 4, "1080p": 3, "720p": 2, "480p": 1 };

function parseSizeToBytes(size: string): number | null {
  const match = size.match(/(\d+(?:[.,]\d+)?)\s*(TB|GB|MB|KB|B)/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const unit = match[2].toUpperCase();
  const factor: Record<string, number> = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024 };
  return Math.round(value * (factor[unit] ?? 1));
}

function languageTokens(values: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    value.split(",").map(token => token.trim().toUpperCase()).filter(Boolean).forEach(token => set.add(token));
  }
  return Array.from(set).sort((l, r) => l.localeCompare(r, "ru-RU"));
}

const PROVIDER_LABELS: Record<string, string> = {
  "apibay.org": "TPB",
  "rutracker.org": "RuTracker",
  "rutracker.ru": "RuTracker.RU",
  "rutor.info": "RuTor",
  "rutor.is": "RuTor",
  "kinozal.me": "Kinozal",
  "kinozal.tv": "Kinozal",
  "nnmclub.to": "NNM-Club",
  "nyaa.si": "Nyaa",
  "yts.lt": "YTS",
  "animetosho": "AnimeTosho",
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider.toLowerCase()] ?? provider;
}

// ─── Magnet Modal ─────────────────────────────────────────────────────────

function MagnetModal({ open, onClose, magnetInput, onMagnetInputChange, onSubmit }: {
  open: boolean; onClose: () => void;
  magnetInput: string; onMagnetInputChange: (v: string) => void;
  onSubmit: () => void;
}) {
  if (!open) return null;
  const valid = magnetInput.toLowerCase().startsWith("magnet:?");
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit();
    onClose();
  };
  return (
    <div className="fd-modal-veil" onClick={onClose}>
      <form className="fd-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="fd-modal-h">
          <div>
            <h3>Magnet-ссылка</h3>
            <p>Вставьте magnet: URI прямо из вашего трекера</p>
          </div>
          <button type="button" className="fd-icon-btn" onClick={onClose} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <textarea
          autoFocus
          value={magnetInput}
          onChange={e => onMagnetInputChange(e.target.value)}
          placeholder="magnet:?xt=urn:btih:…"
          rows={5}
          className="fd-modal-input"
        />
        <footer className="fd-modal-f">
          <div className="fd-modal-hint">
            {magnetInput && !valid && <span className="fd-warn-text">Ссылка должна начинаться с magnet:?</span>}
            {valid && <span className="fd-ok-text">Готово к добавлению</span>}
          </div>
          <div className="fd-modal-actions">
            <button type="button" className="fd-btn-ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="fd-btn-primary" disabled={!valid}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 15a6 6 0 0 0 12 0V4h-4v11a2 2 0 0 1-4 0V4H6Z" />
                <path d="M6 8h4M14 8h4" />
              </svg>
              Добавить
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

// ─── FilterChips ──────────────────────────────────────────────────────────

function FilterChips<T extends string>({ items, value, onChange }: { items: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="fd-chips">
      {items.map(it => (
        <button key={it.value} type="button" className={`fd-chip ${value === it.value ? "is-on" : ""}`} onClick={() => onChange(it.value)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ─── HomePage ─────────────────────────────────────────────────────────────

export function HomePage(props: HomePageProps) {
  const {
    queryInput, magnetInput, query, resolution, dub, subtitles,
    sortBy, sortOrder, results, loading, error, addState,
    onQueryInputChange, onMagnetInputChange, onSearch, onAddByMagnet,
    onResolutionChange, onDubChange, onSubtitlesChange,
    onSortChange, onAdd,
  } = props;

  const [magnetOpen, setMagnetOpen] = useState(false);

  const resolutionOptions = useMemo(() => {
    const defaults = ["2160p", "1080p", "720p", "480p"];
    const detected = new Set<string>(defaults);
    for (const item of results) { if (item.resolution) detected.add(item.resolution); }
    return [{ value: "", label: "Любое" }, ...Array.from(detected).map(value => ({ value, label: value }))];
  }, [results]);

  const dubOptions = useMemo(() => {
    const detected = languageTokens(results.map(item => item.dub));
    return [{ value: "", label: "Любая" }, ...detected.map(value => ({ value, label: value }))];
  }, [results]);

  const subtitleOptions = useMemo(() => {
    const detected = languageTokens(results.map(item => item.subtitles));
    return [{ value: "", label: "Любые" }, ...detected.map(value => ({ value, label: value }))];
  }, [results]);

  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of results) {
      counts[item.provider] = (counts[item.provider] ?? 0) + 1;
    }
    return counts;
  }, [results]);

  const sorted = useMemo(() => {
    const items = results.filter(item => {
      if (resolution && item.resolution?.toLowerCase() !== resolution.toLowerCase()) return false;
      if (dub && !item.dub?.toLowerCase().includes(dub.toLowerCase())) return false;
      if (subtitles && !item.subtitles?.toLowerCase().includes(subtitles.toLowerCase())) return false;
      return true;
    });
    const direction = sortOrder === "desc" ? -1 : 1;
    items.sort((l, r) => {
      if (sortBy === "seeders") return (l.seeders - r.seeders) * direction;
      if (sortBy === "leechers") return (l.leechers - r.leechers) * direction;
      if (sortBy === "date") return (new Date(l.published_at).getTime() - new Date(r.published_at).getTime()) * direction;
      if (sortBy === "size") {
        const ls = l.size_bytes ?? parseSizeToBytes(l.size) ?? 0;
        const rs = r.size_bytes ?? parseSizeToBytes(r.size) ?? 0;
        return (ls - rs) * direction;
      }
      if (sortBy === "quality") {
        const lr = QUALITY_RANKS[l.resolution?.toLowerCase() ?? ""] ?? 0;
        const rr = QUALITY_RANKS[r.resolution?.toLowerCase() ?? ""] ?? 0;
        return (lr - rr) * direction;
      }
      const ls = l.seeders * 3 - l.leechers;
      const rs = r.seeders * 3 - r.leechers;
      return (ls - rs) * direction;
    });
    return items;
  }, [results, resolution, dub, subtitles, sortBy, sortOrder]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  };

  const RESOLUTION_CHIP_ITEMS = [
    { value: "", label: "Любое" },
    { value: "2160p", label: "4K" },
    { value: "1080p", label: "1080p" },
    { value: "720p",  label: "720p" },
    { value: "480p",  label: "480p" },
  ];

  return (
    <div className="fd-screen fd-screen-search">
      <header className="fd-search-hero">
        <div className="fd-eyebrow">
          <span className="fd-eyebrow-dot" />
          Новая загрузка
        </div>
        <h1 className="fd-h1">
          Найдите что-то новое<br />
          <span className="fd-h1-soft">для своей медиатеки</span>
        </h1>

        <form onSubmit={submitSearch}>
          <div className="fd-search-bar">
            <Search size={20} style={{ opacity: 0.55, flexShrink: 0 }} />
            <input
              value={queryInput}
              onChange={e => onQueryInputChange(e.target.value)}
              placeholder="Название фильма, сериала или релиз-группы"
            />
            <div className="fd-search-kbd">⌘K</div>
            <button type="submit" className="fd-search-go">Искать</button>
          </div>
        </form>

        <div className="fd-filters">
          <div className="fd-filter-group">
            <label>Качество</label>
            <FilterChips items={RESOLUTION_CHIP_ITEMS} value={resolution} onChange={onResolutionChange} />
          </div>
          {dubOptions.length > 1 && (
            <div className="fd-filter-group">
              <label>Озвучка</label>
              <div className="fd-chips">
                {dubOptions.slice(0, 6).map(it => (
                  <button key={it.value} type="button" className={`fd-chip ${dub === it.value ? "is-on" : ""}`} onClick={() => onDubChange(it.value)}>
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {subtitleOptions.length > 1 && (
            <div className="fd-filter-group">
              <label>Субтитры</label>
              <div className="fd-chips">
                {subtitleOptions.slice(0, 5).map(it => (
                  <button key={it.value} type="button" className={`fd-chip ${subtitles === it.value ? "is-on" : ""}`} onClick={() => onSubtitlesChange(it.value)}>
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="fd-filter-spacer" />
          <div className="fd-filter-group">
            <label>Сортировка</label>
            <SortDropdown sortBy={sortBy} sortOrder={sortOrder} onChange={onSortChange} />
          </div>
        </div>
      </header>

      <section className="fd-results">
        <div className="fd-results-h">
          <h2>
            Найдено <strong>{sorted.length}</strong>
            {query && <span> для «{query}»</span>}
          </h2>
          {results.length > 0 && (
            <div className="fd-results-sub">
              <span className="fd-pulse" />
              {results.length} раздач ·{" "}
              {Object.entries(providerCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([p, count]) => `${providerLabel(p)}: ${count}`)
                .join(" · ")}
            </div>
          )}
        </div>

        {loading && (
          <div className="fd-empty">
            <div className="fd-empty-icon">
              <span className="fd-spinner" style={{ width: 24, height: 24 } as CSSProperties} />
            </div>
            <h3>Ищем раздачи…</h3>
            <p>Опрашиваем трекеры</p>
          </div>
        )}
        {!loading && error && (
          <div className="fd-empty">
            <div className="fd-empty-icon"><Search size={28} /></div>
            <h3>Ошибка поиска</h3>
            <p>{error}</p>
          </div>
        )}
        {!loading && !error && sorted.length === 0 && (
          <div className="fd-empty">
            <div className="fd-empty-icon"><Search size={28} /></div>
            <h3>{query ? "Ничего не нашлось" : "Введите запрос"}</h3>
            <p>{query ? "Попробуйте другие фильтры или вставьте magnet-ссылку" : "Введите минимум 2 символа и нажмите «Искать»"}</p>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="fd-results-grid">
            {sorted.map((item, i) => (
              <TorrentResultCard
                key={item.info_hash}
                item={item}
                index={i}
                addState={addState[item.info_hash] ?? "idle"}
                onAdd={onAdd}
              />
            ))}
          </div>
        )}
      </section>

      <button type="button" className="fd-fab" onClick={() => setMagnetOpen(true)} title="Добавить Magnet">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 15a6 6 0 0 0 12 0V4h-4v11a2 2 0 0 1-4 0V4H6Z" />
          <path d="M6 8h4M14 8h4" />
        </svg>
        <span>Magnet</span>
      </button>

      <MagnetModal
        open={magnetOpen}
        onClose={() => setMagnetOpen(false)}
        magnetInput={magnetInput}
        onMagnetInputChange={onMagnetInputChange}
        onSubmit={onAddByMagnet}
      />
    </div>
  );
}
