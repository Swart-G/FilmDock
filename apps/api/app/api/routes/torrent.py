from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import require_user
from app.repositories import get_media_detail
from app.schemas.torrent import AddTorrentIn, AddTorrentResponseOut, TorrentExclusionsResponseOut, TorrentSearchResponseOut
from app.services.torrent_identity import TorrentIdentityService
from app.services.torrent_pipeline import TorrentPipelineService
from app.services.torrent_search_service import TorrentSearchService

router = APIRouter()
search_service = TorrentSearchService()
identity_service = TorrentIdentityService()
pipeline_service = TorrentPipelineService()


@router.get("/search", response_model=TorrentSearchResponseOut)
def search(
    q: str = Query(default=""),
    resolution: str | None = None,
    dub: str | None = None,
    subtitles: str | None = None,
    min_seeders: int | None = Query(default=None, ge=0),
    min_leechers: int | None = Query(default=None, ge=0),
    min_size_bytes: int | None = Query(default=None, ge=0),
    max_size_bytes: int | None = Query(default=None, ge=0),
    sort_by: Literal["relevance", "seeders", "leechers", "size", "date", "quality"] = Query(default="relevance"),
    sort_order: Literal["desc", "asc"] = Query(default="desc"),
) -> TorrentSearchResponseOut:
    if min_size_bytes is not None and max_size_bytes is not None and min_size_bytes > max_size_bytes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="min_size_bytes cannot exceed max_size_bytes.")
    results = search_service.search(
        q,
        resolution=resolution,
        dub=dub,
        subtitles=subtitles,
        min_seeders=min_seeders,
        min_leechers=min_leechers,
        min_size_bytes=min_size_bytes,
        max_size_bytes=max_size_bytes,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return TorrentSearchResponseOut(query=q, count=len(results), results=results)


@router.post("/add", response_model=AddTorrentResponseOut)
def add_torrent(payload: AddTorrentIn, user=Depends(require_user)) -> AddTorrentResponseOut:
    info_hash = payload.info_hash
    if not info_hash:
        info_hash = identity_service.extract_info_hash_from_magnet(payload.magnet_url)
    if not info_hash:
        info_hash = identity_service.extract_info_hash_from_magnet(payload.download_url)
    if not info_hash and payload.download_url:
        info_hash = identity_service.derive_fallback_hash(payload.download_url)
    if not info_hash:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unable to resolve torrent info hash.")
    normalized_info_hash = identity_service.normalize(info_hash)

    media = get_media_detail(payload.media_item_id) if payload.media_item_id else None
    media_type = str(media["type"]) if media is not None else payload.media_type
    media_title = str(media["title"]) if media is not None else payload.media_title
    if media_title is None:
        media_title = identity_service.extract_display_name_from_magnet(payload.magnet_url) or "Magnet torrent"

    try:
        created = pipeline_service.add_torrent(
            user_id=str(user["id"]),
            info_hash=normalized_info_hash,
            media_item_id=payload.media_item_id if media is not None else None,
            media_title=media_title,
            media_type=media_type,
            magnet_url=payload.magnet_url,
            download_url=payload.download_url,
        )
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return AddTorrentResponseOut.model_validate(created)


@router.get("/exclusions", response_model=TorrentExclusionsResponseOut)
def exclusions() -> TorrentExclusionsResponseOut:
    return TorrentExclusionsResponseOut(info_hashes=[])
