from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
from datetime import datetime
from typing import Protocol
import re
import time

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut
from app.services.providers.anilibria import AnilibriaProvider
from app.services.providers.animetosho import AnimeToshoProvider
from app.services.providers.apibay import ApiBayProvider
from app.services.providers.kinozal import KinozalProvider
from app.services.providers.knaben import KnabenProvider
from app.services.providers.nnmclub import NnmClubProvider
from app.services.providers.nyaa import NyaaProvider
from app.services.providers.rutor import RutorProvider
from app.services.providers.rutracker import RutrackerProvider
from app.services.providers.rutracker_ru import RutrackerRuProvider
from app.services.providers.torrents_csv import TorrentsCsvProvider
from app.services.providers.yts import YtsProvider

QUALITY_RANKS = {
    "2160p": 5,
    "1440p": 4,
    "1080p": 3,
    "720p": 2,
    "480p": 1,
}

# Matches titles that are clearly NOT movies/series (games, software, music, books).
# Conservative: only high-confidence signals to minimise false positives.
_NON_VIDEO_RE = re.compile(
    r"""
    # ── Game signals ─────────────────────────────────────────────────────────

    # Version numbers in brackets: [v 1.5], [v 4.04a], [v 1.0.2.12] — only games do this
    \[v\s*\d+[\d._a-z\-]* |

    # GOG (game digital store) — standalone or with version
    \bGOG\b |

    # Game of the Year Edition — classic game marketing term
    \bGame\s+of\s+the\s+Year\s+Edition\b |

    # PC game repacks — "PC | RePack", "PC RePack"
    \bPC\s*[|/,]\s*[Rr]ePack\b |

    # Known game crack distributor names (very specific)
    \bFitGirl[\s\-]?[Rr]epack\b |
    \bDODI[\s\-]?[Rr]epack\b |
    \[[Rr]epack\]\s+by\b |
    \b(?:CODEX|SKIDROW|CPY|EMPRESS|PLAZA|HOODLUM|RAZZLE|RAZORDOX|PROPHET)\s+(?:crack|release)\b |

    # Versioned game releases: "Part I v.1.1.4", "Part II v 2.0"
    \bPart\s+[IVX]+\s+v\.?\s*\d+(?:\.\d+)+ |

    # DLC suffix in game titles: "Complete Edition + DLC", "[v 1.0 + DLC]"
    \+\s*DLC\b |

    # ── Software signals ─────────────────────────────────────────────────────
    \b(?:keygen|serial[\s\-]?key|activation[\s\-]?key|license[\s\-]?key)\b |

    # ── Books and audiobooks ─────────────────────────────────────────────────
    \baudiobook\b | \bаудиокниг[аи]?\b |
    \b(?:e\-?book|epub|fb2|djvu)\b |
    # "N книг из M", "(N книг" or "[Книга N-M]" — book collection indicators
    \(\d+\s+книг[а-я]* |
    \bкниг\s+из\s+\d+ |
    \[книга\s*\d |

    # ── Music (soundtrack as primary content, not as audio track in a film) ──
    # "OST - Movie Name" or "/ OST Movie" prefix formats = music torrent
    \bOST\s*[-—/]\s*(?=[А-ЯA-Z]) |
    \bOST\s*\w.*(?:FLAC|MP3|Hi[\-\s]?Res)\b |
    # Pure music releases: FLAC genre release (/ Поп /, / Rock /, / Jazz /)
    /\s*(?:Поп|Rock|Jazz|Рок|Электроника|Electronic|Hip[\-\s]?Hop|Blues|Country)\s*/ |
    # Hi-Res music in brackets
    \[\d+-bit\s+Hi[\-\s]?Res\] |
    # MP3/FLAC standalone at end: "(2024) MP3" or "(2024) FLAC" — music albums
    \(\d{4}\)\s+(?:MP3|FLAC|WAV|AAC)\s*(?:\[|$) |
    # MP3 year-range collection
    \(\d{4}[\-–]\d{4}\)\s+MP3\b |
    # FLAC audio release tags: [FLAC|Lossless|tracks] or [FLAC|WEB-DL|tracks]
    \[(?:FLAC|Lossless)\s*\| |
    # Various Artists compilation with audio format — clear music signal
    \bVA\s*[-–].*\b(?:MP3|FLAC|WAV|AAC|Lossless)\b |

    # ── Image/photo collections ───────────────────────────────────────────────
    \[(?:JPG|JPEG|PNG|RAW|PSD|AI)\] |
    \bСтоковые\s+изображения\b |

    # ── Music discography ────────────────────────────────────────────────────
    \bdiscography\b | \bдискографи |

    # ── Game/app file formats in title ───────────────────────────────────────
    \.(?:exe|msi|apk|ipa)\b
    """,
    re.VERBOSE | re.IGNORECASE,
)

WORD_RE = re.compile(r"[a-z0-9]+")
SEARCH_WORD_RE = re.compile(r"[a-zа-яё0-9]+", re.IGNORECASE)
CYRILLIC_TO_LATIN = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "i",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "h",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "shch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
}


class SearchProvider(Protocol):
    def search(self, query: str, *, timeout_seconds: float | None = None) -> list[TorrentResultOut]:
        ...


class TorrentSearchService:
    def __init__(self) -> None:
        self.primary_provider = ApiBayProvider()
        self.secondary_providers: list[SearchProvider] = [
            KnabenProvider(),
            TorrentsCsvProvider(),
            RutrackerRuProvider(),
            KinozalProvider(),
            RutrackerProvider(),
            RutorProvider(),
            NnmClubProvider(),
            AnilibriaProvider(),
            YtsProvider(),
            AnimeToshoProvider(),
            NyaaProvider(),
        ]
        self.providers: list[SearchProvider] = [self.primary_provider, *self.secondary_providers]

    # Max results contributed by the TPB/ApiBay provider — keeps room for Russian trackers.
    _PRIMARY_CAP = 80

    def search(
        self,
        query: str,
        *,
        resolution: str | None = None,
        dub: str | None = None,
        subtitles: str | None = None,
        min_seeders: int | None = None,
        min_leechers: int | None = None,
        min_size_bytes: int | None = None,
        max_size_bytes: int | None = None,
        sort_by: str = "relevance",
        sort_order: str = "desc",
    ) -> list[TorrentResultOut]:
        cleaned_query = query.strip()
        if not cleaned_query:
            return []

        timeout = max(float(settings.torrent_search_timeout_seconds), 1.0)
        max_results = max(int(settings.torrent_search_max_results), 1)

        queries = [cleaned_query]
        if settings.torrent_search_query_expansion_enabled:
            queries.extend(self._query_variants(cleaned_query))

        # Run ApiBay (primary) and all Russian/secondary providers fully in parallel.
        # Primary is capped to _PRIMARY_CAP so it doesn't crowd out everything else.
        primary_raw, secondary_raw = self._search_all_parallel(
            primary_query=cleaned_query,
            all_queries=queries[:6],
            timeout_seconds=timeout,
        )

        # Interleave: secondary (Russian) first, then fill with primary up to cap.
        collected: list[TorrentResultOut] = []
        seen: set[str] = set()
        self._extend_unique(collected, seen, secondary_raw, limit=max_results)
        self._extend_unique(collected, seen, primary_raw, limit=min(max_results, len(collected) + self._PRIMARY_CAP))

        # Drop obvious non-video content (games, audiobooks, software, etc.)
        video_only = [item for item in collected if not _NON_VIDEO_RE.search(item.title)]

        filtered = [
            item
            for item in video_only
            if self._matches_filters(
                item,
                resolution=resolution,
                dub=dub,
                subtitles=subtitles,
                min_seeders=min_seeders,
                min_leechers=min_leechers,
                min_size_bytes=min_size_bytes,
                max_size_bytes=max_size_bytes,
            )
        ]
        return self._sort(filtered, sort_by=sort_by, sort_order=sort_order, query=cleaned_query)

    def _budget_seconds_left(self, deadline: float) -> float:
        return max(0.0, deadline - time.monotonic())

    def _search_all_parallel(
        self,
        primary_query: str,
        all_queries: list[str],
        timeout_seconds: float,
    ) -> tuple[list[TorrentResultOut], list[TorrentResultOut]]:
        """Fire ApiBay (multiple query variants) and all secondary providers simultaneously.

        Returns (primary_results, secondary_results) so the caller can apply different caps.
        """
        unique_queries = list(dict.fromkeys(q for q in all_queries if q.strip()))
        if not unique_queries:
            unique_queries = [primary_query]

        # ApiBay tasks: one per query variant
        primary_tasks = [(self.primary_provider, q) for q in unique_queries]
        # Secondary tasks: each provider gets the main query only (avoids explosion of requests)
        secondary_tasks = [(provider, primary_query) for provider in self.secondary_providers]

        all_tasks = primary_tasks + secondary_tasks
        primary_count = len(primary_tasks)

        provider_timeout = max(timeout_seconds * 0.85, 2.0)
        workers = min(len(all_tasks), 16)
        pool = ThreadPoolExecutor(max_workers=workers)
        futures = [
            pool.submit(provider.search, query, timeout_seconds=provider_timeout)
            for provider, query in all_tasks
        ]
        primary_futures = set(futures[:primary_count])

        primary_raw: list[TorrentResultOut] = []
        secondary_raw: list[TorrentResultOut] = []
        try:
            try:
                for future in as_completed(futures, timeout=timeout_seconds + 0.5):
                    try:
                        items = future.result()
                    except Exception:
                        continue
                    if future in primary_futures:
                        primary_raw.extend(items)
                    else:
                        secondary_raw.extend(items)
            except TimeoutError:
                for f in futures:
                    f.cancel()
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

        return primary_raw, secondary_raw

    def _extend_unique(
        self,
        target: list[TorrentResultOut],
        seen_hashes: set[str],
        incoming: list[TorrentResultOut],
        *,
        limit: int,
    ) -> None:
        for item in incoming:
            info_hash = item.info_hash.lower()
            if not info_hash or info_hash in seen_hashes:
                continue
            seen_hashes.add(info_hash)
            target.append(item)
            if len(target) >= limit:
                return

    def _query_variants(self, query: str) -> list[str]:
        normalized = " ".join(query.lower().split())
        seen = {normalized}
        variants: list[str] = []

        stripped = self._strip_release_noise(normalized)
        self._push_query_variant(variants, seen, stripped)

        base_query = stripped or normalized
        for suffix in ("1080p", "2160p", "720p", "web-dl", "bluray", "season", "complete"):
            self._push_query_variant(variants, seen, f"{base_query} {suffix}")

        transliterated = self._transliterate_to_latin(stripped or normalized)
        self._push_query_variant(variants, seen, transliterated)

        ascii_words = " ".join(WORD_RE.findall(transliterated))
        self._push_query_variant(variants, seen, ascii_words)

        words = [token for token in WORD_RE.findall(ascii_words) if len(token) >= 2]
        if not words:
            return variants

        longest = max(words, key=len)
        self._push_query_variant(variants, seen, longest)

        for prefix_len in (6, 5, 4, 3, 2):
            if len(longest) >= prefix_len:
                self._push_query_variant(variants, seen, longest[:prefix_len])

        if len(words) > 1:
            self._push_query_variant(variants, seen, " ".join(words[:2]))
            self._push_query_variant(variants, seen, words[0])

        cyrillic_words = [token.lower() for token in SEARCH_WORD_RE.findall(stripped or normalized) if len(token) >= 2]
        if len(cyrillic_words) > 1:
            self._push_query_variant(variants, seen, " ".join(cyrillic_words[:2]))
            self._push_query_variant(variants, seen, cyrillic_words[0])

        return variants[:14]

    def _push_query_variant(self, target: list[str], seen: set[str], value: str) -> None:
        normalized = " ".join(value.lower().split())
        if len(normalized) < 2 or normalized in seen:
            return
        seen.add(normalized)
        target.append(normalized)

    def _transliterate_to_latin(self, value: str) -> str:
        return "".join(CYRILLIC_TO_LATIN.get(char, char) for char in value.lower())

    def _strip_release_noise(self, query: str) -> str:
        cleaned = re.sub(
            r"\b(?:2160p|1440p|1080p|1080i|720p|480p|4k|uhd|hdr|web[- ]?dl|webrip|bdrip|bluray|x264|x265|h\.?264|h\.?265|hevc|aac|dts|truehd|atmos)\b",
            " ",
            query,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"[\[\]()._,;:+|/\\-]+", " ", cleaned)
        return " ".join(cleaned.split())

    def _matches_filters(
        self,
        item: TorrentResultOut,
        *,
        resolution: str | None,
        dub: str | None,
        subtitles: str | None,
        min_seeders: int | None,
        min_leechers: int | None,
        min_size_bytes: int | None,
        max_size_bytes: int | None,
    ) -> bool:
        if resolution and (not item.resolution or item.resolution.lower() != resolution.lower()):
            return False
        if dub and (not item.dub or dub.lower() not in item.dub.lower()):
            return False
        if subtitles and (not item.subtitles or subtitles.lower() not in item.subtitles.lower()):
            return False
        if min_seeders is not None and item.seeders < min_seeders:
            return False
        if min_leechers is not None and item.leechers < min_leechers:
            return False
        if min_size_bytes is not None:
            if item.size_bytes is None or item.size_bytes < min_size_bytes:
                return False
        if max_size_bytes is not None and item.size_bytes is not None and item.size_bytes > max_size_bytes:
            return False
        return True

    def _sort(self, items: list[TorrentResultOut], *, sort_by: str, sort_order: str, query: str) -> list[TorrentResultOut]:
        reverse = sort_order == "desc"

        if sort_by == "seeders":
            key_fn = lambda item: item.seeders
        elif sort_by == "leechers":
            key_fn = lambda item: item.leechers
        elif sort_by == "size":
            key_fn = lambda item: item.size_bytes or 0
        elif sort_by == "date":
            key_fn = lambda item: self._to_timestamp(item.published_at)
        elif sort_by == "quality":
            key_fn = lambda item: self._quality_rank(item.resolution)
        else:
            normalized_query = self._transliterate_to_latin(query)
            key_fn = lambda item: (
                self._title_match_score(item.title, normalized_query),
                (item.seeders * 3) - item.leechers,
            )

        return sorted(items, key=key_fn, reverse=reverse)

    def _title_match_score(self, title: str, normalized_query: str) -> int:
        if not normalized_query:
            return 0
        query_tokens = [token for token in WORD_RE.findall(normalized_query) if len(token) >= 2]
        if not query_tokens:
            return 0
        normalized_title = self._transliterate_to_latin(title.lower())
        title_tokens = set(WORD_RE.findall(normalized_title))
        if not title_tokens:
            return 0

        score = 0
        for token in query_tokens:
            if token in title_tokens:
                score += 4
                continue
            if token in normalized_title:
                score += 2
                continue
            if len(token) >= 4 and token[:3] in normalized_title:
                score += 1
        return score

    def _quality_rank(self, resolution: str | None) -> int:
        if not resolution:
            return 0
        return QUALITY_RANKS.get(resolution.lower(), 0)

    def _to_timestamp(self, raw: str) -> float:
        normalized = raw.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized).timestamp()
        except ValueError:
            return 0.0
