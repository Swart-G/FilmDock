from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import require_user
from app.repositories import get_torrent, public_torrents, update_torrent_visibility, user_owned_torrents, user_visible_assets
from app.schemas.library import (
    LibraryItemOut,
    LibraryTorrentDeleteOut,
    LibraryTorrentItemOut,
    LibraryTorrentVisibilityOut,
    LibraryTorrentWatchOut,
    PublicLibraryTorrentItemOut,
)
from app.services.torrent_pipeline import TorrentPipelineService

router = APIRouter()
pipeline_service = TorrentPipelineService()

def _to_torrent_payload(entry: dict[str, object]) -> dict[str, object]:
    payload = dict(entry)
    payload["redirect_url"] = None
    payload["can_watch"] = bool(entry.get("can_watch"))
    payload["watch_url"] = f"/api/watch/assets/{entry['asset_id']}" if entry.get("asset_id") and payload["can_watch"] else None
    payload["is_public"] = bool(entry.get("is_public"))
    return payload


@router.get("/my", response_model=list[LibraryItemOut])
def my_library(user=Depends(require_user)) -> list[LibraryItemOut]:
    return [LibraryItemOut.model_validate(entry) for entry in user_visible_assets(str(user["id"]))]


@router.get("/torrents", response_model=list[LibraryTorrentItemOut])
def my_torrents(user=Depends(require_user)) -> list[LibraryTorrentItemOut]:
    owned = user_owned_torrents(str(user["id"]))
    pipeline_service.sync_torrents(owned)
    refreshed = user_owned_torrents(str(user["id"]))
    return [LibraryTorrentItemOut.model_validate(_to_torrent_payload(entry)) for entry in refreshed]


@router.get("/torrents/public", response_model=list[PublicLibraryTorrentItemOut])
def public_library_torrents(user=Depends(require_user)) -> list[PublicLibraryTorrentItemOut]:
    public_items = public_torrents(str(user["id"]))
    pipeline_service.sync_torrents(public_items)
    refreshed = public_torrents(str(user["id"]))
    return [PublicLibraryTorrentItemOut.model_validate(_to_torrent_payload(entry)) for entry in refreshed]


@router.post("/torrents/{info_hash}/watch", response_model=LibraryTorrentWatchOut)
def watch_torrent(info_hash: str, user=Depends(require_user)) -> LibraryTorrentWatchOut:
    torrent = get_torrent(info_hash)
    if torrent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Torrent not found")
    pipeline_service.sync_torrents([torrent])
    torrent = get_torrent(info_hash)
    if torrent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Torrent not found")

    allowed = torrent["owner_user_id"] == user["id"] or int(torrent["is_public"]) == 1
    if not allowed:
        return LibraryTorrentWatchOut(
            info_hash=str(torrent["info_hash"]),
            can_watch=False,
            redirect_url=None,
            watch_url=None,
            watch_reason=str(torrent["watch_reason"]) if torrent["watch_reason"] is not None else None,
            message="Only the owner or users with public access can open this torrent.",
        )

    can_watch = bool(torrent["can_watch"]) and bool(torrent.get("asset_id"))
    watch_reason = str(torrent["watch_reason"]) if torrent["watch_reason"] is not None else None
    if can_watch:
        message = "Playback is ready."
    elif watch_reason == "syncing":
        if str(torrent.get("status_group")) == "completed":
            message = "Download completed, but Jellyfin is still indexing this media."
        else:
            message = "Torrent is still downloading."
    elif watch_reason == "sync_failed":
        message = "Jellyfin synchronization failed. Check integrations and retry."
    elif watch_reason == "not_available":
        message = "Torrent is not available in qBittorrent anymore."
    else:
        message = "Playback is not ready yet."

    return LibraryTorrentWatchOut(
        info_hash=str(torrent["info_hash"]),
        can_watch=can_watch,
        redirect_url=None,
        watch_url=f"/api/watch/assets/{torrent['asset_id']}" if can_watch else None,
        watch_reason=watch_reason,
        message=message,
    )


@router.delete("/torrents/{info_hash}", response_model=LibraryTorrentDeleteOut)
def remove_torrent(info_hash: str, user=Depends(require_user)) -> LibraryTorrentDeleteOut:
    try:
        removal = pipeline_service.remove_torrent(user_id=str(user["id"]), info_hash=info_hash)
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    if removal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Torrent not found")
    torrent = removal["torrent"]
    removed_from_qb = bool(removal["removed_from_qb"])
    deleted_files = bool(removal["deleted_files"])
    return LibraryTorrentDeleteOut(
        info_hash=str(torrent["info_hash"]),
        removed_mapping=True,
        removed_entitlement=not bool(torrent["shared_torrent"]),
        removed_from_qb=removed_from_qb,
        deleted_files=deleted_files,
        shared_torrent=bool(torrent["shared_torrent"]),
        message="Torrent removed from qBittorrent and the personal queue." if deleted_files else "Torrent removed from the personal queue.",
    )


@router.post("/torrents/{info_hash}/visibility", response_model=LibraryTorrentVisibilityOut)
def toggle_visibility(info_hash: str, user=Depends(require_user)) -> LibraryTorrentVisibilityOut:
    torrent = update_torrent_visibility(info_hash, str(user["id"]))
    if torrent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Torrent not found")
    refreshed_torrent = get_torrent(info_hash)
    if refreshed_torrent is not None:
        pipeline_service.sync_torrents([refreshed_torrent])
        if not bool(torrent["is_public"]):
            pipeline_service.purge_stale_jellyfin_items_for_torrent(
                refreshed_torrent,
                include_owner=False,
                include_public=True,
            )
    return LibraryTorrentVisibilityOut(
        info_hash=str(torrent["info_hash"]),
        is_public=bool(torrent["is_public"]),
        message="Visibility updated.",
    )
