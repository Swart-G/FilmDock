import { ArrowDown, ArrowUp, Check, Download } from "lucide-react";

import { Fragment } from "react";

import { localizeSize, providerLabel } from "../../../lib/format";
import type { TorrentResult } from "../types";

type TorrentResultCardProps = {
  item: TorrentResult;
  addState: "idle" | "loading" | "done" | "error";
  onAdd: (item: TorrentResult) => void;
};

export function TorrentResultCard({ item, addState, onAdd }: TorrentResultCardProps) {
  const adding = addState === "loading";
  const added = addState === "done";
  const isError = addState === "error";

  const pubDate = new Date(item.published_at);
  const dateStr = !Number.isNaN(pubDate.getTime()) && pubDate.getFullYear() > 2000
    ? pubDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : null;

  const extraTags = item.tags?.filter(t =>
    t !== item.provider && !/^(RU|EN|JP|UA|DE|FR|ES)$/i.test(t) && !t.endsWith(" subs")
  ).slice(0, 2) ?? [];

  const meta = [
    item.resolution && <span key="res" className="fd-result-res">{item.resolution}</span>,
    item.dub,
    item.subtitles && `Суб.: ${item.subtitles}`,
    ...extraTags,
    providerLabel(item.provider),
    dateStr,
  ].filter(Boolean);

  const hasSize = item.size && item.size !== "n/a";
  const label = added ? "В очереди" : adding ? "Добавляем…" : isError ? "Повторить" : "Добавить";

  return (
    <li className="fd-result">
      <div className="fd-result-main">
        <h3 title={item.title}>{item.title}</h3>
        <div className="fd-item-meta">
          {meta.map((part, i) => <Fragment key={i}>{i > 0 && " · "}{part}</Fragment>)}
        </div>
      </div>
      <div className="fd-result-stats">
        <span className="fd-mono">{hasSize ? localizeSize(item.size) : "—"}</span>
        <span className="fd-result-peers" aria-label={`Сиды ${item.seeders}, пиры ${item.leechers}`}>
          <span className={item.seeders > 0 ? "fd-ok" : ""}><ArrowUp size={12} aria-hidden="true" />{item.seeders.toLocaleString("ru-RU")}</span>
          <span><ArrowDown size={12} aria-hidden="true" />{item.leechers.toLocaleString("ru-RU")}</span>
        </span>
      </div>
      <button
        type="button"
        className={`fd-btn-ghost fd-result-add ${added ? "is-done" : ""}`}
        onClick={() => onAdd(item)}
        disabled={added || adding}
        aria-busy={adding}
        aria-label={`${label}: ${item.title}`}
        title={label}
      >
        {added ? <Check size={16} /> : adding ? <span className="fd-spinner" /> : <Download size={16} />}
        <span>{label}</span>
      </button>
    </li>
  );
}
