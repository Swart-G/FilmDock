import { Link2, Search } from "lucide-react";
import { useMemo } from "react";

import { FilterDropdown } from "./components/FilterDropdown";
import { SortDropdown } from "./components/SortDropdown";
import { TorrentResultCard } from "./components/TorrentResultCard";
import type { TorrentAddState, TorrentResult, TorrentSortBy, TorrentSortOrder } from "./types";
import "./styles.css";

type HomePageProps = {
  queryInput: string;
  magnetInput: string;
  query: string;
  resolution: string;
  dub: string;
  subtitles: string;
  sortBy: TorrentSortBy;
  sortOrder: TorrentSortOrder;
  targetMediaType: "auto" | "movie" | "series";
  results: TorrentResult[];
  loading: boolean;
  error: string | null;
  addState: TorrentAddState;
  onQueryInputChange: (value: string) => void;
  onMagnetInputChange: (value: string) => void;
  onSearch: () => void;
  onAddByMagnet: () => void;
  onResolutionChange: (value: string) => void;
  onDubChange: (value: string) => void;
  onSubtitlesChange: (value: string) => void;
  onSortChange: (sortBy: TorrentSortBy, sortOrder: TorrentSortOrder) => void;
  onTargetMediaTypeChange: (value: "auto" | "movie" | "series") => void;
  onAdd: (item: TorrentResult) => void;
};

type Option = { value: string; label: string };

const MEDIA_TYPE_OPTIONS: Option[] = [
  { value: "auto", label: "авто" },
  { value: "movie", label: "фильм" },
  { value: "series", label: "сериал" },
];

const QUALITY_RANKS: Record<string, number> = {
  "2160p": 5,
  "1440p": 4,
  "1080p": 3,
  "720p": 2,
  "480p": 1,
};

function parseSizeToBytes(size: string): number | null {
  const match = size.match(/(\d+(?:[.,]\d+)?)\s*(TB|GB|MB|KB|B)/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const unit = match[2].toUpperCase();
  const factor: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };
  return Math.round(value * (factor[unit] ?? 1));
}

function languageTokens(values: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    value
      .split(",")
      .map((token) => token.trim().toUpperCase())
      .filter(Boolean)
      .forEach((token) => set.add(token));
  }
  return Array.from(set).sort((left, right) => left.localeCompare(right, "ru-RU"));
}

function optionLabel(options: Option[], value: string, fallback = "все") {
  const label = options.find((option) => option.value === value)?.label;
  return label ?? (value || fallback);
}

export function HomePage(props: HomePageProps) {
  const {
    queryInput,
    magnetInput,
    query,
    resolution,
    dub,
    subtitles,
    sortBy,
    sortOrder,
    targetMediaType,
    results,
    loading,
    error,
    addState,
    onQueryInputChange,
    onMagnetInputChange,
    onSearch,
    onAddByMagnet,
    onResolutionChange,
    onDubChange,
    onSubtitlesChange,
    onSortChange,
    onTargetMediaTypeChange,
    onAdd,
  } = props;

  const resolutionOptions = useMemo(() => {
    const defaults = ["2160p", "1080p", "720p", "480p"];
    const detected = new Set<string>(defaults);
    for (const item of results) {
      if (item.resolution) detected.add(item.resolution);
    }
    return [{ value: "", label: "все" }, ...Array.from(detected).map((value) => ({ value, label: value }))];
  }, [results]);

  const dubOptions = useMemo(() => {
    const detected = languageTokens(results.map((item) => item.dub));
    return [{ value: "", label: "все" }, ...detected.map((value) => ({ value, label: value }))];
  }, [results]);

  const subtitlesOptions = useMemo(() => {
    const detected = languageTokens(results.map((item) => item.subtitles));
    return [{ value: "", label: "все" }, ...detected.map((value) => ({ value, label: value }))];
  }, [results]);

  const activeFilters = useMemo(() => {
    const items: Array<{ key: string; label: string; value: string }> = [];
    if (targetMediaType !== "auto") {
      items.push({ key: "targetMediaType", label: "Тип", value: optionLabel(MEDIA_TYPE_OPTIONS, targetMediaType) });
    }
    if (resolution) {
      items.push({ key: "resolution", label: "Разрешение", value: optionLabel(resolutionOptions, resolution) });
    }
    if (dub) {
      items.push({ key: "dub", label: "Озвучка", value: optionLabel(dubOptions, dub) });
    }
    if (subtitles) {
      items.push({ key: "subtitles", label: "Субтитры", value: optionLabel(subtitlesOptions, subtitles) });
    }
    return items;
  }, [
    targetMediaType,
    resolution,
    resolutionOptions,
    dub,
    dubOptions,
    subtitles,
    subtitlesOptions,
  ]);

  const sorted = useMemo(() => {
    const items = results.filter((item) => {
      if (resolution && item.resolution?.toLowerCase() !== resolution.toLowerCase()) return false;
      if (dub && !item.dub?.toLowerCase().includes(dub.toLowerCase())) return false;
      if (subtitles && !item.subtitles?.toLowerCase().includes(subtitles.toLowerCase())) return false;
      return true;
    });

    const direction = sortOrder === "desc" ? -1 : 1;
    items.sort((left, right) => {
      if (sortBy === "seeders") return (left.seeders - right.seeders) * direction;
      if (sortBy === "leechers") return (left.leechers - right.leechers) * direction;
      if (sortBy === "date") {
        return (
          (new Date(left.published_at).getTime() - new Date(right.published_at).getTime()) *
          direction
        );
      }
      if (sortBy === "size") {
        const leftSize = left.size_bytes ?? parseSizeToBytes(left.size) ?? 0;
        const rightSize = right.size_bytes ?? parseSizeToBytes(right.size) ?? 0;
        return (leftSize - rightSize) * direction;
      }
      if (sortBy === "quality") {
        const leftRank = QUALITY_RANKS[left.resolution?.toLowerCase() ?? ""] ?? 0;
        const rightRank = QUALITY_RANKS[right.resolution?.toLowerCase() ?? ""] ?? 0;
        return (leftRank - rightRank) * direction;
      }
      const leftScore = left.seeders * 3 - left.leechers;
      const rightScore = right.seeders * 3 - right.leechers;
      return (leftScore - rightScore) * direction;
    });
    return items;
  }, [results, resolution, dub, subtitles, sortBy, sortOrder]);

  return (
    <section className="home-page">
      <div className="home-search-shell">
        <div className="home-search-heading">
          <div>
            <div className="home-eyebrow">Поиск релиза</div>
            <h1 className="home-title">Найти и добавить</h1>
          </div>
          <p className="home-subtitle">
            Введите название, затем уточните тип, качество, озвучку и субтитры.
          </p>
        </div>
        <div className="home-search-row">
          <label className="home-search-input">
            <Search className="home-search-input__icon" />
            <input
              value={queryInput}
              onChange={(event) => onQueryInputChange(event.target.value)}
              placeholder="Название релиза, фильма или сериала"
            />
          </label>
          <button type="button" className="primary-button home-search-button" onClick={onSearch}>
            Искать
          </button>
        </div>
        <div className="home-magnet-row">
          <label className="home-search-input home-magnet-input">
            <Link2 className="home-search-input__icon" />
            <input
              value={magnetInput}
              onChange={(event) => onMagnetInputChange(event.target.value)}
              placeholder="magnet:?xt=urn:btih:..."
            />
          </label>
          <button type="button" className="secondary-button home-magnet-button" onClick={onAddByMagnet}>
            Добавить по magnet
          </button>
        </div>
        <div className="home-controls-toolbar">
          <div className="home-controls-filters">
            <FilterDropdown
              label="Тип"
              value={targetMediaType}
              onChange={(value) => onTargetMediaTypeChange(value as "auto" | "movie" | "series")}
              options={MEDIA_TYPE_OPTIONS}
            />
            <FilterDropdown
              label="Разрешение"
              value={resolution}
              onChange={onResolutionChange}
              options={resolutionOptions}
            />
            <FilterDropdown
              label="Озвучка"
              value={dub}
              onChange={onDubChange}
              options={dubOptions}
            />
            <FilterDropdown
              label="Субтитры"
              value={subtitles}
              onChange={onSubtitlesChange}
              options={subtitlesOptions}
            />
          </div>
          <SortDropdown sortBy={sortBy} sortOrder={sortOrder} onChange={onSortChange} />
        </div>
        {activeFilters.length ? (
          <div className="home-active-filters">
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className="home-active-filter-chip"
                onClick={() => {
                  if (filter.key === "targetMediaType") onTargetMediaTypeChange("auto");
                  if (filter.key === "resolution") onResolutionChange("");
                  if (filter.key === "dub") onDubChange("");
                  if (filter.key === "subtitles") onSubtitlesChange("");
                }}
                aria-label={`Удалить фильтр ${filter.label}`}
              >
                <span>{filter.label}: {filter.value}</span>
                <span className="home-active-filter-chip__close" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="home-results-shell">
        <div className="home-results-header">
          <div>
            <div className="section-kicker">Выдача</div>
            <h2>{query ? `Результаты по запросу "${query}"` : "Поиск ждёт запрос"}</h2>
          </div>
          <div className="home-results-count">{sorted.length}</div>
        </div>

        {loading ? <div className="empty-panel">Идёт поиск...</div> : null}
        {error ? <div className="error-panel">{error}</div> : null}
        {!loading && !error && sorted.length === 0 ? (
          <div className="empty-panel">
            {query ? "По текущим фильтрам результатов нет." : "Введите минимум 2 символа и нажмите «Искать»."}
          </div>
        ) : null}
        <div className="torrent-grid">
          {sorted.map((item) => (
            <TorrentResultCard key={item.info_hash} item={item} addState={addState[item.info_hash] ?? "idle"} onAdd={onAdd} />
          ))}
        </div>
      </div>
    </section>
  );
}
