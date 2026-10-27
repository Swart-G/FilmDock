import { Magnet, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Modal } from "../../components/Modal";
import { providerLabel } from "../../lib/format";

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
  onSearch: () => void; onAddByMagnet: () => Promise<boolean>;
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

// ─── Magnet Modal ─────────────────────────────────────────────────────────

function MagnetModal({ open, onClose, magnetInput, onMagnetInputChange, onSubmit }: {
  open: boolean; onClose: () => void;
  magnetInput: string; onMagnetInputChange: (v: string) => void;
  onSubmit: () => Promise<boolean>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const valid = magnetInput.trim().toLowerCase().startsWith("magnet:?");
  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      // Keep the dialog open on failure so the link is not lost.
      if (await onSubmit()) onClose();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal
      open={open}
      title="Magnet-ссылка"
      description="Вставьте magnet: URI прямо из вашего трекера"
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <div className="fd-modal-hint" aria-live="polite">
            {magnetInput && !valid && <span className="fd-warn-text">Ссылка должна начинаться с magnet:?</span>}
            {valid && <span className="fd-ok-text">Готово к добавлению</span>}
          </div>
          <div className="fd-modal-actions">
            <button type="button" className="fd-btn-ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="fd-btn-primary" disabled={!valid || submitting}>
              {submitting ? <span className="fd-spinner" /> : <Magnet size={16} />}
              Добавить
            </button>
          </div>
        </>
      }
    >
      <textarea
        autoFocus
        value={magnetInput}
        onChange={e => onMagnetInputChange(e.target.value)}
        placeholder="magnet:?xt=urn:btih:…"
        aria-label="Magnet-ссылка"
        rows={5}
        className="fd-modal-input"
        spellCheck={false}
      />
    </Modal>
  );
}

// ─── FilterChips ──────────────────────────────────────────────────────────

function FilterChips<T extends string>({ label, items, value, onChange }: { label: string; items: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="fd-filter-group" role="group" aria-label={label}>
      <span className="fd-filter-label" aria-hidden="true">{label}</span>
      <div className="fd-chips">
        {items.map(it => (
          <button key={it.value} type="button" aria-pressed={value === it.value} className={`fd-chip ${value === it.value ? "is-on" : ""}`} onClick={() => onChange(it.value)}>
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const RESOLUTION_CHIP_ITEMS = [
  { value: "", label: "Любое" },
  { value: "2160p", label: "4K" },
  { value: "1080p", label: "1080p" },
  { value: "720p",  label: "720p" },
  { value: "480p",  label: "480p" },
];

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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  // Ctrl/⌘+K focuses the search field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

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
            <Search size={20} className="fd-search-icon" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              aria-label="Поиск торрентов"
              enterKeyHint="search"
              value={queryInput}
              onChange={e => onQueryInputChange(e.target.value)}
              placeholder="Название фильма, сериала или релиз-группы"
            />
            <kbd className="fd-search-kbd" aria-hidden="true">{isMac ? "⌘K" : "Ctrl K"}</kbd>
            <button type="submit" className="fd-search-go" disabled={loading}>
              {loading ? <span className="fd-spinner" /> : null}
              Искать
            </button>
          </div>
        </form>

        <div className="fd-filters">
          <FilterChips label="Качество" items={RESOLUTION_CHIP_ITEMS} value={resolution} onChange={onResolutionChange} />
          {dubOptions.length > 1 && (
            <FilterChips label="Озвучка" items={dubOptions} value={dub} onChange={onDubChange} />
          )}
          {subtitleOptions.length > 1 && (
            <FilterChips label="Субтитры" items={subtitleOptions} value={subtitles} onChange={onSubtitlesChange} />
          )}
          <div className="fd-filter-spacer" />
          <div className="fd-filter-group">
            <span className="fd-filter-label">Сортировка</span>
            <SortDropdown sortBy={sortBy} sortOrder={sortOrder} onChange={onSortChange} />
          </div>
        </div>
      </header>

      <section className="fd-results">
        {query && (
        <div className="fd-results-h">
          <h2>
            Найдено <strong>{sorted.length}</strong>
            <span> для «{query}»</span>
          </h2>
          {results.length > 0 && (
            <div className="fd-results-sub">
              <span className="fd-pulse" aria-hidden="true" />
              {results.length} раздач ·{" "}
              {Object.entries(providerCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([p, count]) => `${providerLabel(p)}: ${count}`)
                .join(" · ")}
            </div>
          )}
        </div>
        )}

        {loading && (
          <div className="fd-empty">
            <div className="fd-empty-icon">
              <span className="fd-spinner fd-spinner--lg" />
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

      <button type="button" className="fd-fab" onClick={() => setMagnetOpen(true)} title="Добавить по magnet-ссылке">
        <Magnet size={20} />
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
