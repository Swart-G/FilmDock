from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
from datetime import datetime
from typing import Protocol
import re
import time

from app.core.config import settings
from app.schemas.torrent import TorrentResultOut
from app.services.providers.animetosho import AnimeToshoProvider
from app.services.providers.apibay import ApiBayProvider
from app.services.providers.nyaa import NyaaProvider
from app.services.providers.rutor import RutorProvider
from app.services.providers.rutracker import RutrackerProvider
from app.services.providers.yts import YtsProvider

QUALITY_RANKS = {
    "2160p": 5,
    "1440p": 4,
    "1080p": 3,
    "720p": 2,
    "480p": 1,
}

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
            YtsProvider(),
            AnimeToshoProvider(),
            RutrackerProvider(),
            RutorProvider(),
            NyaaProvider(),
        ]
        self.providers: list[SearchProvider] = [self.primary_provider, *self.secondary_providers]

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

        deadline = time.monotonic() + max(float(settings.torrent_search_timeout_seconds), 1.0)
        max_results = max(int(settings.torrent_search_max_results), 1)
        min_results = max(int(settings.torrent_search_min_results), 1)
        target_results = max(min(int(settings.torrent_search_target_results), max_results), min_results)

        collected: list[TorrentResultOut] = []
        seen_hashes: set[str] = set()

        queries = [cleaned_query]
        if settings.torrent_search_query_expansion_enabled:
            queries.extend(self._query_variants(cleaned_query))

        primary_results = self._search_primary_variants(queries[:8], deadline)
        self._extend_unique(collected, seen_hashes, primary_results, limit=max_results)

        if settings.torrent_search_fallback_enabled and len(collected) < target_results:
            for search_query in queries:
                if len(collected) >= target_results or len(collected) >= max_results:
                    break
                secondary_results = self._search_secondary_providers(search_query, deadline)
                self._extend_unique(collected, seen_hashes, secondary_results, limit=max_results)
                if self._budget_seconds_left(deadline) <= 0:
                    break

        filtered = [
            item
            for item in collected
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

    def _search_primary_variants(self, queries: list[str], deadline: float) -> list[TorrentResultOut]:
        remaining = self._budget_seconds_left(deadline)
        if remaining <= 0:
            return []

        results: list[TorrentResultOut] = []
        unique_queries = list(dict.fromkeys(query for query in queries if query.strip()))
        if not unique_queries:
            return results

        timeout_per_query = max(min(remaining, 4.2), 1.4)
        workers = min(len(unique_queries), 5)
        pool = ThreadPoolExecutor(max_workers=workers)
        futures = [pool.submit(self.primary_provider.search, query, timeout_seconds=timeout_per_query) for query in unique_queries]
        try:
            try:
                for future in as_completed(futures, timeout=remaining + 0.1):
                    try:
                        results.extend(future.result())
                    except Exception:
                        continue
            except TimeoutError:
                for future in futures:
                    future.cancel()
        finally:
            pool.shutdown(wait=False, cancel_futures=True)
        return results

    def _search_secondary_providers(self, query: str, deadline: float) -> list[TorrentResultOut]:
        remaining = self._budget_seconds_left(deadline)
        if remaining <= 0:
            return []

        providers = self.secondary_providers
        if not providers:
            return []

        results: list[TorrentResultOut] = []
        timeout_per_provider = max(min(remaining, 2.0), 0.5)
        workers = min(len(providers), 5)
        pool = ThreadPoolExecutor(max_workers=workers)
        futures = [pool.submit(provider.search, query, timeout_seconds=timeout_per_provider) for provider in providers]
        try:
            try:
                for future in as_completed(futures, timeout=remaining + 0.1):
                    try:
                        results.extend(future.result())
                    except Exception:
                        continue
            except TimeoutError:
                for future in futures:
                    future.cancel()
        finally:
            pool.shutdown(wait=False, cancel_futures=True)
        return results

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
