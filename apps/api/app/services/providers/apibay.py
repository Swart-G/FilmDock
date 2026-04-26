from __future__ import annotations

from datetime import UTC, datetime
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut

PROVIDER_NAME = "apibay.org"

QUALITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("2160p", re.compile(r"\b(?:2160p|4k|uhd)\b", re.IGNORECASE)),
    ("1080p", re.compile(r"\b(?:1080p|1080i)\b", re.IGNORECASE)),
    ("720p", re.compile(r"\b720p\b", re.IGNORECASE)),
    ("480p", re.compile(r"\b(?:480p|dvdrip)\b", re.IGNORECASE)),
]

LANGUAGE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("RU", re.compile(r"(?<![\w])(?:ru|rus|russian|рус(?:ский)?)(?![\w])", re.IGNORECASE)),
    ("EN", re.compile(r"(?<![\w])(?:en|eng|english|англ(?:ийский)?)(?![\w])", re.IGNORECASE)),
    ("JP", re.compile(r"(?<![\w])(?:jp|jpn|japanese|япон(?:ский)?)(?![\w])", re.IGNORECASE)),
]
AUDIO_MARKERS_RE = re.compile(r"(?:озвуч|дубляж|dubb?ed|audio|mvo|dvo)", re.IGNORECASE)
SUBTITLE_MARKERS_RE = re.compile(r"(?:subtitles?|subs?|субт|сабы|hardsub|softsub)", re.IGNORECASE)
NO_SUBTITLE_MARKERS_RE = re.compile(r"(?:без\s+субт|no\s+subs?)", re.IGNORECASE)


class ApiBayProvider:
    def __init__(self) -> None:
        self.base_url = settings.apibay_base_url.rstrip("/")
        self.timeout_seconds = max(float(settings.torrent_search_timeout_seconds), 2.0)
        self.max_results = max(min(int(settings.torrent_search_max_results), 200), 1)
        self.max_payload_bytes = 768 * 1024

    def search(self, query: str, *, timeout_seconds: float | None = None) -> list[TorrentResultOut]:
        cleaned_query = query.strip()
        if not cleaned_query:
            return []

        effective_timeout = self.timeout_seconds if timeout_seconds is None else max(float(timeout_seconds), 0.2)
        payload = self._request_json(cleaned_query, timeout_seconds=effective_timeout)
        if not payload:
            return []

        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        parsed: list[TorrentResultOut] = []
        for entry in payload:
            title = str(entry.get("name") or "").strip()
            info_hash = str(entry.get("info_hash") or "").strip().lower()
            if title.lower() == "no results returned":
                continue
            if not title or len(info_hash) != 40:
                continue

            seeders = self._to_int(entry.get("seeders"))
            leechers = self._to_int(entry.get("leechers"))
            size_bytes = self._to_int(entry.get("size"))
            timestamp = self._to_int(entry.get("added"))
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
            if dub:
                tags.append(dub)
            if subtitles:
                tags.append(f"{subtitles} subs")

            parsed.append(
                TorrentResultOut(
                    info_hash=info_hash,
                    title=title,
                    provider=PROVIDER_NAME,
                    seeders=max(seeders, 0),
                    leechers=max(leechers, 0),
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

    def _request_json(self, query: str, *, timeout_seconds: float) -> list[dict[str, object]]:
        request = Request(
            f"{self.base_url}/q.php?q={quote(query)}",
            headers={
                "User-Agent": "FilmDockBot/1.0",
                "Accept": "application/json",
                "Connection": "close",
            },
        )
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                chunks = bytearray()
                while len(chunks) < self.max_payload_bytes:
                    try:
                        chunk = response.read(8192)
                    except TimeoutError:
                        break
                    if not chunk:
                        break
                    chunks.extend(chunk)
                    if chunks.rstrip().endswith(b"]"):
                        break
        except (URLError, HTTPError, TimeoutError, OSError):
            return []

        if not chunks:
            return []
        raw = chunks.decode("utf-8", errors="replace").strip()
        if not raw:
            return []
        data = self._decode_json_array(raw)
        return [item for item in data if isinstance(item, dict)]

    def _decode_json_array(self, raw: str) -> list[object]:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = None

        if isinstance(parsed, list):
            return parsed

        cut = raw.rfind("},{")
        if cut == -1:
            return []
        repaired = f"{raw[:cut + 1]}]"
        try:
            parsed_repaired = json.loads(repaired)
        except json.JSONDecodeError:
            return []
        if not isinstance(parsed_repaired, list):
            return []
        return parsed_repaired

    def _extract_resolution(self, title: str) -> str | None:
        for resolution, pattern in QUALITY_PATTERNS:
            if pattern.search(title):
                return resolution
        return None

    def _extract_languages(self, title: str) -> tuple[str | None, str | None]:
        detected = [code for code, pattern in LANGUAGE_PATTERNS if pattern.search(title)]
        if not detected:
            return None, None
        deduped = list(dict.fromkeys(detected))

        if AUDIO_MARKERS_RE.search(title):
            dub = ", ".join(deduped[:2])
        else:
            dub = deduped[0]

        if NO_SUBTITLE_MARKERS_RE.search(title):
            subtitles = None
        elif SUBTITLE_MARKERS_RE.search(title):
            subtitles = ", ".join(deduped[:3])
        else:
            subtitles = None
        return dub or None, subtitles or None

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
