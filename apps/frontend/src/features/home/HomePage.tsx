import { ArrowDown, ArrowUp, Magnet, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Modal } from "../../components/Modal";
import { plural, providerLabel } from "../../lib/format";

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

// ─── Filters ──────────────────────────────────────────────────────────────

type Option = { value: string; label: string };

function SelectField({ label, value, options, onChange, disabled }: { label: string; value: string; options: Option[]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="fd-field">
      <span>{label}</span>
      <select className="fd-select" value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const RESOLUTION_OPTIONS: Option[] = [
  { value: "", label: "Любое" },
  { value: "2160p", label: "4K" },
  { value: "1080p", label: "1080p" },
  { value: "720p",  label: "720p" },
  { value: "480p",  label: "480p" },
];

const SORT_OPTIONS: Array<{ value: TorrentSortBy; label: string }> = [
  { value: "relevance", label: "По релевантности" },
  { value: "seeders",   label: "По сидам" },
  { value: "leechers",  label: "По пирам" },
  { value: "quality",   label: "По качеству" },
  { value: "date",      label: "По дате" },
  { value: "size",      label: "По размеру" },
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

  const dubOptions = useMemo<Option[]>(() => [
    { value: "", label: "Любая" },
    ...languageTokens(results.map(item => item.dub)).map(value => ({ value, label: value })),
  ], [results]);

  const subtitleOptions = useMemo<Option[]>(() => [
    { value: "", label: "Любые" },
    ...languageTokens(results.map(item => item.subtitles)).map(value => ({ value, label: value })),
  ], [results]);

  const providerSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of results) counts[item.provider] = (counts[item.provider] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([p, count]) => `${providerLabel(p)} ${count}`).join(" · ");
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

  const orderLabel = sortOrder === "desc" ? "По убыванию" : "По возрастанию";

  return (
    <div className="fd-page">
      <header className="fd-page-h"><h1>Поиск</h1></header>

      <form className="fd-search" onSubmit={submitSearch} role="search">
        <div className="fd-search-field">
          <Search size={18} aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            aria-label="Поиск раздач"
            enterKeyHint="search"
            value={queryInput}
            onChange={e => onQueryInputChange(e.target.value)}
            placeholder="Фильм или сериал"
          />
        </div>
        <button type="submit" className="fd-btn-primary" disabled={loading}>
          {loading && <span className="fd-spinner" />}
          Искать
        </button>
        <button type="button" className="fd-btn-ghost fd-search-magnet" onClick={() => setMagnetOpen(true)} aria-label="Добавить по magnet-ссылке" title="Добавить по magnet-ссылке">
          <Magnet size={16} />
          <span>Magnet</span>
        </button>
      </form>

      <div className="fd-filters">
        <SelectField label="Качество" value={resolution} options={RESOLUTION_OPTIONS} onChange={onResolutionChange} />
        <SelectField label="Озвучка" value={dub} options={dubOptions} onChange={onDubChange} disabled={dubOptions.length < 2} />
        <SelectField label="Субтитры" value={subtitles} options={subtitleOptions} onChange={onSubtitlesChange} disabled={subtitleOptions.length < 2} />
        <div className="fd-field">
          <span>Сортировка</span>
          <div className="fd-field-row">
            <select className="fd-select" aria-label="Сортировка" value={sortBy}
              onChange={e => { const v = e.target.value as TorrentSortBy; onSortChange(v, v === "relevance" ? "desc" : sortOrder); }}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button type="button" className="fd-icon-btn" disabled={sortBy === "relevance"}
              onClick={() => onSortChange(sortBy, sortOrder === "desc" ? "asc" : "desc")}
              title={orderLabel} aria-label={`Порядок: ${orderLabel}`}>
              {sortOrder === "desc" ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
            </button>
          </div>
        </div>
      </div>

      <section className="fd-results" aria-live="polite" aria-busy={loading}>
        {loading && <p className="fd-state"><span className="fd-spinner" />Ищем раздачи…</p>}

        {!loading && error && (
          <div className="fd-state fd-state--block">
            <strong>Не удалось выполнить поиск</strong>
            <span>{error}</span>
            <button type="button" className="fd-btn-ghost" onClick={onSearch}>Повторить</button>
          </div>
        )}

        {!loading && !error && !query && (
          <div className="fd-state fd-state--block">
            <strong>Введите запрос</strong>
            <span>Минимум 2 символа. Результаты собираются из нескольких трекеров.</span>
          </div>
        )}

        {!loading && !error && query && sorted.length === 0 && (
          <div className="fd-state fd-state--block">
            <strong>Ничего не нашлось</strong>
            <span>{results.length > 0 ? "Попробуйте сбросить фильтры." : "Попробуйте другой запрос или вставьте magnet-ссылку."}</span>
          </div>
        )}

        {!loading && !error && sorted.length > 0 && (
          <>
            <div className="fd-section-h">
              <h2>
                {sorted.length} {plural(sorted.length, ["раздача", "раздачи", "раздач"])}
                <span className="fd-muted"> по запросу «{query}»</span>
              </h2>
              <span className="fd-page-note">{providerSummary}</span>
            </div>
            <ul className="fd-results-list">
              <li className="fd-results-head" aria-hidden="true">
                <span>Раздача</span><span className="fd-result-stats"><span>Размер</span><span>Сиды / пиры</span></span><span />
              </li>
              {sorted.map(item => (
                <TorrentResultCard key={item.info_hash} item={item} addState={addState[item.info_hash] ?? "idle"} onAdd={onAdd} />
              ))}
            </ul>
          </>
        )}
      </section>

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
