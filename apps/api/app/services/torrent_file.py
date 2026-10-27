from __future__ import annotations

import hashlib
import ipaddress
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from app.core.config import settings

MAX_TORRENT_FILE_BYTES = 8 * 1024 * 1024


class TorrentFileError(Exception):
    pass


def _ensure_public_http_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise TorrentFileError("Torrent download URL must be an absolute http(s) URL.")
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(parsed.hostname, parsed.port or 443)}
    except socket.gaierror as error:
        raise TorrentFileError(f"Cannot resolve torrent host: {parsed.hostname}") from error
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise TorrentFileError("Torrent download URL points to a non-public address.")


def fetch_torrent_file(url: str) -> bytes:
    _ensure_public_http_url(url)
    request = Request(url, headers={"User-Agent": "FilmDockBot/1.0", "Accept": "application/x-bittorrent, */*"})
    timeout = max(float(settings.torrent_search_timeout_seconds), 5.0)
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = response.read(MAX_TORRENT_FILE_BYTES + 1)
    except (URLError, HTTPError, TimeoutError, OSError) as error:
        raise TorrentFileError(f"Failed to download torrent file: {error}") from error
    if len(payload) > MAX_TORRENT_FILE_BYTES:
        raise TorrentFileError("Torrent file is too large.")
    if not payload.startswith(b"d"):
        raise TorrentFileError("Downloaded file is not a valid .torrent.")
    return payload


def _skip_value(data: bytes, index: int) -> int:
    """Return the index right after the bencoded value starting at `index`."""
    if index >= len(data):
        raise TorrentFileError("Unexpected end of torrent data.")
    token = data[index:index + 1]
    if token == b"i":
        end = data.index(b"e", index)
        return end + 1
    if token in {b"l", b"d"}:
        index += 1
        while data[index:index + 1] != b"e":
            index = _skip_value(data, index)
        return index + 1
    if token.isdigit():
        colon = data.index(b":", index)
        length = int(data[index:colon])
        return colon + 1 + length
    raise TorrentFileError("Invalid bencode token in torrent data.")


def torrent_info_hash(data: bytes) -> str:
    """SHA-1 of the raw bencoded `info` dictionary (BitTorrent v1 info hash)."""
    try:
        if data[:1] != b"d":
            raise TorrentFileError("Torrent data must be a bencoded dictionary.")
        index = 1
        while data[index:index + 1] != b"e":
            colon = data.index(b":", index)
            key_length = int(data[index:colon])
            key = data[colon + 1:colon + 1 + key_length]
            value_start = colon + 1 + key_length
            value_end = _skip_value(data, value_start)
            if key == b"info":
                return hashlib.sha1(data[value_start:value_end]).hexdigest()
            index = value_end
    except (ValueError, IndexError) as error:
        raise TorrentFileError("Malformed torrent file.") from error
    raise TorrentFileError("Torrent file has no info dictionary.")
