from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
from datetime import UTC, datetime
from hashlib import sha1
from html import unescape
import gzip
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus, urlencode, urljoin, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener
from http.cookiejar import CookieJar

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut
from app.services.torrent_identity import TorrentIdentityService

PROVIDER_NAME = "kinozal"

# Match rows: class='first bg', class="bg", class=bg (unquoted), class='bg'
ROW_RE = re.compile(r'<tr[^>]+class=["\']?(?:first\s+)?bg["\']?[^>]*>(.*?)</tr>', re.IGNORECASE | re.DOTALL)
TITLE_LINK_RE = re.compile(r'<td[^>]+class=["\']?nam["\']?[^>]*>.*?<a\s+href="(/details\.php\?id=(\d+))"[^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
# Size cells: <td class='s'> or <td class="s"> – the 2nd 's' cell (after comment count) is the size
SIZE_CELLS_RE = re.compile(r"<td[^>]+class=[\"']?s[\"']?[^>]*>(.*?)</td>", re.IGNORECASE | re.DOTALL)
SEEDS_RE = re.compile(r"class=[\"']?sl_s[\"']?[^>]*>(\d+)<", re.IGNORECASE)
LEECH_RE = re.compile(r"class=[\"']?sl_p[\"']?[^>]*>(\d+)<", re.IGNORECASE)
DATE_RE = re.compile(r"class=[\"']?s[\"']?[^>]*>([\d.]+\s+в\s+[\d:]+)</td>", re.IGNORECASE)
HASH_RE = re.compile(r'(?:hash|infohash|btih)[:\s=]+([0-9a-fA-F]{40})', re.IGNORECASE)
MAGNET_RE = re.compile(r'href="(magnet:\?[^"]+)"', re.IGNORECASE)
SIZE_HUMAN_RE = re.compile(r'([\d.,]+)\s*(TB|GB|МБ|ГБ|MB|KB|КБ|B)', re.IGNORECASE)

SIZE_FACTORS: dict[str, int] = {
    "B": 1,
    "KB": 1024, "КБ": 1024,
    "MB": 1024 * 1024, "МБ": 1024 * 1024,
    "GB": 1024 * 1024 * 1024, "ГБ": 1024 * 1024 * 1024,
    "TB": 1024 * 1024 * 1024 * 1024,
}

QUALITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("2160p", re.compile(r"\b(?:2160p|4k|uhd)\b", re.IGNORECASE)),
    ("1080p", re.compile(r"\b(?:1080p|1080i)\b", re.IGNORECASE)),
    ("720p",  re.compile(r"\b720p\b",              re.IGNORECASE)),
    ("480p",  re.compile(r"\b(?:480p|dvdrip)\b",   re.IGNORECASE)),
]

LANGUAGE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    # Also catches "/ РУ /" format (standalone Cyrillic abbreviation used by kinozal)
    ("RU", re.compile(r"(?<![а-яА-Я\w])(?:ru|rus|russian|рус(?:ский|ская|ские|ск)?|русск?|ру(?=[/|,\s]))(?![а-яА-Я\w])", re.IGNORECASE)),
    ("EN", re.compile(r"(?<![\w])(?:en|eng|english|англ(?:ийский)?)(?![\w])", re.IGNORECASE)),
    ("UA", re.compile(r"(?<![\w])(?:ua|ukr|укр(?:аинский)?)(?![\w])", re.IGNORECASE)),
    ("DE", re.compile(r"(?<![\w])(?:de|deu|german|нем(?:ецкий)?)(?![\w])", re.IGNORECASE)),
]
# Russian audio type abbreviations used on kinozal: ДБ=дублированный, МВО=многоголосый,
# ДВО=двухголосый, ПМ=профессиональный моно, ПД=профессиональный дублированный, etc.
RU_AUDIO_ABBR_RE = re.compile(
    r"\b(?:дб|мво|дво|пм|пд|лм|ло|ап|пфр|кп|голос[a-я]*|дубляж|дублир|озвуч|лицензи)\b",
    re.IGNORECASE,
)
AUDIO_MARKERS_RE = re.compile(
    r"(?:озвуч|дубляж|дублир|audio|dub|dvo|mvo|пм[,\s/]|пд[,\s/]|дб[,\s/]|лм[,\s/]|мво[,\s/]|дво[,\s/]|проф(?:ессиональн)?|лиценз|ап[,\s/]|ло[,\s/]|авторск|голос)",
    re.IGNORECASE,
)
SUBTITLE_MARKERS_RE = re.compile(r"(?:subtitles?|subs?|субт|сабы|hardsub|softsub|\bст\b|субтитр)", re.IGNORECASE)
NO_SUBTITLE_MARKERS_RE = re.compile(r"(?:без\s+субт|no\s+subs?)", re.IGNORECASE)


class KinozalProvider:
    def __init__(self) -> None:
        mirrors = [m.strip().rstrip("/") for m in settings.kinozal_mirrors if m.strip()]
        self.mirrors = mirrors or ["https://kinozal.me"]
        self.timeout_seconds = max(float(settings.torrent_search_timeout_seconds), 1.0)
        self.max_results = max(int(settings.torrent_search_max_results), 1)
        self.username = (settings.kinozal_username or "").strip() or None
        self.password = (settings.kinozal_password or "").strip() or None
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
        opener = build_opener(HTTPCookieProcessor(CookieJar()))
        if self.username and self.password:
            self._login(opener, mirror, timeout)
        page = self._fetch_page(opener, mirror, query, timeout)
        return self._parse_rows(page, mirror, opener, timeout)

    def _login(self, opener: object, mirror: str, timeout: float) -> None:
        payload = urlencode({
            "username": self.username,
            "password": self.password,
            "returnto": "",
        }).encode("utf-8")
        request = Request(
            f"{mirror}/login.php",
            data=payload,
            method="POST",
            headers={
                "User-Agent": "FilmDockBot/1.0",
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": f"{mirror}/",
            },
        )
        try:
            with opener.open(request, timeout=timeout):
                pass
        except (URLError, HTTPError, OSError):
            pass

    def _fetch_page(self, opener: object, mirror: str, query: str, timeout: float) -> str:
        url = f"{mirror}/browse.php?s={quote_plus(query)}&c=0&v=0&d=0&w=0&t=0&f=0"
        request = Request(
            url,
            headers={
                "User-Agent": "FilmDockBot/1.0",
                "Accept-Encoding": "gzip",
                "Accept": "text/html,application/xhtml+xml",
                "Referer": f"{mirror}/",
            },
        )
        try:
            with opener.open(request, timeout=timeout) as resp:
                raw = resp.read(1024 * 1024)
                if resp.headers.get("Content-Encoding", "").lower().startswith("gzip"):
                    raw = gzip.decompress(raw)
                charset = resp.headers.get_content_charset() or "utf-8"
                return raw.decode(charset, errors="replace")
        except (URLError, HTTPError, OSError):
            return ""

    def _parse_rows(self, page: str, mirror: str, opener: object, timeout: float) -> list[TorrentResultOut]:
        if not page:
            return []
        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        # Use canonical provider name so mirrors don't create different provider labels
        host = PROVIDER_NAME
        parsed: list[TorrentResultOut] = []

        for row_html in ROW_RE.findall(page):
            title_match = TITLE_LINK_RE.search(row_html)
            if not title_match:
                continue
            detail_path = title_match.group(1)
            torrent_id = title_match.group(2)
            title = self._clean(title_match.group(3))
            if not title:
                continue

            size_bytes = self._extract_size(row_html)
            seeders = self._extract_int(SEEDS_RE, row_html)
            leechers = self._extract_int(LEECH_RE, row_html)
            published_at = self._extract_date(row_html) or now_iso
            resolution = self._extract_resolution(title)
            dub, subtitles = self._extract_languages(title)

            # Use canonical "kinozal" in hash so mirrors don't produce duplicates
            info_hash = sha1(f"kinozal:{torrent_id}".encode()).hexdigest()
            download_url = f"{mirror}/get_file.php?id={torrent_id}&get_file=get_file"

            tags = [host]
            if resolution:
                tags.append(resolution)
            if dub:
                tags.append(dub)
            if subtitles:
                tags.append(f"{subtitles} subs")

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

    def _extract_size(self, row: str) -> int | None:
        # The second <td class="s"> cell contains the size (first is comment count)
        cells = SIZE_CELLS_RE.findall(row)
        for cell in cells:
            text = self._clean(cell)
            hm = SIZE_HUMAN_RE.search(text)
            if hm:
                try:
                    amount = float(hm.group(1).replace(",", "."))
                    factor = SIZE_FACTORS.get(hm.group(2).upper(), 1)
                    return int(amount * factor)
                except ValueError:
                    continue
        return None

    def _extract_int(self, pattern: re.Pattern[str], text: str) -> int:
        m = pattern.search(text)
        if not m:
            return 0
        try:
            return int(m.group(1))
        except (ValueError, IndexError):
            return 0

    def _extract_date(self, row: str) -> str | None:
        m = DATE_RE.search(row)
        if not m:
            return None
        raw = m.group(1).strip().replace(" в ", " ")
        for fmt in ("%d.%m.%Y %H:%M", "%d.%m.%y %H:%M", "%d.%m.%Y", "%d.%m.%y"):
            try:
                dt = datetime.strptime(raw, fmt).replace(tzinfo=UTC)
                return dt.isoformat().replace("+00:00", "Z")
            except ValueError:
                continue
        return None

    def _extract_resolution(self, title: str) -> str | None:
        for res, pat in QUALITY_PATTERNS:
            if pat.search(title):
                return res
        return None

    def _extract_languages(self, title: str) -> tuple[str | None, str | None]:
        detected = [code for code, pat in LANGUAGE_PATTERNS if pat.search(title)]

        # Kinozal uses Russian audio abbreviations (ДБ, МВО, etc.) — treat as RU audio if found
        if not detected and RU_AUDIO_ABBR_RE.search(title):
            detected = ["RU"]

        if not detected:
            return None, None

        deduped = list(dict.fromkeys(detected))
        has_audio = AUDIO_MARKERS_RE.search(title) or RU_AUDIO_ABBR_RE.search(title)
        dub = ", ".join(deduped[:2]) if has_audio else deduped[0]
        if NO_SUBTITLE_MARKERS_RE.search(title):
            subtitles = None
        elif SUBTITLE_MARKERS_RE.search(title):
            subtitles = ", ".join(deduped[:3])
        else:
            subtitles = None
        return dub or None, subtitles or None

    def _format_size(self, size_bytes: int | None) -> str:
        if not size_bytes or size_bytes <= 0:
            return "n/a"
        for unit, factor in (("TB", 1024**4), ("GB", 1024**3), ("MB", 1024**2), ("KB", 1024)):
            if size_bytes >= factor:
                v = size_bytes / factor
                return f"{v:.0f} {unit}" if v >= 100 else f"{v:.1f} {unit}" if v >= 10 else f"{v:.2f} {unit}"
        return f"{size_bytes} B"
