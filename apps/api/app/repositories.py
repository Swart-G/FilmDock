from sqlite3 import Row
from uuid import uuid4

from app.db import db_cursor, now_iso


def _to_dict(row: Row | None) -> dict[str, object] | None:
    if row is None:
        return None
    return dict(row)


def list_users() -> list[dict[str, object]]:
    with db_cursor() as cursor:
        rows = cursor.execute("SELECT id, username, role, created_at FROM users ORDER BY created_at ASC").fetchall()
    return [dict(row) for row in rows]


def get_user_by_username(username: str) -> dict[str, object] | None:
    with db_cursor() as cursor:
        row = cursor.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    return _to_dict(row)


def get_user_by_id(user_id: str) -> dict[str, object] | None:
    with db_cursor() as cursor:
        row = cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _to_dict(row)


def create_user(username: str, password_hash: str, role: str = "user") -> dict[str, object]:
    user_id = uuid4().hex
    created_at = now_iso()
    with db_cursor() as cursor:
        cursor.execute(
            "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, username, password_hash, role, created_at),
        )
    return {"id": user_id, "username": username, "role": role, "created_at": created_at}


def persist_refresh_token(user_id: str, token: str) -> None:
    with db_cursor() as cursor:
        cursor.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (user_id,))
        cursor.execute("INSERT INTO refresh_tokens (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, now_iso()))


def consume_refresh_token(token: str) -> dict[str, object] | None:
    with db_cursor() as cursor:
        row = cursor.execute(
            """
            SELECT users.* FROM refresh_tokens
            JOIN users ON users.id = refresh_tokens.user_id
            WHERE refresh_tokens.token = ?
            """,
            (token,),
        ).fetchone()
    return _to_dict(row)


def list_root_media() -> list[dict[str, object]]:
    with db_cursor() as cursor:
        rows = cursor.execute("SELECT * FROM media_items WHERE type IN ('movie', 'series') ORDER BY title ASC").fetchall()
    return [dict(row) for row in rows]


def get_media_detail(media_id: str) -> dict[str, object] | None:
    with db_cursor() as cursor:
        media = cursor.execute("SELECT * FROM media_items WHERE id = ?", (media_id,)).fetchone()
        if media is None:
            return None
        children = cursor.execute("SELECT * FROM media_items WHERE parent_id = ? ORDER BY title ASC", (media_id,)).fetchall()
    payload = dict(media)
    payload["children"] = [dict(row) for row in children]
    return payload


def get_media_item(media_id: str) -> dict[str, object] | None:
    with db_cursor() as cursor:
        row = cursor.execute("SELECT * FROM media_items WHERE id = ?", (media_id,)).fetchone()
    return _to_dict(row)


def ensure_media_item(
    *,
    media_item_id: str | None,
    media_type: str,
    title: str,
    year: int | None = None,
) -> dict[str, object]:
    cleaned_type = media_type if media_type in {"movie", "series"} else "movie"
    cleaned_title = title.strip() or "Unknown media"
    with db_cursor() as cursor:
        if media_item_id:
            existing = cursor.execute("SELECT * FROM media_items WHERE id = ?", (media_item_id,)).fetchone()
            if existing is not None:
                return dict(existing)
        existing = cursor.execute(
            """
            SELECT * FROM media_items
            WHERE parent_id IS NULL AND type = ? AND title = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (cleaned_type, cleaned_title),
        ).fetchone()
        if existing is not None:
            return dict(existing)

        resolved_id = media_item_id or uuid4().hex[:12]
        created_at = now_iso()
        cursor.execute(
            """
            INSERT INTO media_items (
              id, type, title, year, external_provider, external_id, parent_id, season_number, episode_number, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (resolved_id, cleaned_type, cleaned_title, year, "filmdock", None, None, None, None, created_at),
        )
    return {
        "id": resolved_id,
        "type": cleaned_type,
        "title": cleaned_title,
        "year": year,
        "external_provider": "filmdock",
        "external_id": None,
        "parent_id": None,
        "season_number": None,
        "episode_number": None,
        "created_at": created_at,
    }


def ensure_asset_for_user(
    *,
    owner_user_id: str,
    media_item_id: str,
    media_type: str,
    title: str,
    year: int | None = None,
    existing_asset_id: str | None = None,
) -> dict[str, object]:
    cleaned_type = media_type if media_type in {"movie", "series"} else "movie"
    cleaned_title = title.strip() or "Unknown media"

    with db_cursor() as cursor:
        if existing_asset_id:
            existing = cursor.execute(
                "SELECT * FROM assets WHERE asset_id = ? AND owner_user_id = ?",
                (existing_asset_id, owner_user_id),
            ).fetchone()
            if existing is not None:
                return dict(existing)

        existing = cursor.execute(
            """
            SELECT * FROM assets
            WHERE owner_user_id = ? AND media_item_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (owner_user_id, media_item_id),
        ).fetchone()
        if existing is not None:
            return dict(existing)

        asset_id = uuid4().hex[:12]
        created_at = now_iso()
        cursor.execute(
            """
            INSERT INTO assets (
              asset_id, media_item_id, media_type, title, year, quality_profile, state, owner_user_id, jellyfin_item_id, is_public, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (asset_id, media_item_id, cleaned_type, cleaned_title, year, "auto", "DOWNLOADING", owner_user_id, None, 0, created_at),
        )
        cursor.execute(
            "INSERT OR IGNORE INTO entitlements (user_id, asset_id, source, created_at) VALUES (?, ?, ?, ?)",
            (owner_user_id, asset_id, "owner", created_at),
        )
    return {
        "asset_id": asset_id,
        "media_item_id": media_item_id,
        "media_type": cleaned_type,
        "title": cleaned_title,
        "year": year,
        "quality_profile": "auto",
        "state": "DOWNLOADING",
        "owner_user_id": owner_user_id,
        "jellyfin_item_id": None,
        "is_public": 0,
        "created_at": created_at,
    }


def user_visible_assets(user_id: str) -> list[dict[str, object]]:
    with db_cursor() as cursor:
        rows = cursor.execute(
            """
            SELECT DISTINCT assets.asset_id, assets.media_item_id, assets.media_type, assets.title, assets.year,
                   assets.quality_profile, assets.state, assets.created_at, assets.is_public
            FROM assets
            LEFT JOIN entitlements ON entitlements.asset_id = assets.asset_id
            WHERE assets.owner_user_id = ? OR assets.is_public = 1 OR entitlements.user_id = ?
            ORDER BY assets.created_at DESC
            """,
            (user_id, user_id),
        ).fetchall()
    return [dict(row) for row in rows]


def user_owned_torrents(user_id: str) -> list[dict[str, object]]:
    with db_cursor() as cursor:
        rows = cursor.execute(
            """
            SELECT torrents.*, users.username AS owner_username
            FROM torrents
            JOIN users ON users.id = torrents.owner_user_id
            WHERE torrents.owner_user_id = ?
            ORDER BY torrents.added_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def public_torrents(user_id: str) -> list[dict[str, object]]:
    with db_cursor() as cursor:
        rows = cursor.execute(
            """
            SELECT torrents.*, users.username AS owner_username
            FROM torrents
            JOIN users ON users.id = torrents.owner_user_id
            WHERE torrents.is_public = 1 AND torrents.owner_user_id != ?
            ORDER BY torrents.added_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_torrent(info_hash: str) -> dict[str, object] | None:
    with db_cursor() as cursor:
        row = cursor.execute(
            """
            SELECT torrents.*, users.username AS owner_username
            FROM torrents
            JOIN users ON users.id = torrents.owner_user_id
            WHERE torrents.info_hash = ?
            """,
            (info_hash,),
        ).fetchone()
    return _to_dict(row)


def user_can_access_asset(user_id: str, asset_id: str) -> bool:
    with db_cursor() as cursor:
        row = cursor.execute(
            """
            SELECT 1
            FROM assets
            LEFT JOIN entitlements ON entitlements.asset_id = assets.asset_id
            WHERE assets.asset_id = ? AND (assets.owner_user_id = ? OR assets.is_public = 1 OR entitlements.user_id = ?)
            """,
            (asset_id, user_id, user_id),
        ).fetchone()
    return row is not None


def get_asset(asset_id: str) -> dict[str, object] | None:
    with db_cursor() as cursor:
        row = cursor.execute("SELECT * FROM assets WHERE asset_id = ?", (asset_id,)).fetchone()
    return _to_dict(row)


def create_requested_asset(user_id: str, media_id: str, title: str, media_type: str, year: int | None) -> dict[str, object]:
    asset_id = uuid4().hex[:12]
    with db_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO assets (asset_id, media_item_id, media_type, title, year, quality_profile, state, owner_user_id, jellyfin_item_id, is_public, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (asset_id, media_id, media_type, title, year, "auto", "REQUESTED", user_id, None, 0, now_iso()),
        )
        cursor.execute(
            "INSERT OR IGNORE INTO entitlements (user_id, asset_id, source, created_at) VALUES (?, ?, ?, ?)",
            (user_id, asset_id, "owner", now_iso()),
        )
    return {"asset_id": asset_id, "state": "REQUESTED", "message": "Доступ поставлен в очередь."}


def update_asset_fields(asset_id: str, fields: dict[str, object]) -> None:
    if not fields:
        return
    allowed = {"state", "jellyfin_item_id", "is_public", "title", "year", "media_type"}
    updates = {key: value for key, value in fields.items() if key in allowed}
    if not updates:
        return
    columns = ", ".join(f"{key} = ?" for key in updates)
    values = list(updates.values()) + [asset_id]
    with db_cursor() as cursor:
        cursor.execute(f"UPDATE assets SET {columns} WHERE asset_id = ?", values)


def upsert_torrent_record(
    *,
    info_hash: str,
    owner_user_id: str,
    torrent_title: str,
    state: str,
    status_group: str,
    progress_percent: float,
    eta_seconds: int | None,
    download_speed: int | None,
    size_bytes: int | None,
    downloaded_bytes: int | None,
    added_at: str | None,
    completed_at: str | None,
    asset_id: str | None,
    media_item_id: str | None,
    media_type: str | None,
    media_title: str | None,
    can_watch: bool,
    watch_reason: str | None,
) -> dict[str, object]:
    with db_cursor() as cursor:
        existing = cursor.execute("SELECT is_public, shared_torrent FROM torrents WHERE info_hash = ?", (info_hash,)).fetchone()
        is_public = int(existing["is_public"]) if existing is not None else 0
        shared_torrent = int(existing["shared_torrent"]) if existing is not None else 0
        cursor.execute(
            """
            INSERT INTO torrents (
              info_hash, owner_user_id, torrent_title, state, status_group, progress_percent, eta_seconds, download_speed,
              size_bytes, downloaded_bytes, added_at, completed_at, asset_id, media_item_id, media_type, media_title,
              can_watch, watch_reason, is_public, shared_torrent
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(info_hash) DO UPDATE SET
              owner_user_id = excluded.owner_user_id,
              torrent_title = excluded.torrent_title,
              state = excluded.state,
              status_group = excluded.status_group,
              progress_percent = excluded.progress_percent,
              eta_seconds = excluded.eta_seconds,
              download_speed = excluded.download_speed,
              size_bytes = excluded.size_bytes,
              downloaded_bytes = excluded.downloaded_bytes,
              added_at = excluded.added_at,
              completed_at = excluded.completed_at,
              asset_id = excluded.asset_id,
              media_item_id = excluded.media_item_id,
              media_type = excluded.media_type,
              media_title = excluded.media_title,
              can_watch = excluded.can_watch,
              watch_reason = excluded.watch_reason,
              is_public = excluded.is_public,
              shared_torrent = excluded.shared_torrent
            """,
            (
                info_hash,
                owner_user_id,
                torrent_title,
                state,
                status_group,
                progress_percent,
                eta_seconds,
                download_speed,
                size_bytes,
                downloaded_bytes,
                added_at,
                completed_at,
                asset_id,
                media_item_id,
                media_type,
                media_title,
                int(can_watch),
                watch_reason,
                is_public,
                shared_torrent,
            ),
        )
    return {"accepted": True, "mapped": True, "info_hash": info_hash}


def update_torrent_fields(info_hash: str, fields: dict[str, object]) -> None:
    if not fields:
        return
    allowed = {
        "owner_user_id",
        "torrent_title",
        "state",
        "status_group",
        "progress_percent",
        "eta_seconds",
        "download_speed",
        "size_bytes",
        "downloaded_bytes",
        "added_at",
        "completed_at",
        "asset_id",
        "media_item_id",
        "media_type",
        "media_title",
        "can_watch",
        "watch_reason",
        "is_public",
        "shared_torrent",
    }
    updates = {key: value for key, value in fields.items() if key in allowed}
    if not updates:
        return
    columns = ", ".join(f"{key} = ?" for key in updates)
    values = list(updates.values()) + [info_hash]
    with db_cursor() as cursor:
        cursor.execute(f"UPDATE torrents SET {columns} WHERE info_hash = ?", values)


def add_torrent_for_user(
    user_id: str,
    media_item_id: str | None,
    info_hash: str,
    title: str,
    media_type: str | None,
    media_title: str | None,
) -> dict[str, object]:
    resolved_type = media_type if media_type in {"movie", "series"} else "movie"
    resolved_title = (media_title or title or "Unknown media").strip()
    media = ensure_media_item(
        media_item_id=media_item_id,
        media_type=resolved_type,
        title=resolved_title,
        year=None,
    )
    asset = ensure_asset_for_user(
        owner_user_id=user_id,
        media_item_id=str(media["id"]),
        media_type=resolved_type,
        title=resolved_title,
        year=media.get("year") if isinstance(media.get("year"), int) else None,
    )
    upsert_torrent_record(
        info_hash=info_hash,
        owner_user_id=user_id,
        torrent_title=title,
        state="DOWNLOADING",
        status_group="downloading",
        progress_percent=0.0,
        eta_seconds=None,
        download_speed=None,
        size_bytes=None,
        downloaded_bytes=None,
        added_at=now_iso(),
        completed_at=None,
        asset_id=str(asset["asset_id"]),
        media_item_id=str(media["id"]),
        media_type=resolved_type,
        media_title=resolved_title,
        can_watch=False,
        watch_reason="syncing",
    )
    return {"accepted": True, "mapped": True, "info_hash": info_hash, "message": "Torrent added to the personal queue."}


def update_torrent_visibility(info_hash: str, owner_user_id: str) -> dict[str, object] | None:
    torrent = get_torrent(info_hash)
    if torrent is None or torrent["owner_user_id"] != owner_user_id:
        return None
    next_public = 0 if int(torrent["is_public"]) else 1
    with db_cursor() as cursor:
        cursor.execute("UPDATE torrents SET is_public = ?, shared_torrent = ? WHERE info_hash = ?", (next_public, next_public, info_hash))
        if torrent["asset_id"]:
            cursor.execute("UPDATE assets SET is_public = ? WHERE asset_id = ?", (next_public, torrent["asset_id"]))
    torrent["is_public"] = next_public
    return torrent


def delete_torrent(info_hash: str, owner_user_id: str) -> dict[str, object] | None:
    torrent = get_torrent(info_hash)
    if torrent is None or torrent["owner_user_id"] != owner_user_id:
        return None
    with db_cursor() as cursor:
        cursor.execute("DELETE FROM torrents WHERE info_hash = ?", (info_hash,))
    return torrent


def list_jobs() -> list[dict[str, object]]:
    return [
        {"id": "j1", "kind": "jellyfin_sync", "state": "idle", "message": "Waiting for real Jellyfin sync implementation."},
        {"id": "j2", "kind": "torrent_status", "state": "idle", "message": "Waiting for real qBittorrent polling implementation."},
    ]
