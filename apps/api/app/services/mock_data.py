from app.models.entities import Asset, Job, MediaItem, TorrentRecord, User


USERS = {
    "swart": User(id="u1", username="swart", role="admin", created_at="2026-02-20T19:10:00Z"),
}

MEDIA_ITEMS = [
    MediaItem(
        id="m1",
        type="movie",
        title="Blade Runner 2049",
        year=2017,
        external_provider="tmdb",
        external_id="335984",
        parent_id=None,
        season_number=None,
        episode_number=None,
        created_at="2026-02-20T19:20:00Z",
    ),
    MediaItem(
        id="m2",
        type="series",
        title="Frieren: Beyond Journey's End",
        year=2023,
        external_provider="tmdb",
        external_id="209867",
        parent_id=None,
        season_number=None,
        episode_number=None,
        created_at="2026-02-21T18:00:00Z",
    ),
    MediaItem(
        id="m3",
        type="season",
        title="Season 1",
        year=2023,
        external_provider="tmdb",
        external_id="209867-s1",
        parent_id="m2",
        season_number=1,
        episode_number=None,
        created_at="2026-02-21T18:01:00Z",
    ),
    MediaItem(
        id="m4",
        type="episode",
        title="The Journey's End",
        year=2023,
        external_provider="tmdb",
        external_id="209867-e1",
        parent_id="m3",
        season_number=1,
        episode_number=1,
        created_at="2026-02-21T18:02:00Z",
    ),
]

LIBRARY = [
    Asset(
        asset_id="a1",
        media_item_id="m1",
        media_type="movie",
        title="Blade Runner 2049",
        year=2017,
        quality_profile="1080p",
        state="AVAILABLE",
        created_at="2026-03-02T18:05:00Z",
    )
]

TORRENTS = [
    TorrentRecord(
        info_hash="111aaa",
        torrent_title="[2017, sci-fi, 1080p] Blade Runner 2049",
        owner_username="swart",
        state="COMPLETED",
        status_group="completed",
        progress_percent=100,
        eta_seconds=None,
        download_speed=None,
        size_bytes=8_214_568_960,
        downloaded_bytes=8_214_568_960,
        added_at="2026-03-02T18:10:00Z",
        completed_at="2026-03-02T19:00:00Z",
        asset_id="a1",
        media_item_id="m1",
        media_type="movie",
        media_title="Blade Runner 2049",
        can_watch=True,
        redirect_url="/jellyfin/web/index.html#/details?id=a1",
        watch_url="/api/watch/assets/a1",
        watch_reason="ready",
        is_public=True,
        shared_torrent=True,
    ),
    TorrentRecord(
        info_hash="222bbb",
        torrent_title="[2023, series, 1080p, RU] Frieren S01",
        owner_username="swart",
        state="DOWNLOADING",
        status_group="downloading",
        progress_percent=34,
        eta_seconds=5400,
        download_speed=18_500_000,
        size_bytes=24_500_000_000,
        downloaded_bytes=8_330_000_000,
        added_at="2026-03-02T20:20:00Z",
        completed_at=None,
        asset_id=None,
        media_item_id="m2",
        media_type="series",
        media_title="Frieren: Beyond Journey's End",
        can_watch=False,
        redirect_url=None,
        watch_url="/api/library/torrents/222bbb/watch",
        watch_reason="syncing",
    ),
]

JOBS = [
    Job(id="j1", kind="jellyfin_sync", state="running", message="Synchronizing metadata"),
    Job(id="j2", kind="torrent_scan", state="idle", message=None),
]

TORRENT_EXCLUSIONS = {"deadbeef"}
