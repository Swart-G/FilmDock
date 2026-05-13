from __future__ import annotations

"""Provider for AniLibria.TOP — Russian anime streaming/torrent site with open JSON API."""

from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
from datetime import UTC, datetime
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut

PROVIDER_NAME = "anilibria"
BASE_URL = "https://anilibria.top"

QUALITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("2160p", re.compile(r"\b(?:2160p|4k|uhd)\b", re.IGNORECASE)),
    ("1080p", re.compile(r"\b1080p\b",             re.IGNORECASE)),
    ("720p",  re.compile(r"\b720p\b",              re.IGNORECASE)),
    ("480p",  re.compile(r"\b480p\b",              re.IGNORECASE)),
]


class AnilibriaProvider:
    """Two-step search: find releases, then fetch torrents for each."""

    def __init__(self) -> None:
        self.base_url = (settings.anilibria_base_url or BASE_URL).rstrip("/")
        self.timeout_seconds = max(float(settings.torrent_search_timeout_seconds), 2.0)
        self.max_results = max(int(settings.torrent_search_max_results), 1)
        self.max_releases_to_fetch = 8

    def search(self, query: str, *, timeout_seconds: float | None = None) -> list[TorrentResultOut]:
        cleaned = query.strip()
        if not cleaned:
            return []

        effective_timeout = self.timeout_seconds if timeout_seconds is None else max(float(timeout_seconds), 0.5)
        half = effective_timeout / 2.0

        release_ids = self._search_releases(cleaned, timeout=half)
        if not release_ids:
            return []

        ids_to_fetch = release_ids[:self.max_releases_to_fetch]
        results: list[TorrentResultOut] = []
        seen: set[str] = set()

        workers = min(len(ids_to_fetch), 6)
        pool = ThreadPoolExecutor(max_workers=workers)
        futures = [pool.submit(self._fetch_release_torrents, rid, timeout=half) for rid in ids_to_fetch]
        try:
            try:
                for future in as_completed(futures, timeout=half + 0.5):
                    try:
                        items = future.result()
                    except Exception:
                        continue
                    for item in items:
                        key = item.info_hash.lower()
                        if key in seen:
                            continue
                        seen.add(key)
                        results.append(item)
                        if len(results) >= self.max_results:
                            for f in futures:
                                f.cancel()
                            return results
            except TimeoutError:
                pass
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

        return results

    def _search_releases(self, query: str, timeout: float) -> list[int]:
        url = f"{self.base_url}/api/v1/app/search/releases?query={quote(query)}"
        request = Request(url, headers={"User-Agent": "FilmDockBot/1.0", "Accept": "application/json"})
        try:
            with urlopen(request, timeout=timeout) as resp:
                data = json.loads(resp.read(256 * 1024))
                if not isinstance(data, list):
                    return []
                return [int(item["id"]) for item in data if isinstance(item, dict) and item.get("id")]
        except (URLError, HTTPError, json.JSONDecodeError, OSError, KeyError, ValueError):
            return []

    def _fetch_release_torrents(self, release_id: int, timeout: float) -> list[TorrentResultOut]:
        url = f"{self.base_url}/api/v1/anime/releases/{release_id}"
        request = Request(url, headers={"User-Agent": "FilmDockBot/1.0", "Accept": "application/json"})
        try:
            with urlopen(request, timeout=timeout) as resp:
                data = json.loads(resp.read(256 * 1024))
        except (URLError, HTTPError, json.JSONDecodeError, OSError):
            return []

        if not isinstance(data, dict):
            return []

        release_name = self._extract_name(data)
        release_year = data.get("year")
        torrents_raw = data.get("torrents") or []
        if not isinstance(torrents_raw, list):
            return []

        results: list[TorrentResultOut] = []
        for t in torrents_raw:
            if not isinstance(t, dict):
                continue

            info_hash = str(t.get("hash") or "").strip().lower()
            if len(info_hash) != 40:
                continue

            label = str(t.get("label") or t.get("filename") or "").strip()
            title = f"{release_name} ({release_year})" if release_year else release_name
            if label:
                title = f"{release_name} — {label}"

            size_bytes = self._to_int(t.get("size"))
            seeders = self._to_int(t.get("seeders"))
            leechers = self._to_int(t.get("leechers"))

            quality_val = ""
            quality_obj = t.get("quality")
            if isinstance(quality_obj, dict):
                quality_val = str(quality_obj.get("value") or "").strip()
            elif isinstance(quality_obj, str):
                quality_val = quality_obj

            resolution = self._extract_resolution(quality_val or label)

            created_at = str(t.get("created_at") or "").strip()
            published_at = self._parse_iso(created_at) or datetime.now(UTC).isoformat().replace("+00:00", "Z")

            magnet = str(t.get("magnet") or "").strip() or None
            is_hardsub = bool(t.get("is_hardsub"))
            subtitles = "RU (hardsub)" if is_hardsub else None

            tags = [PROVIDER_NAME, "anime"]
            if resolution:
                tags.append(resolution)

            results.append(TorrentResultOut(
                info_hash=info_hash,
                title=title,
                provider=PROVIDER_NAME,
                seeders=max(seeders, 0),
                leechers=max(leechers, 0),
                size=self._format_size(size_bytes if size_bytes > 0 else None),
                size_bytes=size_bytes if size_bytes > 0 else None,
                published_at=published_at,
                resolution=resolution,
                dub="RU",
                subtitles=subtitles,
                tags=tags,
                download_url=magnet,
            ))
        return results

    def _extract_name(self, data: dict[str, object]) -> str:
        name = data.get("name")
        if isinstance(name, dict):
            return str(name.get("main") or name.get("english") or "").strip() or PROVIDER_NAME
        return str(name or "").strip() or PROVIDER_NAME

    def _extract_resolution(self, text: str) -> str | None:
        for res, pat in QUALITY_PATTERNS:
            if pat.search(text):
                return res
        return None

    def _parse_iso(self, raw: str) -> str | None:
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).isoformat().replace("+00:00", "Z")
        except ValueError:
            return None

    def _to_int(self, value: object) -> int:
        try:
            return int(str(value or "0"))
        except (TypeError, ValueError):
            return 0

    def _format_size(self, size_bytes: int | None) -> str:
        if not size_bytes or size_bytes <= 0:
            return "n/a"
        for unit, factor in (("TB", 1024**4), ("GB", 1024**3), ("MB", 1024**2), ("KB", 1024)):
            if size_bytes >= factor:
                v = size_bytes / factor
                return f"{v:.0f} {unit}" if v >= 100 else f"{v:.1f} {unit}" if v >= 10 else f"{v:.2f} {unit}"
        return f"{size_bytes} B"
