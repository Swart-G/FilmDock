class MediaPathsService:
    def asset_path(self, asset_id: str) -> str:
        return f"/srv/media/{asset_id}"

