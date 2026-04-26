from __future__ import annotations

import os
from pathlib import Path


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default


def ensure_download_path(path: str | Path) -> str:
    download_path = Path(path)
    download_path.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(download_path, 0o775)
    except OSError:
        pass

    uid = _env_int("PUID", _env_int("SWARTTUBE_DOWNLOAD_UID", 1000))
    gid = _env_int("PGID", _env_int("SWARTTUBE_DOWNLOAD_GID", 1000))
    try:
        os.chown(download_path, uid, gid)
    except OSError:
        pass
    return str(download_path)
