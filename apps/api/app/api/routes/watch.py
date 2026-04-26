from fastapi import APIRouter, Depends, HTTPException, status
from urllib.parse import quote

from app.core.config import settings
from app.dependencies import require_user
from app.repositories import get_asset, user_can_access_asset
from app.schemas.watch import PlaySessionOut

router = APIRouter()


def _jellyfin_details_url(item_id: str) -> str:
    base = (settings.jellyfin_public_base_url or "/jellyfin").strip() or "/jellyfin"
    normalized_base = base.rstrip("/")
    encoded_id = quote(item_id, safe="")
    return f"{normalized_base}/web/index.html#/details?id={encoded_id}"


@router.get("/assets/{asset_id}", response_model=PlaySessionOut)
def watch_asset(asset_id: str, user=Depends(require_user)) -> PlaySessionOut:
    asset = get_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    if not user_can_access_asset(str(user["id"]), asset_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if not (settings.jellyfin_public_base_url or settings.jellyfin_base_url):
        return PlaySessionOut(
            state="misconfigured",
            redirect_url=None,
            iframe_url=None,
            prev_asset_id=None,
            next_asset_id=None,
            message="Configure SWARTTUBE_JELLYFIN_PUBLIC_BASE_URL (or proxy /jellyfin) in environment variables.",
        )
    target_id = str(asset["jellyfin_item_id"]).strip() if asset.get("jellyfin_item_id") else ""
    if not target_id:
        return PlaySessionOut(
            state="syncing",
            redirect_url=None,
            iframe_url=None,
            prev_asset_id=None,
            next_asset_id=None,
            message="Jellyfin is still indexing this media. Try again in a few moments.",
        )
    iframe_url = _jellyfin_details_url(target_id)
    return PlaySessionOut(
        state="ready",
        redirect_url=iframe_url,
        iframe_url=iframe_url,
        prev_asset_id=None,
        next_asset_id=None,
        message="Playback prepared through Jellyfin.",
    )
