from __future__ import annotations

from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from html import unescape
import re
import xml.etree.ElementTree as ET
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut
from app.services.torrent_identity import TorrentIdentityService

PROVIDER_NAME = "animetosho"

MAGNET_RE = re.compile(r'href="(?P<link>magnet:\?[^"]+)"', re.IGNORECASE)
SIZE_RE = re.compile(r"Total Size</strong>:\s*(?P<size>[^<]+)", re.IGNORECASE)
QUALITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("2160p", re.compile(r"\b(?:2160p|4k|uhd)\b", re.IGNORECASE)),
    ("1080p", re.compile(r"\b(?:1080p|1080i)\b", re.IGNORECASE)),
    ("720p", re.compile(r"\b720p\b", re.IGNORECASE)),
    ("480p", re.compile(r"\b(?:480p|dvdrip)\b", re.IGNORECASE)),
]
SIZE_HUMAN_RE = re.compile(r"(?P<num>\d+(?:[.,]\d+)?)\s*(?P<unit>TB|GB|MB|KB|B)", re.IGNORECASE)
SIZE_FACTORS = {
    "B": 1,
    "KB": 1024,
    "MB": 1024 * 1024,
    "GB": 1024 * 1024 * 1024,
    "TB": 1024 * 1024 * 1024 * 1024,
}


class AnimeToshoProvider:
    def __init__(self) -> None:
        self.rss_url = settings.animetosho_rss_url
        self.timeout_seconds = max(float(settings.torrent_search_timeout_seconds), 2.0)
        self.max_results = max(min(int(settings.torrent_search_max_results), 200), 1)
        self.identity = TorrentIdentityService()

    def search(self, query: str, *, timeout_seconds: float | None = None) -> list[TorrentResultOut]:
        cleaned_query = query.strip()
        if not cleaned_query:
            return []

        effective_timeout = self.timeout_seconds if timeout_seconds is None else max(float(timeout_seconds), 0.4)
        payload = self._fetch_rss(cleaned_query, timeout_seconds=effective_timeout)
        if not payload:
            return []
        return self._parse_rss(payload)

    def _fetch_rss(self, query: str, *, timeout_seconds: float) -> str:
        request = Request(
            f"{self.rss_url}?{urlencode({'q': query})}",
            headers={
                "User-Agent": "FilmDockBot/1.0",
                "Accept": "application/rss+xml, application/xml, text/xml",
                "Connection": "close",
            },
        )
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                payload = response.read(768 * 1024)
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
            description = self._text(item, "description")
            if not title:
                continue

            magnet_url = self._extract_magnet(description)
            info_hash = self.identity.extract_info_hash_from_magnet(magnet_url)
            if not info_hash:
                continue

            size_bytes = self._extract_size_bytes(description)
            published_at = self._parse_date(self._text(item, "pubDate")) or now_iso
            resolution = self._extract_resolution(title)
            tags = [PROVIDER_NAME, "anime"]
            if resolution:
                tags.append(resolution)

            parsed.append(
                TorrentResultOut(
                    info_hash=info_hash,
                    title=title,
                    provider=PROVIDER_NAME,
                    seeders=0,
                    leechers=0,
                    size=self._format_size(size_bytes),
                    size_bytes=size_bytes,
                    published_at=published_at,
                    resolution=resolution,
                    dub=None,
                    subtitles="Multi" if re.search(r"\b(?:multi[- ]subs?|subs?|subtitles?)\b", title, re.IGNORECASE) else None,
                    tags=tags,
                    download_url=magnet_url,
                )
            )
            if len(parsed) >= self.max_results:
                break
        return parsed

    def _text(self, item: ET.Element, name: str) -> str:
        found = item.find(name)
        return (found.text or "").strip() if found is not None else ""

    def _extract_magnet(self, description: str) -> str | None:
        match = MAGNET_RE.search(description)
        return unescape(match.group("link")) if match else None

    def _extract_size_bytes(self, description: str) -> int | None:
        size_match = SIZE_RE.search(description)
        if not size_match:
            return None
        human_match = SIZE_HUMAN_RE.search(unescape(size_match.group("size")))
        if not human_match:
            return None
        amount = float(human_match.group("num").replace(",", "."))
        factor = SIZE_FACTORS.get(human_match.group("unit").upper(), 1)
        return int(amount * factor)

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

    def _format_size(self, size_bytes: int | None) -> str:
        if not size_bytes or size_bytes <= 0:
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
