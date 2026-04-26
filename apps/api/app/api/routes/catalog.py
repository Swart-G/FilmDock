from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import require_user
from app.repositories import create_requested_asset, get_media_detail, list_root_media
from app.schemas.catalog import LibraryRequestOut, MediaItemDetailOut, MediaItemOut

router = APIRouter()


@router.get("/media-items", response_model=list[MediaItemOut])
def list_media_items() -> list[MediaItemOut]:
    return [MediaItemOut.model_validate(item) for item in list_root_media()]


@router.get("/media-items/{media_id}", response_model=MediaItemDetailOut)
def media_item_detail(media_id: str) -> MediaItemDetailOut:
    payload = get_media_detail(media_id)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")
    return MediaItemDetailOut.model_validate(payload)


@router.post("/media-items/{media_id}/request", response_model=LibraryRequestOut)
def request_access(media_id: str, user=Depends(require_user)) -> LibraryRequestOut:
    media = get_media_detail(media_id)
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")
    created = create_requested_asset(str(user["id"]), media_id, str(media["title"]), str(media["type"]), media.get("year"))
    return LibraryRequestOut(state=str(created["state"]), asset_id=str(created["asset_id"]), message=str(created["message"]))
