from dataclasses import dataclass, field
from typing import Literal


@dataclass
class User:
    id: str
    username: str
    role: str
    created_at: str


@dataclass
class MediaItem:
    id: str
    type: Literal["movie", "series", "season", "episode"]
    title: str
    year: int | None
    external_provider: str | None
    external_id: str | None
    parent_id: str | None
    season_number: int | None
    episode_number: int | None
    created_at: str


@dataclass
class Asset:
    asset_id: str
    media_item_id: str
    media_type: str
    title: str
    year: int | None
    quality_profile: str | None
    state: str
    created_at: str


@dataclass
class TorrentRecord:
    info_hash: str
    torrent_title: str
    owner_username: str
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
    shared_torrent: bool = False


@dataclass
class Job:
    id: str
    kind: str
    state: str
    message: str | None = None
    metadata: dict[str, str] = field(default_factory=dict)
