from __future__ import annotations

from datetime import UTC, datetime
import json
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut
from app.services.providers.apibay import ApiBayProvider

PROVIDER_NAME = "torrents-csv"
RETRY_ATTEMPTS = 2


class TorrentsCsvProvider(ApiBayProvider):
    """torrents-csv.com public API; reuses ApiBay title parsing helpers."""

    def __init__(self) -> None:
        super().__init__()
        self.base_url = settings.torrents_csv_api_base_url.rstrip("/")

    def search(self, query: str, *, timeout_seconds: float | None = None) -> list[TorrentResultOut]:
        cleaned_query = query.strip()
        if not cleaned_query:
            return []

        effective_timeout = self.timeout_seconds if timeout_seconds is None else max(float(timeout_seconds), 0.4)
        entries = self._request_entries(cleaned_query, timeout_seconds=effective_timeout)

        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        parsed: list[TorrentResultOut] = []
        for entry in entries:
            title = str(entry.get("name") or "").strip()
            info_hash = str(entry.get("infohash") or "").strip().lower()
            if not title or len(info_hash) != 40:
                continue

            size_bytes = self._to_int(entry.get("size_bytes"))
            timestamp = self._to_int(entry.get("created_unix"))
            published_at = (
                datetime.fromtimestamp(timestamp, tz=UTC).isoformat().replace("+00:00", "Z")
                if timestamp > 0
                else now_iso
            )
            resolution = self._extract_resolution(title)
            dub, subtitles = self._extract_languages(title)
            tags = [PROVIDER_NAME]
            if resolution:
                tags.append(resolution)

            parsed.append(
                TorrentResultOut(
                    info_hash=info_hash,
                    title=title,
                    provider=PROVIDER_NAME,
                    seeders=max(self._to_int(entry.get("seeders")), 0),
                    leechers=max(self._to_int(entry.get("leechers")), 0),
                    size=self._format_size(size_bytes),
                    size_bytes=size_bytes if size_bytes > 0 else None,
                    published_at=published_at,
                    resolution=resolution,
                    dub=dub,
                    subtitles=subtitles,
                    tags=tags,
                    download_url=f"magnet:?xt=urn:btih:{info_hash}&dn={quote(title)}",
                )
            )
            if len(parsed) >= self.max_results:
                break
        return parsed

    def _request_entries(self, query: str, *, timeout_seconds: float) -> list[dict[str, object]]:
        params = urlencode({"q": query, "size": min(self.max_results, 100)})
        request = Request(
            f"{self.base_url}/search?{params}",
            headers={"User-Agent": "FilmDockBot/1.0", "Accept": "application/json", "Connection": "close"},
        )
        for attempt in range(RETRY_ATTEMPTS):
            try:
                with urlopen(request, timeout=timeout_seconds / RETRY_ATTEMPTS) as response:
                    raw = response.read(self.max_payload_bytes).decode("utf-8", errors="replace")
                break
            except (URLError, HTTPError, TimeoutError, OSError):
                if attempt + 1 >= RETRY_ATTEMPTS:
                    return []
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return []
        # Newer API wraps results in {"torrents": [...]}, older returns a bare list.
        entries = payload.get("torrents") if isinstance(payload, dict) else payload
        return [entry for entry in entries if isinstance(entry, dict)] if isinstance(entries, list) else []
