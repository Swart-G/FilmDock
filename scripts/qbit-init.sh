#!/usr/bin/with-contenv bash
set -euo pipefail

config_path="${FILMDOCK_QBITTORRENT_CONFIG_PATH:-/config/qBittorrent/qBittorrent.conf}"

if [[ -z "${SWARTTUBE_QBITTORRENT_ADMIN_USERNAME:-}" ]]; then
  echo "FilmDock qBittorrent init: SWARTTUBE_QBITTORRENT_ADMIN_USERNAME is not set" >&2
  exit 1
fi

if [[ -z "${SWARTTUBE_QBITTORRENT_ADMIN_PASSWORD:-}" ]]; then
  echo "FilmDock qBittorrent init: SWARTTUBE_QBITTORRENT_ADMIN_PASSWORD is not set" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "FilmDock qBittorrent init: python3 is required to generate qBittorrent WebUI password hash" >&2
  exit 1
fi

mkdir -p "$(dirname "$config_path")"
touch "$config_path"

python3 - "$config_path" <<'PY'
from __future__ import annotations

import base64
import hashlib
import os
import sys
from pathlib import Path
from urllib.parse import urlparse


CONFIG_PATH = Path(sys.argv[1])
USERNAME = os.environ["SWARTTUBE_QBITTORRENT_ADMIN_USERNAME"]
PASSWORD = os.environ["SWARTTUBE_QBITTORRENT_ADMIN_PASSWORD"]


def hostname_from_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    return parsed.hostname


def netloc_from_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    return parsed.netloc or None


def webui_server_domains() -> str:
    webui_port = os.environ.get("WEBUI_PORT", "18081")
    domains = [
        hostname_from_url(os.environ.get("SWARTTUBE_PUBLIC_BASE")),
        netloc_from_url(os.environ.get("SWARTTUBE_PUBLIC_BASE")),
        hostname_from_url(os.environ.get("SWARTTUBE_QBITTORRENT_BASE_URL")),
        netloc_from_url(os.environ.get("SWARTTUBE_QBITTORRENT_BASE_URL")),
        "localhost",
        "localhost:8080",
        "localhost:18081",
        f"localhost:{webui_port}",
        "127.0.0.1",
        "127.0.0.1:8080",
        "127.0.0.1:18081",
        f"127.0.0.1:{webui_port}",
        "qbittorrent",
        "qbittorrent:8080",
        f"qbittorrent:{webui_port}",
        "nginx",
    ]
    result: list[str] = []
    for domain in domains:
        if domain and domain not in result:
            result.append(domain)
    return f'"{";".join(result)}"'


def qbittorrent_password_hash(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha512", password.encode("utf-8"), salt, 100_000)
    encoded_salt = base64.b64encode(salt).decode("ascii")
    encoded_hash = base64.b64encode(derived).decode("ascii")
    return f"{encoded_salt}:{encoded_hash}"


def set_ini_value(lines: list[str], section: str, key: str, value: str) -> list[str]:
    header = f"[{section}]"
    section_start = next((index for index, line in enumerate(lines) if line.strip() == header), None)
    if section_start is None:
        if lines and lines[-1].strip():
            lines.append("")
        lines.extend([header, f"{key}={value}"])
        return lines

    section_end = len(lines)
    for index in range(section_start + 1, len(lines)):
        stripped = lines[index].strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            section_end = index
            break

    prefix = f"{key}="
    for index in range(section_start + 1, section_end):
        if lines[index].startswith(prefix):
            lines[index] = f"{key}={value}"
            return lines

    lines.insert(section_end, f"{key}={value}")
    return lines


raw_text = CONFIG_PATH.read_text(encoding="utf-8") if CONFIG_PATH.exists() else ""
lines = raw_text.splitlines()

updates = {
    r"WebUI\Username": USERNAME,
    r"WebUI\Password_PBKDF2": qbittorrent_password_hash(PASSWORD),
    r"WebUI\Port": os.environ.get("WEBUI_PORT", "18081"),
    r"WebUI\MaxAuthenticationFailCount": "50",
    r"WebUI\BanDuration": "1",
    r"WebUI\LocalHostAuth": "false",
    r"WebUI\HostHeaderValidation": "true",
    r"WebUI\ServerDomains": webui_server_domains(),
    r"IPFilter\BannedIPs": "",
}

for key, value in updates.items():
    lines = set_ini_value(lines, "Preferences", key, value)

CONFIG_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

echo "FilmDock qBittorrent init: WebUI credentials and auth-ban settings were applied from environment"
