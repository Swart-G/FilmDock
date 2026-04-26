import { CalendarDays, Download, HardDrive, Plus } from "lucide-react";

import type { TorrentResult } from "../types";

type TorrentResultCardProps = {
  item: TorrentResult;
  addState: "idle" | "loading" | "done" | "error";
  onAdd: (item: TorrentResult) => void;
};

export function TorrentResultCard({ item, addState, onAdd }: TorrentResultCardProps) {
  const meta = [
    `Сиды: ${item.seeders}`,
    `Пиры: ${item.leechers}`,
    `Размер: ${item.size}`,
  ];

  return (
    <article className="torrent-card">
      <div className="torrent-card__content">
        <div className="torrent-card__header">
          <div>
            <h3 className="torrent-card__title">{item.title}</h3>
            <div className="torrent-card__meta">
              {meta.map((entry) => (
                <span key={entry}>{entry}</span>
              ))}
            </div>
          </div>
          <button type="button" className="torrent-card__action" onClick={() => onAdd(item)}>
            {addState === "loading" ? <Download className="is-spinning" /> : <Plus />}
            <span>{addState === "done" ? "В очереди" : addState === "error" ? "Повторить" : "Добавить в очередь"}</span>
          </button>
        </div>
        <div className="torrent-card__chips">
          <span>{item.provider}</span>
          {item.resolution ? <span>{item.resolution}</span> : null}
          {item.dub ? <span>{item.dub}</span> : null}
          {item.subtitles ? <span>{item.subtitles}</span> : null}
        </div>
      </div>
      <div className="torrent-card__footer">
        <div className="torrent-card__footer-item">
          <HardDrive size={14} />
          <span>{item.size}</span>
        </div>
        <div className="torrent-card__footer-item">
          <CalendarDays size={14} />
          <span>{new Date(item.published_at).toLocaleString("ru-RU")}</span>
        </div>
      </div>
    </article>
  );
}
