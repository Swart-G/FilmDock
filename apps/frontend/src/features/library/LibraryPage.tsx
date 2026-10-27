import { useState } from "react";
import type { CSSProperties } from "react";
import { Check, Download, ExternalLink, Eye, EyeOff, Film, LayoutGrid, Library, List, Trash2, Tv } from "lucide-react";

import { ConfirmDialog } from "../../components/Modal";
import {
  formatAggregateDownloadSpeed, formatBytes, formatDate, formatDownloadSpeed, formatEta, hashHue,
  isTorrentErrorState, mediaTypeLabel, plural, staggerDelay, torrentStateLabel, torrentStateTone,
} from "../../lib/format";
import { isForeignTorrent } from "../../lib/types";
import type { AnyLibraryTorrent, LibraryTorrentItem, PublicLibraryTorrentItem } from "../../lib/types";

type WatchHandler = (item: AnyLibraryTorrent) => void;
type HashHandler = (infoHash: string) => void;

function displayTitle(item: AnyLibraryTorrent) {
  return item.media_title ?? item.torrent_title;
}

function StateBadge({ item }: { item: AnyLibraryTorrent }) {
  if (item.status_group === "completed" && item.can_watch) {
    return <span className="fd-info-badge is-ok">Готов</span>;
  }
  const isError = item.status_group !== "completed" && isTorrentErrorState(item.state);
  const tone = isError ? "err" : torrentStateTone(item.state);
  return <span className={`fd-info-badge is-${tone}`}>{torrentStateLabel(item.state)}</span>;
}

function MediaIcon({ type }: { type: string | null }) {
  return type === "series" ? <Tv size={16} /> : <Film size={16} />;
}

function watchTitle(item: AnyLibraryTorrent) {
  return item.can_watch ? "Открыть в Jellyfin" : "Ещё не готово к просмотру";
}

function TorrentActions({ item, onWatch, onTogglePublic, onDelete }: {
  item: AnyLibraryTorrent;
  onWatch: WatchHandler;
  onTogglePublic?: HashHandler;
  onDelete?: (item: AnyLibraryTorrent) => void;
}) {
  return (
    <div className="fd-active-card__actions">
      <button
        type="button"
        className={`fd-icon-btn ${item.can_watch ? "" : "is-muted"}`}
        onClick={() => onWatch(item)}
        title={watchTitle(item)} aria-label={watchTitle(item)}
      >
        <ExternalLink size={14} />
      </button>
      {onTogglePublic && (
        <button
          type="button" className="fd-icon-btn"
          onClick={() => onTogglePublic(item.info_hash)}
          aria-pressed={item.is_public}
          title={item.is_public ? "Сделать приватным" : "Сделать публичным"}
          aria-label={item.is_public ? "Сделать приватным" : "Сделать публичным"}
        >
          {item.is_public ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
      {onDelete && (
        <button type="button" className="fd-icon-btn fd-icon-btn--danger" onClick={() => onDelete(item)} title="Удалить" aria-label="Удалить">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Active download card (progress-heavy) ─────────────────────────────────

function ActiveTorrentCard({ item, index, onWatch, onTogglePublic, onDelete }: {
  item: AnyLibraryTorrent; index: number;
  onWatch: WatchHandler; onTogglePublic?: HashHandler; onDelete?: (item: AnyLibraryTorrent) => void;
}) {
  const progress = Math.max(0, Math.min(100, Math.round(item.progress_percent)));
  const isDone = item.status_group === "completed";
  const added = formatDate(item.added_at, false);

  return (
    <article className="fd-active-card" style={{ "--ih": hashHue(item.info_hash), animationDelay: staggerDelay(index, 30) } as CSSProperties}>
      <div className="fd-active-card__header">
        <div className="fd-active-card__icon">
          {isDone ? <Check size={16} /> : <Download size={16} />}
        </div>
        <div className="fd-active-card__title-wrap">
          <div className="fd-active-card__title" title={displayTitle(item)}>{displayTitle(item)}</div>
          <div className="fd-active-card__sub">
            <StateBadge item={item} />
            {item.is_public && <span className="fd-info-badge is-ok">Публичный</span>}
            {isForeignTorrent(item) && <span className="fd-info-badge">{item.owner_username}</span>}
          </div>
        </div>
      </div>

      <div
        className="fd-active-card__progress-wrap"
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
        aria-label={`Прогресс загрузки ${displayTitle(item)}`}
      >
        <div className={`fd-active-card__progress-bar ${isDone ? "is-done" : ""}`} style={{ width: `${progress}%` }} />
      </div>

      <div className="fd-active-card__meta">
        <div className="fd-active-card__meta-item">
          <span className="fd-active-card__meta-k">Прогресс</span>
          <span className="fd-active-card__meta-v">{progress}%</span>
        </div>
        <div className="fd-active-card__meta-item">
          <span className="fd-active-card__meta-k">Размер</span>
          <span className="fd-active-card__meta-v">{formatBytes(item.size_bytes)}</span>
        </div>
        {item.download_speed !== null && (
          <div className="fd-active-card__meta-item">
            <span className="fd-active-card__meta-k">Скорость</span>
            <span className="fd-active-card__meta-v">{formatDownloadSpeed(item.download_speed)}</span>
          </div>
        )}
        {item.eta_seconds !== null && (
          <div className="fd-active-card__meta-item">
            <span className="fd-active-card__meta-k">Осталось</span>
            <span className="fd-active-card__meta-v">{formatEta(item.eta_seconds)}</span>
          </div>
        )}
        {added && (
          <div className="fd-active-card__meta-item">
            <span className="fd-active-card__meta-k">Добавлен</span>
            <span className="fd-active-card__meta-v">{added}</span>
          </div>
        )}
      </div>

      <div className="fd-active-card__foot">
        <div className="fd-active-card__release fd-mono" title={item.torrent_title}>{item.torrent_title}</div>
        <TorrentActions item={item} onWatch={onWatch} onTogglePublic={onTogglePublic} onDelete={onDelete} />
      </div>
    </article>
  );
}

// ─── Completed torrent card (grid) ─────────────────────────────────────────

function CompletedTorrentCard({ item, index, onWatch, onTogglePublic, onDelete }: {
  item: LibraryTorrentItem; index: number;
  onWatch: WatchHandler; onTogglePublic: HashHandler; onDelete: (item: AnyLibraryTorrent) => void;
}) {
  const added = formatDate(item.added_at);

  return (
    <article className="fd-active-card fd-done-card" style={{ "--ih": hashHue(item.info_hash), animationDelay: staggerDelay(index, 18) } as CSSProperties}>
      <div className="fd-active-card__header">
        <div className="fd-active-card__icon"><MediaIcon type={item.media_type} /></div>
        <div className="fd-active-card__title-wrap">
          <div className="fd-active-card__title" title={displayTitle(item)}>{displayTitle(item)}</div>
          <div className="fd-active-card__sub">
            <StateBadge item={item} />
            {item.is_public && <span className="fd-info-badge is-ok">Публичный</span>}
          </div>
        </div>
      </div>

      <div className="fd-active-card__meta">
        <div className="fd-active-card__meta-item">
          <span className="fd-active-card__meta-k">Тип</span>
          <span className="fd-active-card__meta-v">{mediaTypeLabel(item.media_type)}</span>
        </div>
        <div className="fd-active-card__meta-item">
          <span className="fd-active-card__meta-k">Размер</span>
          <span className="fd-active-card__meta-v">{formatBytes(item.size_bytes)}</span>
        </div>
        {added && (
          <div className="fd-active-card__meta-item">
            <span className="fd-active-card__meta-k">Добавлен</span>
            <span className="fd-active-card__meta-v">{added}</span>
          </div>
        )}
      </div>

      <div className="fd-active-card__foot">
        <div className="fd-active-card__release fd-mono" title={item.torrent_title}>{item.torrent_title}</div>
        <TorrentActions item={item} onWatch={onWatch} onTogglePublic={onTogglePublic} onDelete={onDelete} />
      </div>
    </article>
  );
}

// ─── Completed torrent list row ─────────────────────────────────────────────

function CompletedTorrentRow({ item, index, onWatch, onTogglePublic, onDelete }: {
  item: LibraryTorrentItem; index: number;
  onWatch: WatchHandler; onTogglePublic: HashHandler; onDelete: (item: AnyLibraryTorrent) => void;
}) {
  return (
    <div className="fd-row" role="row" style={{ animationDelay: staggerDelay(index, 14) }}>
      <button type="button" className="fd-row-title" onClick={() => onWatch(item)} title={watchTitle(item)}>
        <span className="fd-row-name">{displayTitle(item)}</span>
        <span className="fd-row-meta">
          <span>{mediaTypeLabel(item.media_type)}</span>
          <span className="fd-dot-sep" />
          <span className="fd-mono">{formatBytes(item.size_bytes)}</span>
          {item.is_public && <><span className="fd-dot-sep" /><span className="fd-accent-text">публичный</span></>}
        </span>
      </button>
      <span className="fd-row-badge"><StateBadge item={item} /></span>
      <span className="fd-row-added">{formatDate(item.added_at) ?? "—"}</span>
      <TorrentActions item={item} onWatch={onWatch} onTogglePublic={onTogglePublic} onDelete={onDelete} />
    </div>
  );
}

// ─── Public torrent card ────────────────────────────────────────────────────

function PublicTorrentCard({ item, index, onWatch }: { item: PublicLibraryTorrentItem; index: number; onWatch: WatchHandler }) {
  const added = formatDate(item.added_at);
  return (
    <button
      type="button"
      className="fd-public-card"
      style={{ "--ih": hashHue(item.info_hash), animationDelay: staggerDelay(index, 18) } as CSSProperties}
      onClick={() => onWatch(item)}
      title={watchTitle(item)}
    >
      <span className="fd-public-card__body">
        <span className="fd-public-card__title">{displayTitle(item)}</span>
        <span className="fd-public-card__meta">
          <span>{mediaTypeLabel(item.media_type)}</span>
          <span className="fd-dot-sep" />
          <span className="fd-mono">{formatBytes(item.size_bytes)}</span>
          {item.can_watch && <><span className="fd-dot-sep" /><span className="fd-ok-text">готов</span></>}
        </span>
        <span className="fd-public-card__owner">
          Владелец: <span className="fd-accent-text">{item.owner_username}</span>
          {added && <span> · {added}</span>}
        </span>
      </span>
      <span className="fd-public-card__arrow" aria-hidden="true"><ExternalLink size={14} /></span>
    </button>
  );
}

// ─── LibraryPage ────────────────────────────────────────────────────────────

type LibraryPageProps = {
  loading: boolean;
  activeDownloads: AnyLibraryTorrent[];
  completedDownloads: LibraryTorrentItem[];
  publicLibraryTorrents: PublicLibraryTorrentItem[];
  onOpenTorrentWatch: WatchHandler;
  onTogglePublic: HashHandler;
  onDeleteTorrent: HashHandler;
};

export function LibraryPage({
  loading, activeDownloads, completedDownloads, publicLibraryTorrents,
  onOpenTorrentWatch, onTogglePublic, onDeleteTorrent,
}: LibraryPageProps) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [pendingDelete, setPendingDelete] = useState<AnyLibraryTorrent | null>(null);

  const aggregateSpeed = formatAggregateDownloadSpeed(activeDownloads);
  const watchableCount = completedDownloads.filter(i => i.can_watch).length;
  const ownPublicCount = completedDownloads.filter(i => i.is_public).length
    + activeDownloads.filter(i => !isForeignTorrent(i) && i.is_public).length;

  const confirmDelete = () => {
    if (pendingDelete) onDeleteTorrent(pendingDelete.info_hash);
    setPendingDelete(null);
  };

  return (
    <>
      <header className="fd-lib-hero">
        <div className="fd-lib-hero-l">
          <div className="fd-eyebrow"><span className="fd-eyebrow-dot" />Медиатека</div>
          <h1 className="fd-h1">
            <span className="fd-h1-count fd-mono">{watchableCount}</span>{" "}
            {plural(watchableCount, ["единица", "единицы", "единиц"])} медиа,
            <br />
            <span className="fd-h1-soft">{plural(watchableCount, ["готовая", "готовые", "готовых"])} к просмотру</span>
          </h1>
        </div>
        <dl className="fd-lib-stats">
          <div className="fd-stat">
            <dt className="fd-stat-k">Загружается</dt>
            <dd className="fd-stat-v fd-mono">{activeDownloads.length}</dd>
            {activeDownloads.length > 0 && <dd className="fd-stat-sub">{aggregateSpeed}</dd>}
          </div>
          <div className="fd-stat">
            <dt className="fd-stat-k">Скачано</dt>
            <dd className="fd-stat-v fd-mono">{completedDownloads.length}</dd>
          </div>
          <div className="fd-stat">
            <dt className="fd-stat-k">Мои публичные</dt>
            <dd className="fd-stat-v fd-mono">{ownPublicCount}</dd>
          </div>
          <div className="fd-stat">
            <dt className="fd-stat-k">В Jellyfin</dt>
            <dd className="fd-stat-v fd-mono">{watchableCount}</dd>
          </div>
        </dl>
      </header>

      {loading && (
        <div className="fd-empty fd-empty--compact">
          <div className="fd-empty-icon"><span className="fd-spinner fd-spinner--lg" /></div>
          <h3>Загружаем библиотеку…</h3>
        </div>
      )}

      {!loading && activeDownloads.length > 0 && (
        <section className="fd-lib-section">
          <h2 className="fd-section-label">
            Загружается
            <span className="fd-section-label-count">{activeDownloads.length}</span>
          </h2>
          <div className="fd-active-grid">
            {activeDownloads.map((item, i) => {
              const own = !isForeignTorrent(item);
              return (
                <ActiveTorrentCard
                  key={item.info_hash} item={item} index={i}
                  onWatch={onOpenTorrentWatch}
                  onTogglePublic={own ? onTogglePublic : undefined}
                  onDelete={own ? setPendingDelete : undefined}
                />
              );
            })}
          </div>
        </section>
      )}

      {!loading && (
        <section className="fd-lib-section">
          <div className="fd-lib-bar">
            <h2 className="fd-section-label">
              Скачано
              <span className="fd-section-label-count">{completedDownloads.length}</span>
            </h2>
            {completedDownloads.length > 0 && (
              <div className="fd-view-toggle" role="group" aria-label="Вид">
                <button type="button" className={view === "grid" ? "is-on" : ""} aria-pressed={view === "grid"} onClick={() => setView("grid")} title="Сетка" aria-label="Сетка">
                  <LayoutGrid size={16} />
                </button>
                <button type="button" className={view === "list" ? "is-on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")} title="Список" aria-label="Список">
                  <List size={16} />
                </button>
              </div>
            )}
          </div>

          {completedDownloads.length === 0 ? (
            <div className="fd-empty">
              <div className="fd-empty-icon"><Library size={28} /></div>
              <h3>Пока пусто</h3>
              <p>Добавьте торрент через поиск или magnet-ссылку</p>
            </div>
          ) : view === "grid" ? (
            <div className="fd-info-grid">
              {completedDownloads.map((item, i) => (
                <CompletedTorrentCard
                  key={item.info_hash} item={item} index={i}
                  onWatch={onOpenTorrentWatch} onTogglePublic={onTogglePublic} onDelete={setPendingDelete}
                />
              ))}
            </div>
          ) : (
            <div className="fd-list" role="table" aria-label="Скачанные торренты">
              <div className="fd-list-h" role="row">
                <span role="columnheader">Название</span>
                <span role="columnheader">Статус</span>
                <span role="columnheader">Добавлено</span>
                <span role="columnheader" className="fd-sr-only">Действия</span>
              </div>
              {completedDownloads.map((item, i) => (
                <CompletedTorrentRow
                  key={item.info_hash} item={item} index={i}
                  onWatch={onOpenTorrentWatch} onTogglePublic={onTogglePublic} onDelete={setPendingDelete}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && publicLibraryTorrents.length > 0 && (
        <section className="fd-lib-section">
          <h2 className="fd-section-label">
            Публичные торренты
            <span className="fd-section-label-count">{publicLibraryTorrents.length}</span>
          </h2>
          <p className="fd-section-hint">Контент, который другие пользователи открыли для общего доступа</p>
          <div className="fd-public-grid">
            {publicLibraryTorrents.map((item, i) => (
              <PublicTorrentCard key={item.info_hash} item={item} index={i} onWatch={onOpenTorrentWatch} />
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Удалить торрент?"
        description={pendingDelete
          ? `«${displayTitle(pendingDelete)}» будет удалён из библиотеки и qBittorrent. Загруженные файлы тоже удалятся, если их больше никто не использует.`
          : ""}
        confirmLabel="Удалить"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
