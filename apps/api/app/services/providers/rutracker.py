from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
from datetime import UTC, datetime
from hashlib import sha1
from html import unescape
from http.cookiejar import CookieJar
import gzip
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus, urlencode, urljoin, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut
from app.services.torrent_identity import TorrentIdentityService

PROVIDER_NAME = "rutracker"

THREAD_RE = re.compile(r'<tr id="trs-tr-\d+".*?</tr>', re.IGNORECASE | re.DOTALL)
TOPIC_ID_RE = re.compile(r'data-topic_id="(?P<data>\d+)"|viewtopic\.php\?t=(?P<link>\d+)', re.IGNORECASE)
TITLE_RE = re.compile(r'class="(?:med\s+)?tLink"[^>]*>(?P<title>.*?)</a>', re.IGNORECASE | re.DOTALL)
TITLE_FALLBACK_RE = re.compile(r'href="viewtopic\.php\?t=\d+"[^>]*>(?P<title>.*?)</a>', re.IGNORECASE | re.DOTALL)
SEEDERS_RE = re.compile(
    r'class="[^"]*seed[^"]*"[^>]*data-ts_text="(?P<data>-?\d+)"|class="[^"]*seed[^"]*"[^>]*>(?P<text>-?\d+)</',
    re.IGNORECASE | re.DOTALL,
)
LEECHERS_RE = re.compile(
    r'class="[^"]*leech[^"]*"[^>]*data-ts_text="(?P<data>\d+)"|class="[^"]*leech[^"]*"[^>]*>(?P<text>\d+)</',
    re.IGNORECASE | re.DOTALL,
)
DATA_TS_RE = re.compile(r'data-ts_text="(-?\d+)"', re.IGNORECASE)
MAGNET_RE = re.compile(r'href="(?P<link>magnet:\?[^"]+)"', re.IGNORECASE)
DOWNLOAD_RE = re.compile(r'href="(?P<link>(?:\.?/)?dl\.php\?t=\d+)"', re.IGNORECASE)
SIZE_HUMAN_RE = re.compile(r'(?P<num>\d+(?:[.,]\d+)?)\s*(?P<unit>TB|GB|MB|KB|B)', re.IGNORECASE)

QUALITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("2160p", re.compile(r"\b(?:2160p|4k|uhd)\b", re.IGNORECASE)),
    ("1080p", re.compile(r"\b(?:1080p|1080i)\b", re.IGNORECASE)),
    ("720p", re.compile(r"\b720p\b", re.IGNORECASE)),
    ("480p", re.compile(r"\b(?:480p|dvdrip)\b", re.IGNORECASE)),
]

LANGUAGE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("RU", re.compile(r"(?<![\w])(?:ru|rus|russian|рус(?:ский|ская|ские|ск)?)(?![\w])", re.IGNORECASE)),
    ("EN", re.compile(r"(?<![\w])(?:en|eng|english|англ(?:ийский)?)(?![\w])", re.IGNORECASE)),
    ("JP", re.compile(r"(?<![\w])(?:jp|jpn|japanese|япон(?:ский)?)(?![\w])", re.IGNORECASE)),
    ("DE", re.compile(r"(?<![\w])(?:de|deu|german|нем(?:ецкий)?)(?![\w])", re.IGNORECASE)),
    ("FR", re.compile(r"(?<![\w])(?:fr|fra|french|франц(?:узский)?)(?![\w])", re.IGNORECASE)),
    ("ES", re.compile(r"(?<![\w])(?:es|spa|spanish|исп(?:анский)?)(?![\w])", re.IGNORECASE)),
]
AUDIO_MARKERS_RE = re.compile(r"(?:озвуч|дубляж|дублир|audio|dub|dvo|mvo|пм|профессионал|лиценз)", re.IGNORECASE)
SUBTITLE_MARKERS_RE = re.compile(r"(?:subtitles?|subs?|субт|сабы|hardsub|softsub)", re.IGNORECASE)
NO_SUBTITLE_MARKERS_RE = re.compile(r"(?:без\s+субт|no\s+subs?)", re.IGNORECASE)

SIZE_FACTORS = {
    "B": 1,
    "KB": 1024,
    "MB": 1024 * 1024,
    "GB": 1024 * 1024 * 1024,
    "TB": 1024 * 1024 * 1024 * 1024,
}


class RutrackerProvider:
    def __init__(self) -> None:
        mirrors = [mirror.strip().rstrip("/") for mirror in settings.rutracker_mirrors if mirror.strip()]
        self.mirrors = mirrors or ["https://rutracker.org"]
        self.timeout_seconds = max(float(settings.torrent_search_timeout_seconds), 1.0)
        self.max_results = max(int(settings.torrent_search_max_results), 1)
        self.username = (settings.rutracker_username or "").strip() or None
        self.password = (settings.rutracker_password or "").strip() or None
        self.identity = TorrentIdentityService()

    def search(self, query: str, *, timeout_seconds: float | None = None) -> list[TorrentResultOut]:
        cleaned_query = query.strip()
        if not cleaned_query:
            return []

        effective_timeout = self.timeout_seconds if timeout_seconds is None else max(float(timeout_seconds), 0.2)
        results: list[TorrentResultOut] = []
        seen: set[str] = set()
        workers = min(max(len(self.mirrors), 1), 4)
        pool = ThreadPoolExecutor(max_workers=workers)
        futures = [pool.submit(self._search_mirror, mirror, cleaned_query, effective_timeout) for mirror in self.mirrors]
        try:
            try:
                for future in as_completed(futures, timeout=effective_timeout + 0.5):
                    try:
                        mirror_results = future.result()
                    except Exception:
                        continue
                    for item in mirror_results:
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

    def _search_mirror(self, mirror: str, query: str, timeout_seconds: float) -> list[TorrentResultOut]:
        page = self._fetch_search_page(mirror, query, authorize=False, timeout_seconds=timeout_seconds)
        rows = self._parse_rows(page, mirror)
        if rows:
            return rows
        if not self.username or not self.password:
            return []
        authorized_page = self._fetch_search_page(mirror, query, authorize=True, timeout_seconds=timeout_seconds)
        return self._parse_rows(authorized_page, mirror)

    def _fetch_search_page(self, mirror: str, query: str, authorize: bool, *, timeout_seconds: float) -> str:
        opener = build_opener(HTTPCookieProcessor(CookieJar()))
        if authorize and self.username and self.password:
            payload = urlencode(
                {
                    "login_username": self.username,
                    "login_password": self.password,
                    "login": "Вход",
                },
                encoding="cp1251",
            ).encode("cp1251", errors="ignore")
            login_request = Request(
                f"{mirror}/forum/login.php",
                data=payload,
                method="POST",
                headers={
                    "User-Agent": "FilmDockBot/1.0",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": f"{mirror}/forum/login.php",
                },
            )
            try:
                with opener.open(login_request, timeout=timeout_seconds):
                    pass
            except (URLError, HTTPError):
                return ""

        request = Request(
            f"{mirror}/forum/tracker.php?nm={quote_plus(query)}",
            headers={
                "User-Agent": "FilmDockBot/1.0",
                "Accept-Encoding": "gzip",
                "Referer": f"{mirror}/forum/",
            },
        )
        try:
            with opener.open(request, timeout=timeout_seconds) as response:
                payload = response.read()
                if response.headers.get("Content-Encoding", "").lower().startswith("gzip"):
                    payload = gzip.decompress(payload)
                charset = response.headers.get_content_charset() or "cp1251"
                return payload.decode(charset, errors="replace")
        except (URLError, HTTPError, OSError):
            return ""

    def _parse_rows(self, page: str, mirror: str) -> list[TorrentResultOut]:
        if not page:
            return []
        rows = THREAD_RE.findall(page)
        if not rows:
            return []

        host = urlparse(mirror).netloc or PROVIDER_NAME
        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        parsed: list[TorrentResultOut] = []

        for row in rows:
            topic_id = self._extract_topic_id(row)
            if not topic_id:
                continue

            title = self._extract_title(row)
            if not title:
                continue

            ts_values = [int(value) for value in DATA_TS_RE.findall(row)]
            seeders = self._extract_seeders(row, ts_values)
            leechers = self._extract_leechers(row)
            size_bytes = self._extract_size_bytes(row, ts_values)
            published_at = self._extract_published_at(ts_values) or now_iso

            resolution = self._extract_resolution(title)
            dub, subtitles = self._extract_languages(title)
            magnet_url = self._extract_magnet(row)
            info_hash = self.identity.extract_info_hash_from_magnet(magnet_url)
            if not info_hash:
                info_hash = sha1(f"{host}:{topic_id}".encode("utf-8")).hexdigest()

            download_url = magnet_url or self._extract_download_url(row, mirror, topic_id)
            tags = [host]
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
                )
            )
        return parsed

    def _extract_topic_id(self, row: str) -> str | None:
        match = TOPIC_ID_RE.search(row)
        if not match:
            return None
        return match.group("data") or match.group("link")

    def _extract_title(self, row: str) -> str | None:
        match = TITLE_RE.search(row) or TITLE_FALLBACK_RE.search(row)
        if not match:
            return None
        raw_title = unescape(match.group("title"))
        cleaned = re.sub(r"<[^>]+>", " ", raw_title)
        return " ".join(cleaned.replace("\xa0", " ").split()) or None

    def _extract_seeders(self, row: str, ts_values: list[int]) -> int:
        match = SEEDERS_RE.search(row)
        if match:
            value = match.group("data") or match.group("text")
            if value is not None:
                return int(value)
        for value in ts_values:
            if -20_000 <= value <= 200_000:
                return value
        return 0

    def _extract_leechers(self, row: str) -> int:
        match = LEECHERS_RE.search(row)
        if not match:
            return 0
        value = match.group("data") or match.group("text")
        return int(value) if value else 0

    def _extract_size_bytes(self, row: str, ts_values: list[int]) -> int | None:
        for value in ts_values:
            if 4_096 <= value < 8_000_000_000_000:
                return value

        human_match = SIZE_HUMAN_RE.search(unescape(row))
        if not human_match:
            return None
        amount = float(human_match.group("num").replace(",", "."))
        factor = SIZE_FACTORS.get(human_match.group("unit").upper(), 1)
        return int(amount * factor)

    def _extract_published_at(self, ts_values: list[int]) -> str | None:
        upper_bound = int(datetime.now(UTC).timestamp()) + 31_536_000
        for value in reversed(ts_values):
            if 946_684_800 <= value <= upper_bound:
                return datetime.fromtimestamp(value, tz=UTC).isoformat().replace("+00:00", "Z")
        return None

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
        dub: str | None
        subtitles: str | None

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

    def _extract_magnet(self, row: str) -> str | None:
        match = MAGNET_RE.search(row)
        if not match:
            return None
        return unescape(match.group("link"))

    def _extract_download_url(self, row: str, mirror: str, topic_id: str) -> str:
        match = DOWNLOAD_RE.search(row)
        if match:
            return urljoin(f"{mirror}/forum/", unescape(match.group("link")))
        return f"{mirror}/forum/dl.php?t={topic_id}"

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
