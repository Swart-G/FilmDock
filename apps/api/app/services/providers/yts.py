from __future__ import annotations

from datetime import UTC, datetime
import json
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut

PROVIDER_NAME = "yts"


class YtsProvider:
    def __init__(self) -> None:
        self.base_url = settings.yts_base_url.rstrip("/")
        self.timeout_seconds = max(float(settings.torrent_search_timeout_seconds), 2.0)
        self.max_results = max(min(int(settings.torrent_search_max_results), 200), 1)

    def search(self, query: str, *, timeout_seconds: float | None = None) -> list[TorrentResultOut]:
        cleaned_query = query.strip()
        if not cleaned_query:
            return []

        effective_timeout = self.timeout_seconds if timeout_seconds is None else max(float(timeout_seconds), 0.4)
        payload = self._request_json(cleaned_query, timeout_seconds=effective_timeout)
        movies = payload.get("data", {}).get("movies", []) if isinstance(payload, dict) else []
        if not isinstance(movies, list):
            return []

        parsed: list[TorrentResultOut] = []
        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        for movie in movies:
            if not isinstance(movie, dict):
                continue
            title = str(movie.get("title_long") or movie.get("title") or "").strip()
            torrents = movie.get("torrents", [])
            if not title or not isinstance(torrents, list):
                continue
            for torrent in torrents:
                if not isinstance(torrent, dict):
                    continue
                info_hash = str(torrent.get("hash") or "").strip().lower()
                if len(info_hash) != 40:
                    continue

                quality = str(torrent.get("quality") or "").strip() or None
                release_type = str(torrent.get("type") or "").strip()
                codec = str(torrent.get("video_codec") or "").strip()
                title_parts = [title]
                if quality:
                    title_parts.append(quality)
                if release_type:
                    title_parts.append(release_type.upper())
                if codec:
                    title_parts.append(codec)
                release_title = " ".join(title_parts)

                timestamp = self._to_int(torrent.get("date_uploaded_unix"))
                published_at = (
                    datetime.fromtimestamp(timestamp, tz=UTC).isoformat().replace("+00:00", "Z")
                    if timestamp > 0
                    else now_iso
                )
                size_bytes = self._to_int(torrent.get("size_bytes"))
                seeders = self._to_int(torrent.get("seeds"))
                leechers = self._to_int(torrent.get("peers"))

                tags = [PROVIDER_NAME, "movie"]
                if quality:
                    tags.append(quality)

                parsed.append(
                    TorrentResultOut(
                        info_hash=info_hash,
                        title=release_title,
                        provider=PROVIDER_NAME,
                        seeders=max(seeders, 0),
                        leechers=max(leechers, 0),
                        size=self._format_size(size_bytes),
                        size_bytes=size_bytes if size_bytes > 0 else None,
                        published_at=published_at,
                        resolution=quality,
                        dub="EN",
                        subtitles=None,
                        tags=tags,
                        download_url=f"magnet:?xt=urn:btih:{info_hash}&dn={quote(release_title)}",
                    )
                )
                if len(parsed) >= self.max_results:
                    return parsed
        return parsed

    def _request_json(self, query: str, *, timeout_seconds: float) -> dict[str, object]:
        params = urlencode({"query_term": query, "limit": 50, "sort_by": "seeds", "order_by": "desc"})
        request = Request(
            f"{self.base_url}/api/v2/list_movies.json?{params}",
            headers={
                "User-Agent": "FilmDockBot/1.0",
                "Accept": "application/json",
                "Connection": "close",
            },
        )
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                raw = response.read(512 * 1024).decode("utf-8", errors="replace")
        except (URLError, HTTPError, TimeoutError, OSError):
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    def _to_int(self, value: object) -> int:
        try:
            return int(str(value or "0"))
        except (TypeError, ValueError):
            return 0

    def _format_size(self, size_bytes: int) -> str:
        if size_bytes <= 0:
            return "n/a"
        for unit, factor in (("TB", 1024**4), ("GB", 1024**3), ("MB", 1024**2), ("KB", 1024)):
            if size_bytes >= factor:
                value = size_bytes / factor
                if value >= 100:
                    return f"{value:.0f} {unit}"
                if value >= 10:
                    return f"{value:.1f} {unit}"
                return f"{value:.2f} {unit}"
        return f"{size_bytes} B"
