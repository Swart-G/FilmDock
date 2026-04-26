from __future__ import annotations

import os
import re
import shutil
import time
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath

from app import repositories
from app.services.download_permissions import ensure_download_path
from app.services.jellyfin_access import JellyfinAccessService
from app.services.jellyfin_client import (
    JellyfinClient,
    JellyfinConfigurationError,
    JellyfinNetworkError,
    JellyfinRequestError,
)
from app.services.qbittorrent_client import QBittorrentClient

SERIES_HINT_RE = re.compile(
    r"(?i)(?:\bS\d{1,2}E\d{1,2}\b|\bseason\s*\d+\b|\bсезон\s*\d+\b|\bep(?:isode)?\s*\d+\b|\bсерия\b)"
)

QB_COMPLETED_STATES = {
    "uploading",
    "stalledup",
    "queuedup",
    "checkingup",
    "pausedup",
    "forcedup",
}

QB_DOWNLOADING_STATES = {
    "downloading",
    "forceddl",
    "stalleddl",
    "queueddl",
    "checkingdl",
    "metadl",
    "allocating",
    "checkingresumedata",
    "moving",
    "pauseddl",
    "stoppeddl",
}


def _timestamp_to_iso(timestamp: int | float | None) -> str | None:
    if not timestamp:
        return None
    try:
        value = int(timestamp)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    return datetime.fromtimestamp(value, tz=UTC).isoformat()


def _safe_int(value: object | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class TorrentPipelineService:
    def __init__(self, qb_client: QBittorrentClient | None = None, jellyfin_client: JellyfinClient | None = None) -> None:
        self.qb_client = qb_client or QBittorrentClient()
        self.jellyfin_client = jellyfin_client or JellyfinClient()
        self.jellyfin_access = JellyfinAccessService(self.jellyfin_client)
        self._last_refresh_at = 0.0
        self._last_permissions_sync_at = 0.0
        self._last_public_library_ensure_at = 0.0
        self._last_user_library_ensure_at: dict[str, float] = {}

    def infer_media_type(self, explicit_type: str | None, title: str | None) -> str:
        if explicit_type in {"movie", "series"}:
            return explicit_type
        if title and SERIES_HINT_RE.search(title):
            return "series"
        return "movie"

    def add_torrent(
        self,
        *,
        user_id: str,
        info_hash: str,
        media_item_id: str | None,
        media_title: str,
        media_type: str | None,
        magnet_url: str | None,
        download_url: str | None,
    ) -> dict[str, object]:
        resolved_title = media_title.strip() or "Unknown media"
        resolved_type = self.infer_media_type(media_type, resolved_title)

        existing_torrent = repositories.get_torrent(info_hash)
        if existing_torrent is not None and str(existing_torrent["owner_user_id"]) != user_id:
            raise RuntimeError("This torrent is already attached to another user queue.")

        media_item = repositories.ensure_media_item(
            media_item_id=media_item_id,
            media_type=resolved_type,
            title=resolved_title,
            year=None,
        )
        existing_asset_id = str(existing_torrent["asset_id"]) if existing_torrent and existing_torrent.get("asset_id") else None
        asset = repositories.ensure_asset_for_user(
            owner_user_id=user_id,
            media_item_id=str(media_item["id"]),
            media_type=resolved_type,
            title=resolved_title,
            year=media_item.get("year") if isinstance(media_item.get("year"), int) else None,
            existing_asset_id=existing_asset_id,
        )

        save_path = self.download_path_for_media_type(resolved_type, owner_user_id=user_id)

        qb_result = self.qb_client.add_torrent(
            info_hash,
            magnet_url=magnet_url,
            download_url=download_url,
            save_path=save_path,
            category=resolved_type,
        )
        qb_torrent = qb_result.get("torrent") if isinstance(qb_result, dict) else None
        runtime = self.runtime_from_qb(qb_torrent if isinstance(qb_torrent, dict) else None)

        repositories.upsert_torrent_record(
            info_hash=info_hash,
            owner_user_id=user_id,
            torrent_title=str((qb_torrent or {}).get("name") or f"{resolved_title} [{info_hash[:6]}]"),
            state=str(runtime["state"]),
            status_group=str(runtime["status_group"]),
            progress_percent=float(runtime["progress_percent"]),
            eta_seconds=runtime["eta_seconds"] if isinstance(runtime["eta_seconds"], int) else None,
            download_speed=runtime["download_speed"] if isinstance(runtime["download_speed"], int) else None,
            size_bytes=runtime["size_bytes"] if isinstance(runtime["size_bytes"], int) else None,
            downloaded_bytes=runtime["downloaded_bytes"] if isinstance(runtime["downloaded_bytes"], int) else None,
            added_at=runtime["added_at"] if isinstance(runtime["added_at"], str) else datetime.now(UTC).isoformat(),
            completed_at=runtime["completed_at"] if isinstance(runtime["completed_at"], str) else None,
            asset_id=str(asset["asset_id"]),
            media_item_id=str(media_item["id"]),
            media_type=resolved_type,
            media_title=resolved_title,
            can_watch=False,
            watch_reason="syncing",
        )

        self.sync_torrents([repositories.get_torrent(info_hash)] if repositories.get_torrent(info_hash) else [])
        return {
            "accepted": True,
            "mapped": True,
            "info_hash": info_hash,
            "message": "Torrent added to qBittorrent and linked to your library queue.",
        }

    def remove_torrent(self, *, user_id: str, info_hash: str) -> dict[str, object] | None:
        torrent = repositories.get_torrent(info_hash)
        if torrent is None or str(torrent["owner_user_id"]) != user_id:
            return None

        normalized_hash = str(torrent["info_hash"]).strip().lower()
        qb_delete_result = self.qb_client.delete_torrent(normalized_hash, delete_files=True)
        deleted_record = repositories.delete_torrent(normalized_hash, user_id)
        if deleted_record is None:
            return None
        self._cleanup_access_mirrors(deleted_record)
        self.purge_stale_jellyfin_items_for_torrent(
            deleted_record,
            include_owner=True,
            include_public=True,
        )
        self._maybe_refresh_jellyfin(force=True)
        self._maybe_sync_jellyfin_permissions(force=True)

        return {
            "torrent": deleted_record,
            "removed_from_qb": bool(qb_delete_result.get("removed_from_qb")),
            "deleted_files": bool(qb_delete_result.get("deleted_files")),
        }

    def purge_stale_jellyfin_items_for_torrent(
        self,
        torrent: dict[str, object],
        *,
        include_owner: bool,
        include_public: bool,
    ) -> None:
        info_hash = str(torrent.get("info_hash") or "").strip().lower()
        if not info_hash:
            return

        media_type = self.infer_media_type(
            str(torrent.get("media_type")) if torrent.get("media_type") else None,
            str(torrent.get("media_title") or ""),
        )

        prefixes: list[str] = []
        if include_owner:
            owner_user_id = str(torrent.get("owner_user_id") or "").strip()
            if owner_user_id:
                prefixes.append(str(Path(self.jellyfin_access.user_media_root(owner_user_id, media_type)) / info_hash))
        if include_public:
            prefixes.append(str(Path(self.jellyfin_access.public_media_root(media_type)) / info_hash))

        self._remove_stale_jellyfin_items_for_prefixes(prefixes)

    def sync_torrents(self, records: list[dict[str, object]]) -> None:
        normalized_records = [record for record in records if record is not None]
        if not normalized_records:
            return

        hashes = [str(record["info_hash"]).lower() for record in normalized_records]
        qb_map: dict[str, dict[str, object]] = {}
        try:
            qb_items = self.qb_client.list_torrents(hashes)
            qb_map = {str(item.get("hash") or "").lower(): item for item in qb_items if isinstance(item, dict)}
        except RuntimeError:
            return

        for record in normalized_records:
            info_hash = str(record["info_hash"]).lower()
            qb_payload = qb_map.get(info_hash)
            if qb_payload is None:
                self._handle_missing_qb_torrent(record)
                continue

            runtime = self.runtime_from_qb(qb_payload)
            updates: dict[str, object] = {
                "torrent_title": str(qb_payload.get("name") or record.get("torrent_title") or f"{info_hash[:6]}"),
                "state": runtime["state"],
                "status_group": runtime["status_group"],
                "progress_percent": runtime["progress_percent"],
                "eta_seconds": runtime["eta_seconds"],
                "download_speed": runtime["download_speed"],
                "size_bytes": runtime["size_bytes"],
                "downloaded_bytes": runtime["downloaded_bytes"],
                "added_at": runtime["added_at"] or record.get("added_at"),
                "completed_at": runtime["completed_at"],
            }

            if runtime["status_group"] == "completed":
                readiness = self._sync_completed_torrent(record, qb_payload)
                updates["can_watch"] = int(readiness["can_watch"])
                updates["watch_reason"] = readiness["watch_reason"]
                if readiness["asset_id"]:
                    updates["asset_id"] = readiness["asset_id"]
            else:
                updates["can_watch"] = 0
                updates["watch_reason"] = "syncing"
                asset_id = str(record["asset_id"]) if record.get("asset_id") else None
                if asset_id:
                    repositories.update_asset_fields(asset_id, {"state": "DOWNLOADING"})

            repositories.update_torrent_fields(info_hash, updates)

    def download_path_for_media_type(self, media_type: str, owner_user_id: str | None = None) -> str:
        if owner_user_id:
            root = self.jellyfin_access.user_media_root(owner_user_id, media_type)
            return ensure_download_path(root)
        return "/downloads/series" if media_type == "series" else "/downloads/movies"

    def runtime_from_qb(self, qb_payload: dict[str, object] | None) -> dict[str, object]:
        if not qb_payload:
            return {
                "state": "DOWNLOADING",
                "status_group": "downloading",
                "progress_percent": 0.0,
                "eta_seconds": None,
                "download_speed": None,
                "size_bytes": None,
                "downloaded_bytes": None,
                "added_at": datetime.now(UTC).isoformat(),
                "completed_at": None,
            }

        raw_state = str(qb_payload.get("state") or "").strip()
        lowered_state = raw_state.lower()
        progress_raw = qb_payload.get("progress")
        try:
            progress = float(progress_raw if progress_raw is not None else 0.0)
        except (TypeError, ValueError):
            progress = 0.0
        progress_percent = round(max(0.0, min(progress * 100.0, 100.0)), 2)
        is_completed = progress >= 0.999 or lowered_state in QB_COMPLETED_STATES

        if is_completed:
            status_group = "completed"
            state = "COMPLETED"
        elif lowered_state in QB_DOWNLOADING_STATES:
            status_group = "downloading"
            state = "DOWNLOADING"
        else:
            status_group = "downloading"
            state = raw_state.upper() if raw_state else "UNKNOWN"

        completion_on = _safe_int(qb_payload.get("completion_on"))
        eta = _safe_int(qb_payload.get("eta"))
        dlspeed = _safe_int(qb_payload.get("dlspeed"))
        total_size = _safe_int(qb_payload.get("total_size"))
        downloaded = _safe_int(qb_payload.get("downloaded"))
        added_on = _safe_int(qb_payload.get("added_on"))

        return {
            "state": state,
            "status_group": status_group,
            "progress_percent": progress_percent,
            "eta_seconds": eta if eta is not None and eta >= 0 else None,
            "download_speed": dlspeed if dlspeed is not None and dlspeed >= 0 else None,
            "size_bytes": total_size if total_size is not None and total_size > 0 else None,
            "downloaded_bytes": downloaded if downloaded is not None and downloaded >= 0 else None,
            "added_at": _timestamp_to_iso(added_on),
            "completed_at": _timestamp_to_iso(completion_on) if is_completed else None,
        }

    def _handle_missing_qb_torrent(self, record: dict[str, object]) -> None:
        if bool(record.get("can_watch")) and record.get("asset_id"):
            return
        repositories.update_torrent_fields(
            str(record["info_hash"]),
            {
                "state": "MISSING",
                "status_group": "downloading",
                "can_watch": 0,
                "watch_reason": "not_available",
            },
        )

    def _sync_completed_torrent(self, record: dict[str, object], qb_payload: dict[str, object]) -> dict[str, object]:
        info_hash = str(record["info_hash"]).lower()
        owner_user_id = str(record.get("owner_user_id") or "")
        owner_username = str(record.get("owner_username") or owner_user_id).strip() or owner_user_id
        media_type = self.infer_media_type(str(record.get("media_type")) if record.get("media_type") else None, str(record.get("media_title") or ""))
        media_title = str(record.get("media_title") or qb_payload.get("name") or "Unknown media")
        is_public = bool(int(record.get("is_public") or 0))

        asset_id = str(record["asset_id"]) if record.get("asset_id") else None
        media_item_id = str(record["media_item_id"]) if record.get("media_item_id") else None
        if not media_item_id:
            media_item = repositories.ensure_media_item(
                media_item_id=None,
                media_type=media_type,
                title=media_title,
            )
            media_item_id = str(media_item["id"])

        if not asset_id:
            asset = repositories.ensure_asset_for_user(
                owner_user_id=owner_user_id,
                media_item_id=media_item_id,
                media_type=media_type,
                title=media_title,
                existing_asset_id=None,
            )
            asset_id = str(asset["asset_id"])
            repositories.update_torrent_fields(info_hash, {"asset_id": asset_id, "media_item_id": media_item_id, "media_type": media_type, "media_title": media_title})

        try:
            self._ensure_jellyfin_libraries(owner_user_id=owner_user_id, owner_username=owner_username)
            self._maybe_sync_jellyfin_permissions()
            include_types = "Series,Episode" if media_type == "series" else "Movie"
            source_content_path = self._resolve_qb_content_path(qb_payload)
            owner_content_path = self._ensure_owner_access_path(
                owner_user_id=owner_user_id,
                media_type=media_type,
                info_hash=info_hash,
                source_path=source_content_path,
            )
            if is_public:
                content_path = self._ensure_public_access_path(
                    media_type=media_type,
                    info_hash=info_hash,
                    source_path=owner_content_path or source_content_path,
                )
            else:
                self._remove_public_access_path(info_hash=info_hash, media_type=media_type)
                content_path = owner_content_path or source_content_path

            self._maybe_refresh_jellyfin()

            qb_name = str(qb_payload.get("name") or "").strip()
            path_stem = PurePosixPath(content_path).stem if content_path else ""
            search_terms: list[str] = [media_title, qb_name, path_stem, path_stem.replace(".", " ")]
            if media_title.strip():
                search_terms.append(media_title.strip().split()[0])
            if qb_name.strip():
                search_terms.append(qb_name.strip().split(".")[0])

            items: list[dict[str, object]] = []
            seen_ids: set[str] = set()
            seen_terms: set[str] = set()
            for term in search_terms:
                normalized_term = term.strip()
                if len(normalized_term) < 2 or normalized_term.lower() in seen_terms:
                    continue
                seen_terms.add(normalized_term.lower())
                for item in self.jellyfin_client.search_items(
                    search_term=normalized_term,
                    include_item_types=include_types,
                    limit=64,
                ):
                    item_id = str(item.get("Id") or item.get("id") or "").strip()
                    if item_id and item_id in seen_ids:
                        continue
                    if item_id:
                        seen_ids.add(item_id)
                    items.append(item)
            selected = self._select_jellyfin_item(items, media_title=media_title, content_path=content_path)
            if selected is None and content_path:
                resolved_content_path = os.path.realpath(content_path)
                if resolved_content_path and resolved_content_path != content_path:
                    selected = self._select_jellyfin_item(items, media_title=media_title, content_path=resolved_content_path)
            if selected is None:
                repositories.update_asset_fields(asset_id, {"state": "SYNCING"})
                return {"can_watch": False, "watch_reason": "syncing", "asset_id": asset_id}

            jellyfin_item_id = str(selected.get("Id") or selected.get("id") or "").strip()
            if not jellyfin_item_id:
                repositories.update_asset_fields(asset_id, {"state": "SYNCING"})
                return {"can_watch": False, "watch_reason": "syncing", "asset_id": asset_id}

            repositories.update_asset_fields(
                asset_id,
                {
                    "state": "AVAILABLE",
                    "jellyfin_item_id": jellyfin_item_id,
                },
            )
            return {"can_watch": True, "watch_reason": "ready", "asset_id": asset_id}
        except (JellyfinConfigurationError, JellyfinNetworkError, JellyfinRequestError):
            repositories.update_asset_fields(asset_id, {"state": "SYNC_FAILED"})
            return {"can_watch": False, "watch_reason": "sync_failed", "asset_id": asset_id}

    def _ensure_jellyfin_libraries(self, *, owner_user_id: str, owner_username: str) -> None:
        now = time.monotonic()
        last_user_ensure = self._last_user_library_ensure_at.get(owner_user_id, 0.0)
        if now - last_user_ensure >= 60:
            self.jellyfin_access.ensure_user_libraries(user_id=owner_user_id, username=owner_username)
            self._last_user_library_ensure_at[owner_user_id] = now
        if now - self._last_public_library_ensure_at >= 60:
            self.jellyfin_access.ensure_public_libraries()
            self._last_public_library_ensure_at = now

    def _maybe_refresh_jellyfin(self, *, force: bool = False) -> None:
        now = time.monotonic()
        # Keep a small cooldown to avoid flooding Jellyfin refresh tasks.
        if not force and now - self._last_refresh_at < 30:
            return
        self.jellyfin_client.refresh_library()
        self._last_refresh_at = now

    def _maybe_sync_jellyfin_permissions(self, *, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self._last_permissions_sync_at < 15:
            return
        self.jellyfin_access.sync_all_user_policies()
        self._last_permissions_sync_at = now

    def _resolve_qb_content_path(self, qb_payload: dict[str, object]) -> str:
        content_path = str(qb_payload.get("content_path") or "").strip()
        if content_path:
            return content_path
        save_path = str(qb_payload.get("save_path") or "").strip()
        torrent_name = str(qb_payload.get("name") or "").strip()
        if save_path and torrent_name:
            return str(PurePosixPath(save_path) / torrent_name)
        return ""

    def _ensure_owner_access_path(self, *, owner_user_id: str, media_type: str, info_hash: str, source_path: str) -> str:
        owner_root = self.jellyfin_access.user_media_root(owner_user_id, media_type)
        return self._ensure_access_path(mirror_root=owner_root, info_hash=info_hash, source_path=source_path)

    def _ensure_public_access_path(self, *, media_type: str, info_hash: str, source_path: str) -> str:
        public_root = self.jellyfin_access.public_media_root(media_type)
        return self._ensure_access_path(mirror_root=public_root, info_hash=info_hash, source_path=source_path)

    def _remove_public_access_path(self, *, info_hash: str, media_type: str) -> None:
        target = Path(self.jellyfin_access.public_media_root(media_type)) / info_hash
        self._remove_path_if_present(target)

    def _ensure_access_path(self, *, mirror_root: str, info_hash: str, source_path: str) -> str:
        normalized_source = source_path.strip()
        if not normalized_source:
            return ""
        source = Path(normalized_source)
        if not source.exists():
            return normalized_source
        source_resolved = source.resolve()
        mirror_root_path = Path(mirror_root)
        ensure_download_path(mirror_root_path)
        mirror_root_resolved = mirror_root_path.resolve()

        if source_resolved == mirror_root_resolved or str(source_resolved).startswith(f"{mirror_root_resolved}/"):
            return str(source_resolved)

        target = mirror_root_path / info_hash
        if target.exists() or target.is_symlink():
            if target.is_symlink():
                try:
                    existing_target = os.readlink(target)
                except OSError:
                    existing_target = ""
                if existing_target == str(source_resolved):
                    return str(target)
            self._remove_path_if_present(target)

        try:
            os.symlink(str(source_resolved), str(target), target_is_directory=source_resolved.is_dir())
            return str(target)
        except OSError:
            return str(source_resolved)

    def _cleanup_access_mirrors(self, torrent: dict[str, object]) -> None:
        info_hash = str(torrent.get("info_hash") or "").strip().lower()
        if not info_hash:
            return
        media_type = self.infer_media_type(
            str(torrent.get("media_type")) if torrent.get("media_type") else None,
            str(torrent.get("media_title") or ""),
        )
        owner_user_id = str(torrent.get("owner_user_id") or "").strip()
        if owner_user_id:
            owner_target = Path(self.jellyfin_access.user_media_root(owner_user_id, media_type)) / info_hash
            self._remove_path_if_present(owner_target)
        public_target = Path(self.jellyfin_access.public_media_root(media_type)) / info_hash
        self._remove_path_if_present(public_target)

    def _remove_stale_jellyfin_items_for_prefixes(self, prefixes: list[str]) -> None:
        cleaned_prefixes: list[str] = []
        seen: set[str] = set()
        for prefix in prefixes:
            normalized = prefix.strip().rstrip("/").lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            cleaned_prefixes.append(normalized)
        if not cleaned_prefixes:
            return

        try:
            items = self.jellyfin_client.list_items(
                include_item_types="Movie,Series,Episode",
                fields="Path",
                limit=200,
            )
        except (JellyfinConfigurationError, JellyfinNetworkError, JellyfinRequestError):
            return

        delete_ids: list[str] = []
        seen_ids: set[str] = set()
        for item in items:
            path = str(item.get("Path") or item.get("path") or "").strip().rstrip("/").lower()
            if not path:
                continue
            if not any(path == prefix or path.startswith(f"{prefix}/") for prefix in cleaned_prefixes):
                continue
            item_id = str(item.get("Id") or item.get("id") or "").strip()
            if not item_id or item_id in seen_ids:
                continue
            seen_ids.add(item_id)
            delete_ids.append(item_id)

        for item_id in delete_ids:
            try:
                self.jellyfin_client.delete_item(item_id)
            except (JellyfinConfigurationError, JellyfinNetworkError, JellyfinRequestError):
                continue

    def _remove_path_if_present(self, path: Path) -> None:
        if not path.exists() and not path.is_symlink():
            return
        if path.is_symlink() or path.is_file():
            path.unlink(missing_ok=True)
            return
        shutil.rmtree(path, ignore_errors=True)

    def _select_jellyfin_item(
        self,
        items: list[dict[str, object]],
        *,
        media_title: str,
        content_path: str,
    ) -> dict[str, object] | None:
        if not items:
            return None
        normalized_title = media_title.strip().lower()
        target_path = content_path.strip().lower()
        resolved_target_path = os.path.realpath(content_path).strip().lower() if content_path.strip() else ""
        target_name = PurePosixPath(target_path).name.lower() if target_path else ""

        def score(item: dict[str, object]) -> tuple[int, int]:
            path = str(item.get("Path") or item.get("path") or "").strip().lower()
            name = str(item.get("Name") or item.get("name") or "").strip().lower()
            path_score = 0
            title_score = 0
            if target_path and path:
                if path == target_path or (resolved_target_path and path == resolved_target_path):
                    path_score = 5
                elif target_name and target_name in path:
                    path_score = 3
                elif PurePosixPath(target_path).parent.name and PurePosixPath(target_path).parent.name in path:
                    path_score = 2
            if normalized_title and name:
                if name == normalized_title:
                    title_score = 5
                elif normalized_title in name or name in normalized_title:
                    title_score = 3
            return (path_score, title_score)

        sorted_items = sorted(items, key=score, reverse=True)
        best = sorted_items[0]
        best_score = score(best)
        if best_score == (0, 0):
            return None
        return best
