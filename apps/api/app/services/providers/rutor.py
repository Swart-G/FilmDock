from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
from datetime import UTC, datetime
from hashlib import sha1
from html import unescape
import gzip
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut
from app.services.torrent_identity import TorrentIdentityService

PROVIDER_NAME = "rutor"

ROW_RE = re.compile(r"<tr[^>]*>.*?</tr>", re.IGNORECASE | re.DOTALL)
CELL_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.IGNORECASE | re.DOTALL)
LINK_RE = re.compile(r'href="(?P<link>/(?:torrent|download)/\d+[^"]*)"[^>]*>(?P<title>.*?)</a>', re.IGNORECASE | re.DOTALL)
MAGNET_RE = re.compile(r'href="(?P<link>magnet:\?[^"]+)"', re.IGNORECASE)
SIZE_RE = re.compile(r"(?P<num>\d+(?:[.,]\d+)?)\s*(?P<unit>TB|GB|MB|KB|B)", re.IGNORECASE)
SEED_LEECH_RE = re.compile(r"<span[^>]*class=\"green\"[^>]*>(?P<seed>\d+)</span>.*?<span[^>]*class=\"red\"[^>]*>(?P<leech>\d+)</span>", re.IGNORECASE | re.DOTALL)
# Date format: "02&nbsp;Апр&nbsp;26" or "02 Апр 26"
DATE_RE = re.compile(r"<td[^>]*>(\d{1,2})(?:&nbsp;|\s+)(Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек)(?:&nbsp;|\s+)(\d{2})\s*</td>", re.IGNORECASE)

_RU_MONTHS = {"янв": 1, "фев": 2, "мар": 3, "апр": 4, "май": 5, "июн": 6,
              "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12}

QUALITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("2160p", re.compile(r"\b(?:2160p|4k|uhd)\b", re.IGNORECASE)),
    ("1080p", re.compile(r"\b(?:1080p|1080i)\b", re.IGNORECASE)),
    ("720p", re.compile(r"\b720p\b", re.IGNORECASE)),
    ("480p", re.compile(r"\b(?:480p|dvdrip)\b", re.IGNORECASE)),
]

LANGUAGE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("RU", re.compile(r"(?<![\w])(?:ru|rus|russian|рус(?:ский|ская|ские|ск)?)(?![\w])", re.IGNORECASE)),
    ("EN", re.compile(r"(?<![\w])(?:en|eng|english|англ(?:ийский)?)(?![\w])", re.IGNORECASE)),
    ("UA", re.compile(r"(?<![\w])(?:ua|ukr|укр(?:аинский)?)(?![\w])", re.IGNORECASE)),
    ("JP", re.compile(r"(?<![\w])(?:jp|jpn|japanese|япон(?:ский)?)(?![\w])", re.IGNORECASE)),
]

# Russian torrent shortcodes: | D | P | L | A | MVO | DVO | P2 | КПК | etc.
# D=Дублированный, P=Профессиональный, L=ЛостФилм/Любит., A=Авторский, MVO/DVO=многоголосый
_RU_SHORTCODE_RE = re.compile(
    r"[|\s,](?:D2?|P2?|L2?|A|MVO|DVO|КПК|SDI|HDRezka|NewStudio|Пифагор|LostFilm|Generalfilm|Kerob|Scarabey)[|\s,]",
    re.IGNORECASE,
)
_UKR_SHORTCODE_RE = re.compile(r"[|\s,]UKR[|\s,]", re.IGNORECASE)

AUDIO_MARKERS_RE = re.compile(r"(?:озвуч|дубляж|дублир|audio|dub|dvo|mvo|профессионал|лиценз)", re.IGNORECASE)
SUBTITLE_MARKERS_RE = re.compile(r"(?:subtitles?|subs?|субт|сабы|hardsub|softsub)", re.IGNORECASE)
NO_SUBTITLE_MARKERS_RE = re.compile(r"(?:без\s+субт|no\s+subs?)", re.IGNORECASE)

SIZE_FACTORS = {
    "B": 1,
    "KB": 1024,
    "MB": 1024 * 1024,
    "GB": 1024 * 1024 * 1024,
    "TB": 1024 * 1024 * 1024 * 1024,
}


class RutorProvider:
    def __init__(self) -> None:
        mirrors = [mirror.strip().rstrip("/") for mirror in settings.rutor_mirrors if mirror.strip()]
        self.mirrors = mirrors or ["https://rutor.info"]
        self.timeout_seconds = max(float(settings.torrent_search_timeout_seconds), 1.0)
        self.max_results = max(int(settings.torrent_search_max_results), 1)
        self.identity = TorrentIdentityService()

    def search(self, query: str, *, timeout_seconds: float | None = None) -> list[TorrentResultOut]:
        cleaned_query = query.strip()
        if not cleaned_query:
            return []

        effective_timeout = self.timeout_seconds if timeout_seconds is None else max(float(timeout_seconds), 0.2)
        results: list[TorrentResultOut] = []
        seen: set[str] = set()
        workers = min(max(len(self.mirrors), 1), 3)
        pool = ThreadPoolExecutor(max_workers=workers)
        futures = [pool.submit(self._search_mirror, mirror, cleaned_query, effective_timeout) for mirror in self.mirrors]
        try:
            try:
                for future in as_completed(futures, timeout=effective_timeout + 0.25):
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
        encoded = quote(query)
        for path in (f"/search/0/0/000/0/{encoded}", f"/search/{encoded}"):
            page = self._fetch_page(f"{mirror}{path}", timeout_seconds=timeout_seconds)
            rows = self._parse_rows(page, mirror)
            if rows:
                return rows
        return []

    def _fetch_page(self, url: str, *, timeout_seconds: float) -> str:
        request = Request(
            url,
            headers={
                "User-Agent": "FilmDockBot/1.0",
                "Accept-Encoding": "gzip",
                "Referer": f"{urlparse(url).scheme}://{urlparse(url).netloc}/",
            },
        )
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                payload = response.read(512 * 1024)
                if response.headers.get("Content-Encoding", "").lower().startswith("gzip"):
                    payload = gzip.decompress(payload)
                charset = response.headers.get_content_charset() or "utf-8"
                return payload.decode(charset, errors="replace")
        except (URLError, HTTPError, TimeoutError, OSError):
            return ""

    def _parse_rows(self, page: str, mirror: str) -> list[TorrentResultOut]:
        if not page:
            return []

        # Scope to the search results table only — avoids news/pinned items at top
        index_start = page.find('id="index"')
        if index_start != -1:
            page = page[index_start:]

        host = urlparse(mirror).netloc or PROVIDER_NAME
        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        parsed: list[TorrentResultOut] = []

        for row in ROW_RE.findall(page):
            link_match, title = self._extract_title_link(row)
            if not title:
                continue

            magnet_url = self._extract_magnet(row)
            info_hash = self.identity.extract_info_hash_from_magnet(magnet_url)
            topic_key = link_match.group("link")
            if not info_hash:
                info_hash = sha1(f"{host}:{topic_key}:{title}".encode("utf-8")).hexdigest()

            seeders, leechers = self._extract_seed_leech(row)
            size_bytes = self._extract_size_bytes(row)
            published_at = self._extract_date(row) or now_iso
            resolution = self._extract_resolution(title)
            dub, subtitles = self._extract_languages(title)
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
                    seeders=seeders,
                    leechers=leechers,
                    size=self._format_size(size_bytes),
                    size_bytes=size_bytes,
                    published_at=published_at,
                    resolution=resolution,
                    dub=dub,
                    subtitles=subtitles,
                    tags=tags,
                    download_url=magnet_url,
                )
            )
            if len(parsed) >= self.max_results:
                break
        return parsed

    def _extract_title_link(self, row: str) -> tuple[re.Match[str] | None, str | None]:
        for match in LINK_RE.finditer(row):
            title = self._clean_html(match.group("title"))
            if title:
                return match, title
        return None, None

    def _clean_html(self, value: str) -> str:
        cleaned = re.sub(r"<[^>]+>", " ", unescape(value))
        return " ".join(cleaned.replace("\xa0", " ").split())

    def _extract_magnet(self, row: str) -> str | None:
        match = MAGNET_RE.search(row)
        return unescape(match.group("link")) if match else None

    def _extract_seed_leech(self, row: str) -> tuple[int, int]:
        match = SEED_LEECH_RE.search(row)
        if match:
            return int(match.group("seed")), int(match.group("leech"))
        cells = [self._clean_html(cell) for cell in CELL_RE.findall(row)]
        numbers = [int(value) for cell in cells for value in re.findall(r"\b\d{1,6}\b", cell)]
        if len(numbers) >= 2:
            return max(numbers[-2], 0), max(numbers[-1], 0)
        return 0, 0

    def _extract_size_bytes(self, row: str) -> int | None:
        match = SIZE_RE.search(self._clean_html(row))
        if not match:
            return None
        amount = float(match.group("num").replace(",", "."))
        factor = SIZE_FACTORS.get(match.group("unit").upper(), 1)
        return int(amount * factor)

    def _extract_resolution(self, title: str) -> str | None:
        for resolution, pattern in QUALITY_PATTERNS:
            if pattern.search(title):
                return resolution
        return None

    def _extract_languages(self, title: str) -> tuple[str | None, str | None]:
        detected = [code for code, pattern in LANGUAGE_PATTERNS if pattern.search(title)]

        # Rutor uses single-letter shortcodes like | D | P | L | for Russian audio
        padded = f" {title} "
        # Add RU from shortcodes regardless of what LANGUAGE_PATTERNS already found
        if _RU_SHORTCODE_RE.search(padded) and "RU" not in detected:
            detected.insert(0, "RU")
        if _UKR_SHORTCODE_RE.search(padded) and "UA" not in detected:
            detected.append("UA")

        if not detected:
            return None, None
        deduped = list(dict.fromkeys(detected))
        has_audio = AUDIO_MARKERS_RE.search(title) or _RU_SHORTCODE_RE.search(padded)
        dub = ", ".join(deduped[:2]) if has_audio else deduped[0]
        if NO_SUBTITLE_MARKERS_RE.search(title):
            subtitles = None
        elif SUBTITLE_MARKERS_RE.search(title):
            subtitles = ", ".join(deduped[:3])
        else:
            subtitles = None
        return dub or None, subtitles or None

    def _extract_date(self, row: str) -> str | None:
        m = DATE_RE.search(row)
        if not m:
            return None
        try:
            day = int(m.group(1))
            month = _RU_MONTHS.get(m.group(2).lower())
            year = 2000 + int(m.group(3))
            if not month:
                return None
            dt = datetime(year, month, day, tzinfo=UTC)
            return dt.isoformat().replace("+00:00", "Z")
        except (ValueError, TypeError):
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
