from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings


@dataclass(slots=True)
class JellyfinResponse:
    status: int
    data: object | None


class JellyfinClientError(Exception):
    pass


class JellyfinConfigurationError(JellyfinClientError):
    pass


class JellyfinRequestError(JellyfinClientError):
    def __init__(self, status_code: int, message: str, details: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


class JellyfinNetworkError(JellyfinClientError):
    pass


class JellyfinClient:
    def _base_url(self) -> str:
        if not settings.jellyfin_base_url or not settings.jellyfin_api_key:
            raise JellyfinConfigurationError("Jellyfin base URL or API key is not configured")
        return settings.jellyfin_base_url.rstrip("/")

    def _headers(self, content_type_json: bool = False) -> dict[str, str]:
        token = str(settings.jellyfin_api_key)
        headers = {
            "Accept": "application/json",
            "X-Emby-Token": token,
            "X-MediaBrowser-Token": token,
            "Authorization": f'MediaBrowser Token="{token}"',
        }
        if content_type_json:
            headers["Content-Type"] = "application/json"
        return headers

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        payload: dict[str, object] | None = None,
    ) -> JellyfinResponse:
        base_url = self._base_url()
        query = ""
        if params:
            query = "?" + urlencode({k: str(v) for k, v in params.items() if v is not None})
        url = f"{base_url}{path}{query}"
        body = None
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
        request = Request(
            url,
            data=body,
            headers=self._headers(content_type_json=payload is not None),
            method=method.upper(),
        )
        try:
            with urlopen(request, timeout=10) as response:
                response_body = response.read().decode("utf-8") if response.length != 0 else ""
                if not response_body:
                    return JellyfinResponse(status=response.status, data=None)
                try:
                    parsed = json.loads(response_body)
                except json.JSONDecodeError:
                    parsed = response_body
                return JellyfinResponse(status=response.status, data=parsed)
        except HTTPError as error:
            raw = error.read().decode("utf-8", errors="replace")
            message = f"Jellyfin request failed with status {error.code}"
            try:
                parsed = json.loads(raw) if raw else {}
                if isinstance(parsed, dict):
                    detail_message = parsed.get("Message") or parsed.get("message")
                    if isinstance(detail_message, str) and detail_message.strip():
                        message = detail_message
            except json.JSONDecodeError:
                pass
            raise JellyfinRequestError(status_code=error.code, message=message, details=raw or None) from error
        except URLError as error:
            raise JellyfinNetworkError(f"Jellyfin is unreachable: {error.reason}") from error

    def virtual_folders(self) -> list[dict[str, object]]:
        response = self.request("GET", "/Library/VirtualFolders")
        if isinstance(response.data, list):
            return [item for item in response.data if isinstance(item, dict)]
        return []

    def users(self) -> list[dict[str, object]]:
        response = self.request("GET", "/Users")
        if isinstance(response.data, list):
            return [item for item in response.data if isinstance(item, dict)]
        return []

    def find_user_by_name(self, username: str) -> dict[str, object] | None:
        normalized = username.strip().lower()
        if not normalized:
            return None
        for user in self.users():
            name = str(user.get("Name") or user.get("name") or "").strip().lower()
            if name == normalized:
                return user
        return None

    def set_user_folder_access(self, *, user_id: str, folder_ids: list[str]) -> bool:
        response = self.request("GET", f"/Users/{user_id}")
        if not isinstance(response.data, dict):
            return False
        policy = response.data.get("Policy")
        if not isinstance(policy, dict):
            return False
        if bool(policy.get("IsAdministrator")):
            return False

        cleaned_folder_ids: list[str] = []
        seen: set[str] = set()
        for folder_id in folder_ids:
            normalized = str(folder_id).strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            cleaned_folder_ids.append(normalized)

        policy["EnableAllFolders"] = False
        policy["EnabledFolders"] = cleaned_folder_ids
        self.request("POST", f"/Users/{user_id}/Policy", payload=policy)
        return True

    def ensure_virtual_folder(self, *, name: str, collection_type: str, path: str) -> dict[str, object]:
        normalized_path = path.strip()
        if not normalized_path:
            raise JellyfinConfigurationError("Jellyfin library path is empty.")

        folders = self.virtual_folders()
        for folder in folders:
            locations = folder.get("Locations")
            if isinstance(locations, list) and normalized_path in locations:
                return {"created": False, "name": folder.get("Name"), "path": normalized_path}

        existing_names = {str(folder.get("Name") or "").strip() for folder in folders if folder.get("Name")}
        candidate = name.strip() or "FilmDock Library"
        if candidate in existing_names:
            suffix = 2
            while f"{candidate} {suffix}" in existing_names:
                suffix += 1
            candidate = f"{candidate} {suffix}"

        self.request(
            "POST",
            "/Library/VirtualFolders",
            params={
                "name": candidate,
                "collectionType": collection_type,
                "paths": normalized_path,
            },
        )
        return {"created": True, "name": candidate, "path": normalized_path}

    def refresh_library(self) -> None:
        self.request("POST", "/Library/Refresh")

    def search_items(self, *, search_term: str, include_item_types: str, limit: int = 50) -> list[dict[str, object]]:
        if not search_term.strip():
            return []
        response = self.request(
            "GET",
            "/Items",
            params={
                "Recursive": "true",
                "SearchTerm": search_term.strip(),
                "IncludeItemTypes": include_item_types,
                "Fields": "Path",
                "Limit": max(1, min(limit, 200)),
            },
        )
        if not isinstance(response.data, dict):
            return []
        raw_items = response.data.get("Items")
        if not isinstance(raw_items, list):
            return []
        return [item for item in raw_items if isinstance(item, dict)]

    def list_items(
        self,
        *,
        include_item_types: str,
        fields: str = "Path",
        limit: int = 200,
    ) -> list[dict[str, object]]:
        safe_limit = max(1, min(limit, 200))
        start_index = 0
        items: list[dict[str, object]] = []

        while True:
            response = self.request(
                "GET",
                "/Items",
                params={
                    "Recursive": "true",
                    "IncludeItemTypes": include_item_types,
                    "Fields": fields,
                    "StartIndex": start_index,
                    "Limit": safe_limit,
                },
            )
            if not isinstance(response.data, dict):
                break

            raw_items = response.data.get("Items")
            if not isinstance(raw_items, list) or not raw_items:
                break

            batch = [item for item in raw_items if isinstance(item, dict)]
            items.extend(batch)
            start_index += len(raw_items)

            total_raw = response.data.get("TotalRecordCount")
            try:
                total_count = int(total_raw) if total_raw is not None else None
            except (TypeError, ValueError):
                total_count = None

            if len(raw_items) < safe_limit:
                break
            if total_count is not None and start_index >= total_count:
                break

        return items

    def delete_item(self, item_id: str) -> bool:
        normalized = item_id.strip()
        if not normalized:
            return False
        self.request("DELETE", f"/Items/{normalized}")
        return True

    def status(self) -> dict[str, object]:
        configured = bool(settings.jellyfin_base_url and settings.jellyfin_api_key)
        public_ok = bool(settings.jellyfin_public_base_url or settings.jellyfin_base_url)
        if not configured:
            return {
                "status": "misconfigured",
                "reachable": False,
                "auth_ok": False,
                "api_key_configured": bool(settings.jellyfin_api_key),
                "public_base_ok": public_ok,
                "user_provisioned": False,
                "libraries_provisioned": False,
                "message": "Set SWARTTUBE_JELLYFIN_BASE_URL and SWARTTUBE_JELLYFIN_API_KEY.",
            }
        try:
            self.request("GET", "/System/Info")
            folders = self.virtual_folders()
            has_library_paths = any(
                isinstance(folder.get("Locations"), list) and len(folder.get("Locations") or []) > 0
                for folder in folders
            )
            return {
                "status": "ok",
                "reachable": True,
                "auth_ok": True,
                "api_key_configured": True,
                "public_base_ok": public_ok,
                "user_provisioned": True,
                "libraries_provisioned": has_library_paths,
                "message": (
                    "Jellyfin is reachable and authenticated."
                    if has_library_paths
                    else "Jellyfin is reachable, but libraries are not configured yet."
                ),
            }
        except JellyfinRequestError as error:
            return {
                "status": "degraded",
                "reachable": True,
                "auth_ok": False if error.status_code in {401, 403} else True,
                "api_key_configured": True,
                "public_base_ok": public_ok,
                "user_provisioned": False,
                "libraries_provisioned": False,
                "message": f"Jellyfin responded with HTTP {error.status_code}.",
            }
        except JellyfinNetworkError as error:
            return {
                "status": "degraded",
                "reachable": False,
                "auth_ok": False,
                "api_key_configured": True,
                "public_base_ok": public_ok,
                "user_provisioned": False,
                "libraries_provisioned": False,
                "message": str(error),
            }
