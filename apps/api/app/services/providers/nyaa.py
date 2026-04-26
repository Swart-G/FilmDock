from __future__ import annotations

from datetime import UTC, datetime
import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut
from app.services.torrent_identity import TorrentIdentityService

PROVIDER_NAME = "nyaa.si"

QUALITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("2160p", re.compile(r"\b(?:2160p|4k|uhd)\b", re.IGNORECASE)),
    ("1080p", re.compile(r"\b(?:1080p|1080i)\b", re.IGNORECASE)),
    ("720p", re.compile(r"\b720p\b", re.IGNORECASE)),
    ("480p", re.compile(r"\b(?:480p|dvdrip)\b", re.IGNORECASE)),
]

NS = {
    "nyaa": "https://nyaa.si/xmlns/nyaa",
}


class NyaaProvider:
    def __init__(self) -> None:
        self.base_url = settings.nyaa_base_url.rstrip("/")
        self.timeout_seconds = max(float(settings.torrent_search_timeout_seconds), 1.0)
        self.max_results = max(int(settings.torrent_search_max_results), 1)
        self.identity = TorrentIdentityService()

    def search(self, query: str, *, timeout_seconds: float | None = None) -> list[TorrentResultOut]:
        cleaned_query = query.strip()
        if not cleaned_query:
            return []

        effective_timeout = self.timeout_seconds if timeout_seconds is None else max(float(timeout_seconds), 0.2)
        payload = self._fetch_rss(cleaned_query, timeout_seconds=effective_timeout)
        if not payload:
            return []
        return self._parse_rss(payload)

    def _fetch_rss(self, query: str, *, timeout_seconds: float) -> str:
        url = f"{self.base_url}/?page=rss&q={quote(query)}&c=0_0&f=0"
        request = Request(
            url,
            headers={
                "User-Agent": "FilmDockBot/1.0",
                "Accept": "application/rss+xml, application/xml, text/xml",
            },
        )
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                payload = response.read(512 * 1024)
                charset = response.headers.get_content_charset() or "utf-8"
                return payload.decode(charset, errors="replace")
        except (URLError, HTTPError, TimeoutError, OSError):
            return ""

    def _parse_rss(self, payload: str) -> list[TorrentResultOut]:
        try:
            root = ET.fromstring(payload)
        except ET.ParseError:
            return []

        parsed: list[TorrentResultOut] = []
        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        for item in root.findall(".//item"):
            title = self._text(item, "title")
            if not title:
                continue

            magnet_url = self._text(item, "link")
            info_hash = self.identity.extract_info_hash_from_magnet(magnet_url)
            if not info_hash:
                guid = self._text(item, "guid")
                info_hash = self.identity.normalize(guid) if guid and len(guid) == 40 else ""
            if not info_hash:
                continue

            size_bytes = self._to_int(self._find_text(item, "nyaa:size"))
            seeders = self._to_int(self._find_text(item, "nyaa:seeders"))
            leechers = self._to_int(self._find_text(item, "nyaa:leechers"))
            published_at = self._parse_date(self._text(item, "pubDate")) or now_iso
            resolution = self._extract_resolution(title)
            tags = [PROVIDER_NAME, "anime"]
            if resolution:
                tags.append(resolution)

            parsed.append(
                TorrentResultOut(
                    info_hash=info_hash.lower(),
                    title=title,
                    provider=PROVIDER_NAME,
                    seeders=seeders,
                    leechers=leechers,
                    size=self._format_size(size_bytes),
                    size_bytes=size_bytes if size_bytes > 0 else None,
                    published_at=published_at,
                    resolution=resolution,
                    dub=None,
                    subtitles="JP, EN" if re.search(r"\b(?:sub|subs|subtitle)\b", title, re.IGNORECASE) else None,
                    tags=tags,
                    download_url=magnet_url or urljoin(self.base_url, self._text(item, "guid")),
                )
            )
            if len(parsed) >= self.max_results:
                break
        return parsed

    def _text(self, item: ET.Element, name: str) -> str:
        found = item.find(name)
        return (found.text or "").strip() if found is not None else ""

    def _find_text(self, item: ET.Element, path: str) -> str:
        found = item.find(path, NS)
        return (found.text or "").strip() if found is not None else ""

    def _parse_date(self, value: str) -> str | None:
        if not value:
            return None
        try:
            parsed = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")

    def _extract_resolution(self, title: str) -> str | None:
        for resolution, pattern in QUALITY_PATTERNS:
            if pattern.search(title):
                return resolution
        return None

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
