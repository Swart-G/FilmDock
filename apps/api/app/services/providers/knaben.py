from __future__ import annotations

from datetime import UTC, datetime
import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut
from app.services.providers.apibay import ApiBayProvider

PROVIDER_NAME = "knaben"

# Knaben top-level categories: TV, Movies, Anime.
VIDEO_CATEGORIES = [2000000, 3000000, 6000000]
RETRY_ATTEMPTS = 2
RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class KnabenProvider(ApiBayProvider):
    """Knaben aggregator API; reuses ApiBay title parsing helpers."""

    def __init__(self) -> None:
        super().__init__()
        self.base_url = settings.knaben_api_base_url.rstrip("/")

    def search(self, query: str, *, timeout_seconds: float | None = None) -> list[TorrentResultOut]:
        cleaned_query = query.strip()
        if not cleaned_query:
            return []

        effective_timeout = self.timeout_seconds if timeout_seconds is None else max(float(timeout_seconds), 0.4)
        hits = self._request_hits(cleaned_query, timeout_seconds=effective_timeout)

        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        parsed: list[TorrentResultOut] = []
        for hit in hits:
            title = str(hit.get("title") or "").strip()
            info_hash = str(hit.get("hash") or "").strip().lower()
            if not title or len(info_hash) != 40:
                continue

            size_bytes = self._to_int(hit.get("bytes"))
            published_at = str(hit.get("date") or "").strip() or now_iso
            resolution = self._extract_resolution(title)
            dub, subtitles = self._extract_languages(title)
            tags = [PROVIDER_NAME]
            tracker = str(hit.get("tracker") or "").strip()
            if tracker:
                tags.append(tracker)
            if resolution:
                tags.append(resolution)

            magnet = str(hit.get("magnetUrl") or "").strip()
            parsed.append(
                TorrentResultOut(
                    info_hash=info_hash,
                    title=title,
                    provider=PROVIDER_NAME,
                    seeders=max(self._to_int(hit.get("seeders")), 0),
                    leechers=max(self._to_int(hit.get("peers")), 0),
                    size=self._format_size(size_bytes),
                    size_bytes=size_bytes if size_bytes > 0 else None,
                    published_at=published_at,
                    resolution=resolution,
                    dub=dub,
                    subtitles=subtitles,
                    tags=tags,
                    download_url=magnet if magnet.startswith("magnet:?") else f"magnet:?xt=urn:btih:{info_hash}&dn={quote(title)}",
                )
            )
            if len(parsed) >= self.max_results:
                break
        return parsed

    def _request_hits(self, query: str, *, timeout_seconds: float) -> list[dict[str, object]]:
        body = json.dumps(
            {
                "search_type": "100%",
                "search_field": "title",
                "query": query,
                "order_by": "seeders",
                "order_direction": "desc",
                "categories": VIDEO_CATEGORIES,
                "from": 0,
                "size": min(self.max_results, 100),
                "hide_unsafe": True,
                "hide_xxx": True,
            }
        ).encode("utf-8")
        deadline = time.monotonic() + timeout_seconds
        for attempt in range(RETRY_ATTEMPTS):
            remaining = deadline - time.monotonic()
            if remaining <= 0.2:
                break
            request = Request(
                self.base_url,
                data=body,
                method="POST",
                headers={
                    "User-Agent": "FilmDockBot/1.0",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Connection": "close",
                },
            )
            try:
                with urlopen(request, timeout=remaining) as response:
                    raw = response.read(self.max_payload_bytes).decode("utf-8", errors="replace")
            except HTTPError as error:
                if error.code in RETRYABLE_STATUS and attempt + 1 < RETRY_ATTEMPTS:
                    time.sleep(min(0.3, max(deadline - time.monotonic(), 0)))
                    continue
                return []
            except (URLError, TimeoutError, OSError):
                if attempt + 1 < RETRY_ATTEMPTS:
                    continue
                return []
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                return []
            hits = payload.get("hits") if isinstance(payload, dict) else None
            return [hit for hit in hits if isinstance(hit, dict)] if isinstance(hits, list) else []
        return []
