import { useState } from "react";
import type { ReactNode } from "react";
import { ExternalLink, Eye, EyeOff, LayoutGrid, List, Trash2 } from "lucide-react";

import { ConfirmDialog } from "../../components/Modal";
import {
  formatAggregateDownloadSpeed, formatBytes, formatDate, formatDownloadSpeed, formatEta,
  isTorrentErrorState, mediaTypeLabel, plural, torrentStateLabel, torrentStateTone,
} from "../../lib/format";
import { isForeignTorrent } from "../../lib/types";
import type { AnyLibraryTorrent, LibraryTorrentItem, PublicLibraryTorrentItem } from "../../lib/types";

type WatchHandler = (item: AnyLibraryTorrent) => void;
type HashHandler = (infoHash: string) => void;

function displayTitle(item: AnyLibraryTorrent) {
  return item.media_title ?? item.torrent_title;
}

function watchTitle(item: AnyLibraryTorrent) {
  return item.can_watch ? "Открыть в Jellyfin" : "Ещё не готово к просмотру";
}

/** A completed, watchable item needs no status label; everything else does. */
function Status({ item }: { item: AnyLibraryTorrent }) {
  if (item.status_group === "completed" && item.can_watch) return null;
  const tone = item.status_group !== "completed" && isTorrentErrorState(item.state) ? "err" : torrentStateTone(item.state);
  return <span className={`fd-status is-${tone}`}>{torrentStateLabel(item.state)}</span>;
}

function ItemActions({ item, onWatch, onTogglePublic, onDelete }: {
  item: AnyLibraryTorrent;
  onWatch: WatchHandler;
  onTogglePublic?: HashHandler;
  onDelete?: (item: AnyLibraryTorrent) => void;
}) {
  return (
    <div className="fd-item-actions">
      <button type="button" className={`fd-icon-btn ${item.can_watch ? "" : "is-muted"}`} onClick={() => onWatch(item)}
        title={watchTitle(item)} aria-label={watchTitle(item)}>
        <ExternalLink size={16} />
      </button>
      {onTogglePublic && (
        <button type="button" className="fd-icon-btn" onClick={() => onTogglePublic(item.info_hash)} aria-pressed={item.is_public}
          title={item.is_public ? "Сделать приватным" : "Сделать публичным"}
          aria-label={item.is_public ? "Сделать приватным" : "Сделать публичным"}>
          {item.is_public ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
      {onDelete && (
        <button type="button" className="fd-icon-btn fd-icon-btn--danger" onClick={() => onDelete(item)} title="Удалить" aria-label="Удалить">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

function itemMeta(item: AnyLibraryTorrent, downloading: boolean): string[] {
  const parts: string[] = [];
  if (downloading) {
    parts.push(`${Math.round(item.progress_percent)}%`);
    if (item.download_speed) parts.push(formatDownloadSpeed(item.download_speed));
    if (item.eta_seconds !== null && item.download_speed) parts.push(`осталось ${formatEta(item.eta_seconds)}`);
    parts.push(formatBytes(item.size_bytes));
  } else {
    parts.push(mediaTypeLabel(item.media_type), formatBytes(item.size_bytes));
    const added = formatDate(item.added_at);
    if (added) parts.push(added);
  }
  if (isForeignTorrent(item)) parts.push(`от ${item.owner_username}`);
  else if (item.is_public) parts.push("публичный");
  return parts;
}

function LibraryItem({ item, onWatch, onTogglePublic, onDelete }: {
  item: AnyLibraryTorrent;
  onWatch: WatchHandler; onTogglePublic?: HashHandler; onDelete?: (item: AnyLibraryTorrent) => void;
}) {
  const isError = item.status_group !== "completed" && isTorrentErrorState(item.state);
  const downloading = item.status_group !== "completed" && !isError;
  const progress = Math.max(0, Math.min(100, Math.round(item.progress_percent)));
  const title = displayTitle(item);

  return (
    <li className="fd-item">
      <div className="fd-item-main">
        <button type="button" className="fd-item-title" onClick={() => onWatch(item)} title={item.torrent_title}>{title}</button>
        <div className="fd-item-meta">
          {itemMeta(item, downloading).join(" · ")}
        </div>
        {downloading && (
          <div className="fd-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={`Прогресс: ${title}`}>
            <div className="fd-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <Status item={item} />
      <ItemActions item={item} onWatch={onWatch} onTogglePublic={onTogglePublic} onDelete={onDelete} />
    </li>
  );
}

function Section({ title, count, aside, children }: { title: string; count: number; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="fd-section">
      <div className="fd-section-h">
        <h2>{title} <span className="fd-count">{count}</span></h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

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
  const [view, setView] = useState<"list" | "grid">("list");
  const [pendingDelete, setPendingDelete] = useState<AnyLibraryTorrent | null>(null);

  const confirmDelete = () => {
    if (pendingDelete) onDeleteTorrent(pendingDelete.info_hash);
    setPendingDelete(null);
  };

  const downloadingNow = activeDownloads.filter(i => !isTorrentErrorState(i.state)).length;
  const isEmpty = !loading && activeDownloads.length === 0 && completedDownloads.length === 0 && publicLibraryTorrents.length === 0;

  return (
    <div className="fd-page">
      <header className="fd-page-h">
        <h1>Библиотека</h1>
        {downloadingNow > 0 && (
          <p className="fd-page-note">
            {downloadingNow} {plural(downloadingNow, ["загрузка", "загрузки", "загрузок"])} · {formatAggregateDownloadSpeed(activeDownloads)}
          </p>
        )}
      </header>

      {loading && <p className="fd-state"><span className="fd-spinner" />Загружаем библиотеку…</p>}

      {isEmpty && (
        <div className="fd-state fd-state--block">
          <strong>Пока пусто</strong>
          <span>Найдите раздачу в разделе «Поиск» или вставьте magnet-ссылку.</span>
        </div>
      )}

      {!loading && activeDownloads.length > 0 && (
        <Section title="Загружается" count={activeDownloads.length}>
          <ul className="fd-items">
            {activeDownloads.map(item => {
              const own = !isForeignTorrent(item);
              return (
                <LibraryItem key={item.info_hash} item={item} onWatch={onOpenTorrentWatch}
                  onTogglePublic={own ? onTogglePublic : undefined} onDelete={own ? setPendingDelete : undefined} />
              );
            })}
          </ul>
        </Section>
      )}

      {!loading && completedDownloads.length > 0 && (
        <Section
          title="Скачано" count={completedDownloads.length}
          aside={
            <div className="fd-seg" role="group" aria-label="Вид">
              <button type="button" className={view === "list" ? "is-on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")} title="Список" aria-label="Список"><List size={16} /></button>
              <button type="button" className={view === "grid" ? "is-on" : ""} aria-pressed={view === "grid"} onClick={() => setView("grid")} title="Сетка" aria-label="Сетка"><LayoutGrid size={16} /></button>
            </div>
          }
        >
          <ul className={`fd-items ${view === "grid" ? "is-grid" : ""}`}>
            {completedDownloads.map(item => (
              <LibraryItem key={item.info_hash} item={item} onWatch={onOpenTorrentWatch} onTogglePublic={onTogglePublic} onDelete={setPendingDelete} />
            ))}
          </ul>
        </Section>
      )}

      {!loading && publicLibraryTorrents.length > 0 && (
        <Section title="Открыто другими пользователями" count={publicLibraryTorrents.length}>
          <ul className="fd-items">
            {publicLibraryTorrents.map(item => (
              <LibraryItem key={item.info_hash} item={item} onWatch={onOpenTorrentWatch} />
            ))}
          </ul>
        </Section>
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
    </div>
  );
}
