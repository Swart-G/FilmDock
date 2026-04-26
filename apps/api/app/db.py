import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from functools import lru_cache
import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _db_path_candidates() -> list[str]:
    raw_candidates = [
        settings.db_path,
        str((Path.cwd() / "data" / "swarttube.db").resolve()),
        "/tmp/swarttube.db",
    ]
    deduplicated: list[str] = []
    for item in raw_candidates:
        normalized = item.strip() if item else ""
        if not normalized or normalized in deduplicated:
            continue
        deduplicated.append(normalized)
    return deduplicated


@lru_cache(maxsize=1)
def resolved_db_path() -> str:
    last_error: Exception | None = None
    for candidate in _db_path_candidates():
        path = Path(candidate)
        probe: sqlite3.Connection | None = None
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            probe = sqlite3.connect(str(path), check_same_thread=False)
            probe.execute("CREATE TABLE IF NOT EXISTS __swarttube_write_probe (id INTEGER PRIMARY KEY)")
            probe.execute("DROP TABLE __swarttube_write_probe")
            probe.commit()
            if candidate != settings.db_path:
                logger.warning(
                    "Primary database path %s is not writable. Falling back to %s.",
                    settings.db_path,
                    candidate,
                )
            return str(path)
        except (OSError, sqlite3.Error) as error:
            last_error = error
        finally:
            if probe is not None:
                probe.close()

    raise RuntimeError("Unable to open a writable SQLite database path.") from last_error


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(resolved_db_path(), check_same_thread=False)
    connection.row_factory = sqlite3.Row
    return connection


@contextmanager
def db_cursor():
    connection = connect()
    try:
        cursor = connection.cursor()
        yield cursor
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    Path(resolved_db_path()).parent.mkdir(parents=True, exist_ok=True)
    with db_cursor() as cursor:
        cursor.executescript(
            """
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS refresh_tokens (
              token TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS media_items (
              id TEXT PRIMARY KEY,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              year INTEGER,
              external_provider TEXT,
              external_id TEXT,
              parent_id TEXT,
              season_number INTEGER,
              episode_number INTEGER,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS assets (
              asset_id TEXT PRIMARY KEY,
              media_item_id TEXT NOT NULL,
              media_type TEXT NOT NULL,
              title TEXT NOT NULL,
              year INTEGER,
              quality_profile TEXT,
              state TEXT NOT NULL,
              owner_user_id TEXT NOT NULL,
              jellyfin_item_id TEXT,
              is_public INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY(media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS entitlements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              asset_id TEXT NOT NULL,
              source TEXT NOT NULL,
              created_at TEXT NOT NULL,
              UNIQUE(user_id, asset_id),
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS torrents (
              info_hash TEXT PRIMARY KEY,
              owner_user_id TEXT NOT NULL,
              torrent_title TEXT NOT NULL,
              state TEXT NOT NULL,
              status_group TEXT NOT NULL,
              progress_percent REAL NOT NULL,
              eta_seconds INTEGER,
              download_speed INTEGER,
              size_bytes INTEGER,
              downloaded_bytes INTEGER,
              added_at TEXT,
              completed_at TEXT,
              asset_id TEXT,
              media_item_id TEXT,
              media_type TEXT,
              media_title TEXT,
              can_watch INTEGER NOT NULL DEFAULT 0,
              watch_reason TEXT,
              is_public INTEGER NOT NULL DEFAULT 0,
              shared_torrent INTEGER NOT NULL DEFAULT 0,
              FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS app_settings (
              key TEXT PRIMARY KEY,
              value TEXT
            );
            """
        )
    seed_defaults()


def seed_defaults() -> None:
    with db_cursor() as cursor:
        # Remove reconstructed demo content so the app only shows real user data.
        cursor.execute("DELETE FROM torrents WHERE info_hash IN ('111aaa', '333ccc')")
        cursor.execute("DELETE FROM entitlements WHERE asset_id IN ('a1', 'a2')")
        cursor.execute("DELETE FROM assets WHERE asset_id IN ('a1', 'a2')")
        cursor.execute("DELETE FROM media_items WHERE id IN ('m1', 'm2', 'm3', 'm4')")

        demo_user_row = cursor.execute("SELECT id FROM users WHERE username = 'public-demo'").fetchone()
        if demo_user_row is not None:
            demo_user_id = str(demo_user_row["id"])
            cursor.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (demo_user_id,))
            cursor.execute("DELETE FROM users WHERE id = ?", (demo_user_id,))
