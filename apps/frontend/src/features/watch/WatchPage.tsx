import { ArrowLeft } from "lucide-react";

import type { PlaySessionOut } from "../../lib/types";

type WatchPageProps = {
  watchSession: PlaySessionOut | null;
  watchLoading: boolean;
  title: string | null;
  onBack: () => void;
};

export function WatchPage({ watchSession, watchLoading, title, onBack }: WatchPageProps) {
  return (
    <div className="fd-screen fd-screen-watch">
      <div className="fd-watch-head">
        <button type="button" className="fd-btn-ghost" onClick={onBack}><ArrowLeft size={16} />Назад</button>
        {title && <h1 className="fd-watch-title">{title}</h1>}
      </div>
      <section className="watch-stage">
        {watchSession?.iframe_url && (
          <iframe title={title ?? "Плеер Jellyfin"} src={watchSession.iframe_url} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        )}
        {(!watchSession?.iframe_url || watchLoading) && (
          <div className="watch-stage__overlay">
            <div className="fd-notice">
              {watchLoading && <span className="fd-spinner" />}
              {watchLoading ? "Подготовка контента в Jellyfin…" : watchSession?.message ?? "Сессия воспроизведения отсутствует."}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
