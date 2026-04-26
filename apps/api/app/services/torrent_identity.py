from __future__ import annotations

from base64 import b32decode
from hashlib import sha1
from urllib.parse import parse_qs, unquote_plus, urlparse


class TorrentIdentityService:
    def normalize(self, info_hash: str) -> str:
        return info_hash.strip().lower()

    def extract_info_hash_from_magnet(self, magnet_url: str | None) -> str | None:
        if not magnet_url:
            return None
        lowered = magnet_url.lower()
        if not lowered.startswith("magnet:?"):
            return None
        parsed = urlparse(magnet_url)
        xt_values = parse_qs(parsed.query).get("xt", [])
        for value in xt_values:
            lowered_xt = value.lower()
            if not lowered_xt.startswith("urn:btih:"):
                continue
            raw_hash = value[9:].strip()
            normalized = self._normalize_btih(raw_hash)
            if normalized:
                return normalized
        return None

    def extract_display_name_from_magnet(self, magnet_url: str | None) -> str | None:
        if not magnet_url:
            return None
        parsed = urlparse(magnet_url)
        names = parse_qs(parsed.query).get("dn", [])
        if not names:
            return None
        candidate = unquote_plus(names[0]).strip()
        return candidate or None

    def derive_fallback_hash(self, value: str) -> str:
        return sha1(value.encode("utf-8")).hexdigest()

    def _normalize_btih(self, value: str) -> str | None:
        candidate = value.strip()
        if len(candidate) == 40 and all(ch in "0123456789abcdefABCDEF" for ch in candidate):
            return candidate.lower()
        if len(candidate) == 32:
            try:
                decoded = b32decode(candidate.upper())
            except Exception:
                return None
            return decoded.hex()
        return None
