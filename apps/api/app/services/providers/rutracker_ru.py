from __future__ import annotations

"""Provider for rutracker.ru — open JSON search API (no auth required).

The site exposes a public search endpoint that returns JSON without requiring
login, unlike rutracker.org which requires a registered account for full results.
Falls back to HTML scraping if the JSON endpoint is unavailable.
"""

from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
from datetime import UTC, datetime
from hashlib import sha1
from html import unescape
import gzip
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote, quote_plus, urlparse
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut
from app.services.torrent_identity import TorrentIdentityService

PROVIDER_NAME = "rutracker.ru"

QUALITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("2160p", re.compile(r"\b(?:2160p|4k|uhd)\b", re.IGNORECASE)),
    ("1080p", re.compile(r"\b(?:1080p|1080i)\b", re.IGNORECASE)),
    ("720p",  re.compile(r"\b720p\b",              re.IGNORECASE)),
    ("480p",  re.compile(r"\b(?:480p|dvdrip)\b",   re.IGNORECASE)),
]

LANGUAGE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("RU", re.compile(r"(?<![\w])(?:ru|rus|russian|рус(?:ский|ская|ские|ск)?|русск?)(?![\w])", re.IGNORECASE)),
    ("EN", re.compile(r"(?<![\w])(?:en|eng|english|англ(?:ийский)?)(?![\w])", re.IGNORECASE)),
    ("UA", re.compile(r"(?<![\w])(?:ua|ukr|укр(?:аинский)?)(?![\w])", re.IGNORECASE)),
    ("DE", re.compile(r"(?<![\w])(?:de|deu|german|нем(?:ецкий)?)(?![\w])", re.IGNORECASE)),
]
AUDIO_MARKERS_RE = re.compile(r"(?:озвуч|дубляж|дублир|audio|dub|dvo|mvo|пм\s|проф|лиценз)", re.IGNORECASE)
SUBTITLE_MARKERS_RE = re.compile(r"(?:subtitles?|subs?|субт|сабы|hardsub|softsub)", re.IGNORECASE)
NO_SUBTITLE_MARKERS_RE = re.compile(r"(?:без\s+субт|no\s+subs?)", re.IGNORECASE)

SIZE_FACTORS: dict[str, int] = {
    "B": 1,
    "KB": 1024, "КБ": 1024,
    "MB": 1024 * 1024, "МБ": 1024 * 1024,
    "GB": 1024 * 1024 * 1024, "ГБ": 1024 * 1024 * 1024,
    "TB": 1024 * 1024 * 1024 * 1024,
}
SIZE_HUMAN_RE = re.compile(r"([\d.,]+)\s*(TB|GB|ГБ|MB|МБ|KB|КБ|B)", re.IGNORECASE)

# HTML fallback regexes
ROW_RE = re.compile(r'<tr[^>]+id="trs-tr-\d+"[^>]*>(.*?)</tr>', re.IGNORECASE | re.DOTALL)
TITLE_RE = re.compile(r'class="(?:med\s+)?tLink"[^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
TOPIC_ID_RE = re.compile(r'data-topic_id="(\d+)"|viewtopic\.php\?t=(\d+)', re.IGNORECASE)
MAGNET_RE = re.compile(r'href="(magnet:\?[^"]+)"', re.IGNORECASE)
DATA_TS_RE = re.compile(r'data-ts_text="(-?\d+)"', re.IGNORECASE)
SEEDS_HTML_RE = re.compile(r'class="[^"]*seed[^"]*"[^>]*data-ts_text="(-?\d+)"|class="[^"]*seed[^"]*"[^>]*>(-?\d+)<', re.IGNORECASE | re.DOTALL)
LEECH_HTML_RE = re.compile(r'class="[^"]*leech[^"]*"[^>]*data-ts_text="(\d+)"|class="[^"]*leech[^"]*"[^>]*>(\d+)<', re.IGNORECASE | re.DOTALL)


class RutrackerRuProvider:
    """Provider for rutracker.ru open JSON API."""

    def __init__(self) -> None:
        mirrors = [m.strip().rstrip("/") for m in settings.rutracker_ru_mirrors if m.strip()]
        self.mirrors = mirrors or ["https://rutracker.ru"]
        self.timeout_seconds = max(float(settings.torrent_search_timeout_seconds), 1.0)
        self.max_results = max(int(settings.torrent_search_max_results), 1)
        self.identity = TorrentIdentityService()

    def search(self, query: str, *, timeout_seconds: float | None = None) -> list[TorrentResultOut]:
        cleaned = query.strip()
        if not cleaned:
            return []

        effective_timeout = self.timeout_seconds if timeout_seconds is None else max(float(timeout_seconds), 0.2)
        results: list[TorrentResultOut] = []
        seen: set[str] = set()

        workers = min(len(self.mirrors), 3)
        pool = ThreadPoolExecutor(max_workers=workers)
        futures = [pool.submit(self._search_mirror, mirror, cleaned, effective_timeout) for mirror in self.mirrors]
        try:
            try:
                for future in as_completed(futures, timeout=effective_timeout + 0.5):
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
                            for pending in futures:
                                pending.cancel()
                            return results
            except TimeoutError:
                pass
        finally:
            pool.shutdown(wait=False, cancel_futures=True)
        return results

    def _search_mirror(self, mirror: str, query: str, timeout: float) -> list[TorrentResultOut]:
        # Try JSON API first
        results = self._search_json_api(mirror, query, timeout)
        if results:
            return results
        # Fall back to HTML scraping (same format as rutracker.org)
        return self._search_html(mirror, query, timeout)

    def _search_json_api(self, mirror: str, query: str, timeout: float) -> list[TorrentResultOut]:
        """Try several known open API endpoint patterns."""
        api_urls = [
            f"{mirror}/api/v1.0/full.json?q={quote(query)}&limit=50",
            f"{mirror}/forum/api.php?method=search&query={quote_plus(query)}",
            f"{mirror}/search.php?api=1&q={quote_plus(query)}",
        ]
        for url in api_urls:
            try:
                request = Request(
                    url,
                    headers={"User-Agent": "FilmDockBot/1.0", "Accept": "application/json"},
                )
                with urlopen(request, timeout=min(timeout, 4.0)) as resp:
                    raw = resp.read(512 * 1024)
                    content_type = resp.headers.get("Content-Type", "")
                    if "json" not in content_type and not raw.strip().startswith(b"[") and not raw.strip().startswith(b"{"):
                        continue
                    data = json.loads(raw.decode("utf-8", errors="replace"))
                    items = self._parse_json_response(data, mirror)
                    if items:
                        return items
            except (URLError, HTTPError, json.JSONDecodeError, OSError):
                continue
        return []

    def _parse_json_response(self, data: object, mirror: str) -> list[TorrentResultOut]:
        host = urlparse(mirror).netloc or PROVIDER_NAME
        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        entries: list[dict[str, object]] = []

        if isinstance(data, list):
            entries = [e for e in data if isinstance(e, dict)]
        elif isinstance(data, dict):
            for key in ("data", "results", "torrents", "items", "list"):
                val = data.get(key)
                if isinstance(val, list):
                    entries = [e for e in val if isinstance(e, dict)]
                    break

        parsed: list[TorrentResultOut] = []
        for entry in entries:
            title = str(entry.get("title") or entry.get("name") or "").strip()
            if not title:
                continue

            info_hash = str(entry.get("hash") or entry.get("info_hash") or "").strip().lower()
            if len(info_hash) != 40:
                torrent_id = str(entry.get("id") or entry.get("topic_id") or "")
                info_hash = sha1(f"{host}:{torrent_id}:{title}".encode()).hexdigest() if torrent_id else ""
            if not info_hash:
                continue

            seeders = self._to_int(entry.get("seeders") or entry.get("seeds") or 0)
            leechers = self._to_int(entry.get("leechers") or entry.get("peers") or 0)
            size_bytes = self._to_int(entry.get("size") or entry.get("size_bytes") or 0) or None
            ts = self._to_int(entry.get("added") or entry.get("registered_at") or 0)
            published_at = (
                datetime.fromtimestamp(ts, tz=UTC).isoformat().replace("+00:00", "Z") if ts > 0 else now_iso
            )

            torrent_id = str(entry.get("id") or entry.get("topic_id") or "")
            magnet = str(entry.get("magnet") or entry.get("magnet_url") or "")
            if not magnet and info_hash and len(info_hash) == 40:
                magnet = f"magnet:?xt=urn:btih:{info_hash}&dn={quote(title)}"
            download_url = magnet or (f"{mirror}/forum/dl.php?t={torrent_id}" if torrent_id else None)

            resolution = self._extract_resolution(title)
            dub, subtitles = self._extract_languages(title)
            tags = [host]
            if resolution:
                tags.append(resolution)
            if dub:
                tags.append(dub)

            parsed.append(TorrentResultOut(
                info_hash=info_hash,
                title=title,
                provider=host,
                seeders=max(seeders, 0),
                leechers=max(leechers, 0),
                size=self._format_size(size_bytes),
                size_bytes=size_bytes,
                published_at=published_at,
                resolution=resolution,
                dub=dub,
                subtitles=subtitles,
                tags=tags,
                download_url=download_url or None,
            ))
            if len(parsed) >= self.max_results:
                break
        return parsed

    def _search_html(self, mirror: str, query: str, timeout: float) -> list[TorrentResultOut]:
        """HTML scraping fallback — same structure as rutracker.org."""
        url = f"{mirror}/forum/tracker.php?nm={quote_plus(query)}"
        request = Request(
            url,
            headers={
                "User-Agent": "FilmDockBot/1.0",
                "Accept-Encoding": "gzip",
                "Referer": f"{mirror}/forum/",
            },
        )
        try:
            with urlopen(request, timeout=timeout) as resp:
                raw = resp.read(1024 * 1024)
                if resp.headers.get("Content-Encoding", "").lower().startswith("gzip"):
                    raw = gzip.decompress(raw)
                charset = resp.headers.get_content_charset() or "cp1251"
                page = raw.decode(charset, errors="replace")
        except (URLError, HTTPError, OSError):
            return []

        return self._parse_html_rows(page, mirror)

    def _parse_html_rows(self, page: str, mirror: str) -> list[TorrentResultOut]:
        host = urlparse(mirror).netloc or PROVIDER_NAME
        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        parsed: list[TorrentResultOut] = []

        for row in ROW_RE.findall(page):
            tid_m = TOPIC_ID_RE.search(row)
            if not tid_m:
                continue
            topic_id = tid_m.group(1) or tid_m.group(2)

            t_m = TITLE_RE.search(row)
            if not t_m:
                continue
            title = self._clean(t_m.group(1))
            if not title:
                continue

            ts_values = [int(v) for v in DATA_TS_RE.findall(row)]
            seeders = self._extract_seeders_html(row, ts_values)
            leechers = self._extract_int_match(LEECH_HTML_RE, row)
            size_bytes = self._extract_size_from_ts(ts_values)
            published_at = self._extract_date_from_ts(ts_values) or now_iso

            magnet_m = MAGNET_RE.search(row)
            magnet = unescape(magnet_m.group(1)) if magnet_m else None
            info_hash = self.identity.extract_info_hash_from_magnet(magnet)
            if not info_hash:
                info_hash = sha1(f"{host}:{topic_id}".encode()).hexdigest()

            resolution = self._extract_resolution(title)
            dub, subtitles = self._extract_languages(title)
            download_url = magnet or f"{mirror}/forum/dl.php?t={topic_id}"
            tags = [host]
            if resolution:
                tags.append(resolution)
            if dub:
                tags.append(dub)

            parsed.append(TorrentResultOut(
                info_hash=info_hash,
                title=title,
                provider=host,
                seeders=max(seeders, 0),
                leechers=max(leechers, 0),
                size=self._format_size(size_bytes),
                size_bytes=size_bytes,
                published_at=published_at,
                resolution=resolution,
                dub=dub,
                subtitles=subtitles,
                tags=tags,
                download_url=download_url,
            ))
            if len(parsed) >= self.max_results:
                break
        return parsed

    def _clean(self, html: str) -> str:
        text = re.sub(r"<[^>]+>", " ", unescape(html))
        return " ".join(text.replace("\xa0", " ").split())

    def _extract_seeders_html(self, row: str, ts_values: list[int]) -> int:
        m = SEEDS_HTML_RE.search(row)
        if m:
            val = m.group(1) or m.group(2)
            if val:
                return int(val)
        for v in ts_values:
            if 0 <= v <= 200_000:
                return v
        return 0

    def _extract_int_match(self, pattern: re.Pattern[str], text: str) -> int:
        m = pattern.search(text)
        if not m:
            return 0
        val = m.group(1) or m.group(2)
        try:
            return int(val) if val else 0
        except ValueError:
            return 0

    def _extract_size_from_ts(self, ts_values: list[int]) -> int | None:
        for v in ts_values:
            if 4096 <= v < 8_000_000_000_000:
                return v
        return None

    def _extract_date_from_ts(self, ts_values: list[int]) -> str | None:
        upper = int(datetime.now(UTC).timestamp()) + 31_536_000
        for v in reversed(ts_values):
            if 946_684_800 <= v <= upper:
                return datetime.fromtimestamp(v, tz=UTC).isoformat().replace("+00:00", "Z")
        return None

    def _to_int(self, value: object) -> int:
        try:
            return int(str(value or "0"))
        except (TypeError, ValueError):
            return 0

    def _extract_resolution(self, title: str) -> str | None:
        for res, pat in QUALITY_PATTERNS:
            if pat.search(title):
                return res
        return None

    def _extract_languages(self, title: str) -> tuple[str | None, str | None]:
        detected = [code for code, pat in LANGUAGE_PATTERNS if pat.search(title)]
        if not detected:
            return None, None
        deduped = list(dict.fromkeys(detected))
        dub = ", ".join(deduped[:2]) if AUDIO_MARKERS_RE.search(title) else deduped[0]
        subtitles = None
        if not NO_SUBTITLE_MARKERS_RE.search(title) and SUBTITLE_MARKERS_RE.search(title):
            subtitles = ", ".join(deduped[:3])
        return dub or None, subtitles or None

    def _format_size(self, size_bytes: int | None) -> str:
        if not size_bytes or size_bytes <= 0:
            return "n/a"
        for unit, factor in (("TB", 1024**4), ("GB", 1024**3), ("MB", 1024**2), ("KB", 1024)):
            if size_bytes >= factor:
                v = size_bytes / factor
                return f"{v:.0f} {unit}" if v >= 100 else f"{v:.1f} {unit}" if v >= 10 else f"{v:.2f} {unit}"
        return f"{size_bytes} B"
