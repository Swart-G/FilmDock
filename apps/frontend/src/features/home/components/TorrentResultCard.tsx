import { Check, Download } from "lucide-react";
import type { CSSProperties } from "react";

import type { TorrentResult } from "../types";

type TorrentResultCardProps = {
  item: TorrentResult;
  index?: number;
  addState: "idle" | "loading" | "done" | "error";
  onAdd: (item: TorrentResult) => void;
};

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
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

function SeedersBar({ seeders, leechers }: { seeders: number; leechers: number }) {
  const tone = seeders > 500 ? "high" : seeders > 50 ? "mid" : "low";
  return (
    <div className={`fd-sl fd-sl-${tone}`}>
      <span className="fd-sl-up">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M5 8V2M2 5l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {seeders.toLocaleString("ru-RU")}
      </span>
      <span className="fd-sl-sep" />
      <span className="fd-sl-dn">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M5 2v6M2 5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {leechers}
      </span>
    </div>
  );
}

export function TorrentResultCard({ item, index = 0, addState, onAdd }: TorrentResultCardProps) {
  const hue = hashHue(item.info_hash + item.title);
  const isHDR = /HDR|DV/i.test(item.resolution ?? "");
  const is4k = /4K|2160/i.test(item.resolution ?? "");
  const adding = addState === "loading";
  const added = addState === "done";
  const isError = addState === "error";

  const pubDate = new Date(item.published_at);
  const isValidDate = !Number.isNaN(pubDate.getTime()) && pubDate.getFullYear() > 2000;
  const dateStr = isValidDate
    ? pubDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : null;

  // Show relevant badges — skip provider tags since we show it in header
  const extraTags = item.tags?.filter(t =>
    t !== item.provider &&
    !/^(RU|EN|JP|UA|DE|FR|ES)$/i.test(t) &&
    !t.endsWith(" subs")
  ).slice(0, 2) ?? [];

  return (
    <article
      className="fd-card"
      style={{ "--h": hue, animationDelay: `${index * 28}ms` } as CSSProperties}
    >
      <div className="fd-card-bg" aria-hidden="true" />

      <header className="fd-card-h">
        <div className="fd-card-title">
          <h3>{item.title}</h3>
          <div className="fd-card-sub">
            <span className="fd-mono">{providerLabel(item.provider)}</span>
            {dateStr && <><span className="fd-dot-sep" /><span>{dateStr}</span></>}
            {isError && <span className="fd-tag fd-tag-warn">Ошибка</span>}
          </div>
        </div>
      </header>

      <div className="fd-card-badges">
        {item.resolution && (
          <span className={`fd-badge ${is4k ? "fd-badge-4k" : ""}`}>{item.resolution}</span>
        )}
        {isHDR && !is4k && <span className="fd-badge fd-badge-hdr">HDR</span>}
        {item.dub && <span className="fd-badge fd-badge-rel">{item.dub}</span>}
        {item.subtitles && (
          <span className="fd-badge fd-badge-rel" title="Субтитры">Sub: {item.subtitles}</span>
        )}
        {extraTags.map(tag => (
          <span key={tag} className="fd-badge fd-badge-rel">{tag}</span>
        ))}
      </div>

      <div className="fd-card-meta">
        {item.size && item.size !== "n/a" && (
          <div className="fd-meta-row">
            <span className="fd-meta-k">Размер</span>
            <span className="fd-meta-v fd-mono">{item.size}</span>
          </div>
        )}
        <div className="fd-meta-row">
          <span className="fd-meta-k">Сиды/Пиры</span>
          <SeedersBar seeders={item.seeders} leechers={item.leechers} />
        </div>
      </div>

      <button
        type="button"
        className={`fd-add ${adding ? "is-loading" : ""} ${added ? "is-done" : ""}`}
        onClick={() => onAdd(item)}
        disabled={added}
      >
        {added ? (
          <><Check size={16} />В очереди</>
        ) : adding ? (
          <><span className="fd-spinner" />Добавляем…</>
        ) : (
          <><Download size={16} />{isError ? "Повторить" : "Добавить"}</>
        )}
      </button>
    </article>
  );
}
