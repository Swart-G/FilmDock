from __future__ import annotations

import json
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener

from app.core.config import settings


class QBittorrentClient:
    def __init__(self) -> None:
        self.base_url = settings.qbittorrent_base_url
        self.username = settings.qbittorrent_admin_username
        self.password = settings.qbittorrent_admin_password

    def add_torrent(
        self,
        info_hash: str,
        *,
        magnet_url: str | None = None,
        download_url: str | None = None,
        save_path: str | None = None,
        category: str | None = None,
    ) -> dict[str, object]:
        source = magnet_url or download_url
        if not source:
            raise RuntimeError("No torrent source provided. Use magnet_url or download_url.")

        opener = self._login_opener()
        payload = {
            "urls": source,
        }
        if save_path:
            payload["savepath"] = save_path
        if category:
            payload["category"] = category
        encoded_payload = urlencode(payload).encode("utf-8")
        body = ""
        request = Request(
            f"{self.base_url}/api/v2/torrents/add",
            data=encoded_payload,
            method="POST",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": f"{self.base_url}/",
                "Origin": self.base_url,
            },
        )
        try:
            with opener.open(request, timeout=15) as response:
                body = response.read().decode("utf-8", errors="replace").strip()
                if response.status != 200:
                    raise RuntimeError(f"qBittorrent add failed with HTTP {response.status}.")
                if body not in {"", "Ok.", "Fails."}:
                    raise RuntimeError(f"qBittorrent rejected torrent add request: {body}")
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace").strip()
            if exc.code == 415:
                raise RuntimeError("qBittorrent rejected torrent source format.") from exc
            if exc.code in {401, 403}:
                raise RuntimeError("qBittorrent session is unauthorized.") from exc
            if error_body:
                raise RuntimeError(f"qBittorrent add HTTP {exc.code}: {error_body}") from exc
            raise RuntimeError(f"qBittorrent add HTTP {exc.code}.") from exc
        except URLError as exc:
            raise RuntimeError("qBittorrent is unreachable.") from exc

        torrent = self._get_torrent_with_opener(info_hash, opener=opener)
        if body == "Fails." and torrent is None:
            raise RuntimeError("qBittorrent rejected torrent add request: Fails.")
        return {
            "accepted": True,
            "info_hash": info_hash,
            "message": "Torrent forwarded to qBittorrent." if body != "Fails." else "Torrent already existed in qBittorrent.",
            "present_in_qb": torrent is not None,
            "torrent": torrent,
        }

    def create_webui_session(self) -> str:
        opener = self._login_opener()
        for handler in opener.handlers:
            cookie_jar = getattr(handler, "cookiejar", None)
            if cookie_jar is None:
                continue
            for cookie in cookie_jar:
                if cookie.name == "SID":
                    return cookie.value
        raise RuntimeError("qBittorrent login succeeded but SID cookie is missing.")

    def list_torrents(self, info_hashes: list[str] | None = None) -> list[dict[str, object]]:
        opener = self._login_opener()
        return self._list_torrents_with_opener(opener=opener, info_hashes=info_hashes)

    def get_torrent(self, info_hash: str) -> dict[str, object] | None:
        opener = self._login_opener()
        return self._get_torrent_with_opener(info_hash, opener=opener)

    def set_torrent_location(self, info_hash: str, location: str) -> bool:
        normalized = info_hash.strip().lower()
        normalized_location = location.strip()
        if not normalized or not normalized_location:
            return False

        opener = self._login_opener()
        payload = {
            "hashes": normalized,
            "location": normalized_location,
        }
        encoded_payload = urlencode(payload).encode("utf-8")
        request = Request(
            f"{self.base_url}/api/v2/torrents/setLocation",
            data=encoded_payload,
            method="POST",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": f"{self.base_url}/",
                "Origin": self.base_url,
            },
        )
        try:
            with opener.open(request, timeout=30) as response:
                if response.status != 200:
                    raise RuntimeError(f"qBittorrent location update failed with HTTP {response.status}.")
                return True
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace").strip()
            if exc.code in {401, 403}:
                raise RuntimeError("qBittorrent session is unauthorized.") from exc
            if error_body:
                raise RuntimeError(f"qBittorrent location update HTTP {exc.code}: {error_body}") from exc
            raise RuntimeError(f"qBittorrent location update HTTP {exc.code}.") from exc
        except URLError as exc:
            raise RuntimeError("qBittorrent is unreachable.") from exc

    def delete_torrent(self, info_hash: str, *, delete_files: bool = True) -> dict[str, bool]:
        normalized = info_hash.strip().lower()
        if not normalized:
            raise RuntimeError("Torrent info hash is empty.")

        opener = self._login_opener()
        existing = self._get_torrent_with_opener(normalized, opener=opener)
        if existing is None:
            return {
                "removed_from_qb": False,
                "deleted_files": False,
            }
        payload = {
            "hashes": normalized,
            "deleteFiles": "true" if delete_files else "false",
        }
        encoded_payload = urlencode(payload).encode("utf-8")
        request = Request(
            f"{self.base_url}/api/v2/torrents/delete",
            data=encoded_payload,
            method="POST",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": f"{self.base_url}/",
                "Origin": self.base_url,
            },
        )
        try:
            with opener.open(request, timeout=15) as response:
                if response.status != 200:
                    raise RuntimeError(f"qBittorrent delete failed with HTTP {response.status}.")
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace").strip()
            if exc.code in {401, 403}:
                raise RuntimeError("qBittorrent session is unauthorized.") from exc
            if error_body:
                raise RuntimeError(f"qBittorrent delete HTTP {exc.code}: {error_body}") from exc
            raise RuntimeError(f"qBittorrent delete HTTP {exc.code}.") from exc
        except URLError as exc:
            raise RuntimeError("qBittorrent is unreachable.") from exc

        remaining = self._get_torrent_with_opener(normalized, opener=opener)
        removed = remaining is None
        return {
            "removed_from_qb": bool(removed),
            "deleted_files": bool(delete_files and removed),
        }

    def _login_opener(self):
        cookie_jar = CookieJar()
        opener = build_opener(HTTPCookieProcessor(cookie_jar))
        payload = urlencode({"username": self.username, "password": self.password}).encode("utf-8")
        request = Request(
            f"{self.base_url}/api/v2/auth/login",
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": f"{self.base_url}/",
                "Origin": self.base_url,
            },
        )
        try:
            with opener.open(request, timeout=10) as response:
                body = response.read().decode("utf-8", errors="replace").strip()
                if response.status != 200 or body != "Ok.":
                    raise RuntimeError("qBittorrent login failed.")
        except HTTPError as exc:
            if exc.code == 401:
                raise RuntimeError("qBittorrent rejected admin credentials.") from exc
            raise RuntimeError(f"qBittorrent login HTTP error: {exc.code}.") from exc
        except URLError as exc:
            raise RuntimeError("qBittorrent WebUI is unreachable.") from exc

        has_sid_cookie = any(cookie.name == "SID" for cookie in cookie_jar)
        if not has_sid_cookie:
            raise RuntimeError("qBittorrent login succeeded but SID cookie is missing.")
        return opener

    def _list_torrents_with_opener(self, opener, info_hashes: list[str] | None = None) -> list[dict[str, object]]:
        query = ""
        if info_hashes:
            normalized = [item.strip().lower() for item in info_hashes if item and item.strip()]
            if normalized:
                query = "?" + urlencode({"hashes": "|".join(normalized)})
        request = Request(
            f"{self.base_url}/api/v2/torrents/info{query}",
            method="GET",
            headers={
                "Accept": "application/json",
                "Referer": f"{self.base_url}/",
                "Origin": self.base_url,
            },
        )
        try:
            with opener.open(request, timeout=15) as response:
                body = response.read().decode("utf-8", errors="replace")
                if not body.strip():
                    return []
                parsed = json.loads(body)
                if isinstance(parsed, list):
                    return [item for item in parsed if isinstance(item, dict)]
                return []
        except HTTPError as exc:
            if exc.code in {401, 403}:
                raise RuntimeError("qBittorrent session is unauthorized.") from exc
            raise RuntimeError(f"qBittorrent status fetch HTTP {exc.code}.") from exc
        except URLError as exc:
            raise RuntimeError("qBittorrent is unreachable.") from exc
        except json.JSONDecodeError as exc:
            raise RuntimeError("qBittorrent returned malformed JSON.") from exc

    def _get_torrent_with_opener(self, info_hash: str, *, opener) -> dict[str, object] | None:
        normalized = info_hash.strip().lower()
        if not normalized:
            return None
        items = self._list_torrents_with_opener(opener=opener, info_hashes=[normalized])
        for item in items:
            value = str(item.get("hash") or "").strip().lower()
            if value == normalized:
                return item
        return None
