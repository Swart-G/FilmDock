from __future__ import annotations

from app import repositories
from app.services.download_permissions import ensure_download_path
from app.services.jellyfin_client import JellyfinClient


class JellyfinAccessService:
    def __init__(self, client: JellyfinClient | None = None):
        self._client = client or JellyfinClient()

    @staticmethod
    def user_media_root(user_id: str, media_type: str) -> str:
        kind = "series" if media_type == "series" else "movies"
        return f"/downloads/users/{user_id}/{kind}"

    @staticmethod
    def public_media_root(media_type: str) -> str:
        kind = "series" if media_type == "series" else "movies"
        return f"/downloads/public/{kind}"

    def ensure_public_libraries(self) -> None:
        movies_root = self.public_media_root("movie")
        series_root = self.public_media_root("series")
        ensure_download_path(movies_root)
        ensure_download_path(series_root)
        self._client.ensure_virtual_folder(
            name="FilmDock Public Movies",
            collection_type="movies",
            path=movies_root,
        )
        self._client.ensure_virtual_folder(
            name="FilmDock Public Series",
            collection_type="tvshows",
            path=series_root,
        )

    def ensure_user_libraries(self, *, user_id: str, username: str) -> None:
        movies_root = self.user_media_root(user_id, "movie")
        series_root = self.user_media_root(user_id, "series")
        ensure_download_path(movies_root)
        ensure_download_path(series_root)
        label = (username or user_id).strip() or user_id
        self._client.ensure_virtual_folder(
            name=f"FilmDock {label} Movies",
            collection_type="movies",
            path=movies_root,
        )
        self._client.ensure_virtual_folder(
            name=f"FilmDock {label} Series",
            collection_type="tvshows",
            path=series_root,
        )

    def sync_user_policy(self, user: dict[str, object]) -> dict[str, object]:
        role = str(user.get("role") or "user")
        username = str(user.get("username") or "").strip()
        user_id = str(user.get("id") or "").strip()
        if not user_id or not username:
            return {"updated": False, "reason": "invalid_user_payload"}
        if role == "admin":
            return {"updated": False, "reason": "admin_user"}

        self.ensure_user_libraries(user_id=user_id, username=username)
        self.ensure_public_libraries()
        folder_ids = self._folder_ids_for_user(user_id)
        jellyfin_user = self._client.find_user_by_name(username)
        if jellyfin_user is None:
            return {"updated": False, "reason": "jellyfin_user_not_found", "username": username}

        jellyfin_user_id = str(jellyfin_user.get("Id") or jellyfin_user.get("id") or "").strip()
        if not jellyfin_user_id:
            return {"updated": False, "reason": "jellyfin_user_id_missing", "username": username}

        changed = self._client.set_user_folder_access(user_id=jellyfin_user_id, folder_ids=folder_ids)
        return {
            "updated": bool(changed),
            "username": username,
            "folders": folder_ids,
        }

    def sync_all_user_policies(self) -> list[dict[str, object]]:
        results: list[dict[str, object]] = []
        for user in repositories.list_users():
            results.append(self.sync_user_policy(user))
        return results

    def _folder_ids_for_user(self, user_id: str) -> list[str]:
        folders = self._client.virtual_folders()
        path_to_id: dict[str, str] = {}
        for folder in folders:
            folder_id = str(folder.get("ItemId") or folder.get("Id") or folder.get("id") or "").strip()
            if not folder_id:
                continue
            locations = folder.get("Locations")
            if not isinstance(locations, list):
                continue
            for location in locations:
                if not isinstance(location, str):
                    continue
                normalized = location.rstrip("/")
                if normalized:
                    path_to_id[normalized] = folder_id

        allowed_paths = [
            self.user_media_root(user_id, "movie"),
            self.user_media_root(user_id, "series"),
            self.public_media_root("movie"),
            self.public_media_root("series"),
        ]
        result: list[str] = []
        seen: set[str] = set()
        for path in allowed_paths:
            folder_id = path_to_id.get(path.rstrip("/"))
            if not folder_id or folder_id in seen:
                continue
            seen.add(folder_id)
            result.append(folder_id)
        return result
