from app.core.config import settings


class WatchService:
    def create_session(self, asset_id: str, prev_asset_id: str | None = None, next_asset_id: str | None = None) -> dict[str, str | None]:
        jellyfin_base = (settings.jellyfin_public_base_url or f"{settings.public_base.rstrip('/')}/jellyfin").rstrip("/")
        iframe = f"{jellyfin_base}/web/index.html#/details?id={asset_id}"
        return {
            "state": "ready",
            "redirect_url": iframe,
            "iframe_url": iframe,
            "prev_asset_id": prev_asset_id,
            "next_asset_id": next_asset_id,
            "message": "Playback handoff prepared.",
        }
