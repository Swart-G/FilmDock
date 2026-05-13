from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
from datetime import UTC, datetime
from hashlib import sha1
from html import unescape
import gzip
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus, urlparse
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut
from app.services.torrent_identity import TorrentIdentityService

PROVIDER_NAME = "nnm-club"

# NNM-Club uses prow1/prow2 row classes
ROW_RE = re.compile(r'<tr[^>]+class="prow[12]"[^>]*>(.*?)</tr>', re.IGNORECASE | re.DOTALL)
TOPIC_RE = re.compile(r'href="viewtopic\.php\?t=(\d+)"[^>]*>(?:<b>)?(.*?)(?:</b>)?</a>', re.IGNORECASE | re.DOTALL)
DL_RE = re.compile(r'href="(download\.php\?id=\d+)"', re.IGNORECASE)
# Seeds/leechers wrapped in <b> tags: <td class="seedmed"><b>N</b></td>
SEEDS_RE = re.compile(r'class="seedmed"[^>]*>\s*(?:<[^>]+>)*\s*(\d+)', re.IGNORECASE | re.DOTALL)
LEECH_RE = re.compile(r'class="leechmed"[^>]*>\s*(?:<[^>]+>)*\s*(\d+)', re.IGNORECASE | re.DOTALL)
# Size: <u>BYTES</u> HUMAN  — use underline-wrapped bytes value
SIZE_BYTES_RE = re.compile(r'<u>(\d+)</u>', re.IGNORECASE)
SIZE_HUMAN_RE = re.compile(r'([\d.,]+)\s*(TB|ТБ|GB|ГБ|MB|МБ|KB|КБ|B)', re.IGNORECASE)
# Timestamp: <u>TIMESTAMP</u> DD-MM-YYYY
TS_RE = re.compile(r'title="Торрент-файл добавлен"[^>]*>\s*<u>(\d+)</u>', re.IGNORECASE | re.DOTALL)

SIZE_FACTORS: dict[str, int] = {
    "B": 1,
    "KB": 1024, "КБ": 1024,
    "MB": 1024 * 1024, "МБ": 1024 * 1024,
    "GB": 1024 * 1024 * 1024, "ГБ": 1024 * 1024 * 1024,
    "TB": 1024 * 1024 * 1024 * 1024, "ТБ": 1024 * 1024 * 1024 * 1024,
}

QUALITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("2160p", re.compile(r"\b(?:2160p|4k|uhd)\b", re.IGNORECASE)),
    ("1080p", re.compile(r"\b(?:1080p|1080i)\b", re.IGNORECASE)),
    ("720p",  re.compile(r"\b720p\b",              re.IGNORECASE)),
    ("480p",  re.compile(r"\b(?:480p|dvdrip)\b",   re.IGNORECASE)),
]

LANGUAGE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("RU", re.compile(r"(?<![\w])(?:ru|rus|русск?|рус(?:ский|ская|ские)?)(?![\w])", re.IGNORECASE)),
    ("EN", re.compile(r"(?<![\w])(?:en|eng|english|англ(?:ийский)?)(?![\w])", re.IGNORECASE)),
    ("UA", re.compile(r"(?<![\w])(?:ua|ukr|укр(?:аинский)?)(?![\w])", re.IGNORECASE)),
]
AUDIO_MARKERS_RE = re.compile(r"(?:озвуч|дубляж|дублир|audio|dub|dvo|mvo|проф(?:ессиональн)?|лиценз)", re.IGNORECASE)
SUBTITLE_MARKERS_RE = re.compile(r"(?:subtitles?|subs?|субт|сабы|hardsub|softsub)", re.IGNORECASE)
NO_SUBTITLE_MARKERS_RE = re.compile(r"(?:без\s+субт|no\s+subs?)", re.IGNORECASE)


class NnmClubProvider:
    def __init__(self) -> None:
        mirrors = [m.strip().rstrip("/") for m in settings.nnmclub_mirrors if m.strip()]
        self.mirrors = mirrors or ["https://nnmclub.to"]
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
        page = self._fetch(f"{mirror}/forum/tracker.php?nm={quote_plus(query)}", timeout)
        if page:
            rows = self._parse(page, mirror)
            if rows:
                return rows
        return []

    def _fetch(self, url: str, timeout: float) -> str:
        request = Request(
            url,
            headers={
                "User-Agent": "FilmDockBot/1.0",
                "Accept-Encoding": "gzip",
                "Accept": "text/html",
                "Referer": url.split("/forum")[0] + "/",
            },
        )
        try:
            with urlopen(request, timeout=timeout) as resp:
                raw = resp.read(1024 * 1024)
                if resp.headers.get("Content-Encoding", "").lower().startswith("gzip"):
                    raw = gzip.decompress(raw)
                # NNM-Club sends cp1251
                charset = resp.headers.get_content_charset() or "cp1251"
                return raw.decode(charset, errors="replace")
        except (URLError, HTTPError, OSError):
            return ""

    def _parse(self, page: str, mirror: str) -> list[TorrentResultOut]:
        host = urlparse(mirror).netloc or PROVIDER_NAME
        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        parsed: list[TorrentResultOut] = []

        for row in ROW_RE.findall(page):
            m = TOPIC_RE.search(row)
            if not m:
                continue
            topic_id = m.group(1)
            title = self._clean(m.group(2))
            if not title:
                continue

            # Download URL from explicit download.php link
            dl_m = DL_RE.search(row)
            download_url = f"{mirror}/forum/{dl_m.group(1)}" if dl_m else f"{mirror}/forum/dl.php?t={topic_id}"

            info_hash = sha1(f"{PROVIDER_NAME}:{topic_id}".encode()).hexdigest()

            seeders = self._extract_int(SEEDS_RE, row)
            leechers = self._extract_int(LEECH_RE, row)
            size_bytes = self._extract_size(row)
            published_at = self._extract_date(row) or now_iso
            resolution = self._extract_resolution(title)
            dub, subtitles = self._extract_languages(title)

            tags = [PROVIDER_NAME]
            if resolution:
                tags.append(resolution)
            if dub:
                tags.append(dub)

            parsed.append(TorrentResultOut(
                info_hash=info_hash,
                title=title,
                provider=PROVIDER_NAME,
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

    def _extract_int(self, pattern: re.Pattern[str], text: str) -> int:
        m = pattern.search(text)
        if not m:
            return 0
        try:
            return int(m.group(1))
        except (ValueError, IndexError):
            return 0

    def _extract_size(self, row: str) -> int | None:
        # Prefer the underline-wrapped raw byte count
        ul_m = SIZE_BYTES_RE.search(row)
        if ul_m:
            val = int(ul_m.group(1))
            if val > 1024:
                return val
        # Fall back to human-readable
        clean = self._clean(row)
        hm = SIZE_HUMAN_RE.search(clean)
        if hm:
            try:
                amount = float(hm.group(1).replace(",", "."))
                factor = SIZE_FACTORS.get(hm.group(2).upper(), 1)
                return int(amount * factor)
            except ValueError:
                pass
        return None

    def _extract_date(self, row: str) -> str | None:
        m = TS_RE.search(row)
        if not m:
            # Fallback: any large underlined number that looks like a Unix timestamp
            for ul_m in SIZE_BYTES_RE.finditer(row):
                ts = int(ul_m.group(1))
                if 946_684_800 <= ts <= 2_000_000_000:
                    try:
                        return datetime.fromtimestamp(ts, tz=UTC).isoformat().replace("+00:00", "Z")
                    except (ValueError, OSError):
                        pass
            return None
        try:
            ts = int(m.group(1))
            return datetime.fromtimestamp(ts, tz=UTC).isoformat().replace("+00:00", "Z")
        except (ValueError, OSError):
            return None

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
