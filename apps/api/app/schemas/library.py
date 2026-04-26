from pydantic import BaseModel


class LibraryItemOut(BaseModel):
    asset_id: str
    media_item_id: str
    media_type: str
    title: str
    year: int | None
    quality_profile: str | None
    state: str
    created_at: str


class LibraryTorrentItemOut(BaseModel):
    info_hash: str
    torrent_title: str
    state: str
    status_group: str
    progress_percent: float
    eta_seconds: int | None
    download_speed: int | None
    size_bytes: int | None
    downloaded_bytes: int | None
    added_at: str | None
    completed_at: str | None
    asset_id: str | None
    media_item_id: str | None
    media_type: str | None
    media_title: str | None
    can_watch: bool
    redirect_url: str | None
    watch_url: str | None
    watch_reason: str | None
    is_public: bool = False


class PublicLibraryTorrentItemOut(LibraryTorrentItemOut):
    owner_username: str


class LibraryTorrentWatchOut(BaseModel):
    info_hash: str
    can_watch: bool
    redirect_url: str | None
    watch_url: str | None
    watch_reason: str | None
    message: str | None


class LibraryTorrentDeleteOut(BaseModel):
    info_hash: str
    removed_mapping: bool
    removed_entitlement: bool
    removed_from_qb: bool
    deleted_files: bool
    shared_torrent: bool
    message: str | None


class LibraryTorrentVisibilityOut(BaseModel):
    info_hash: str
    is_public: bool
    message: str | None

