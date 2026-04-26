import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe

from app.core.config import settings


def _b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def hash_password(password: str) -> str:
    return hashlib.sha256(f"{settings.auth_secret}:{password}".encode()).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password), password_hash)


def create_access_token(user_id: str, username: str, role: str) -> str:
    header = _b64_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64_encode(
        json.dumps(
            {
                "sub": user_id,
                "username": username,
                "role": role,
                "exp": int((datetime.now(UTC) + timedelta(seconds=settings.access_token_ttl_seconds)).timestamp()),
            }
        ).encode()
    )
    signature = _b64_encode(hmac.new(settings.auth_secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def decode_access_token(token: str) -> dict[str, object]:
    try:
        header, payload, signature = token.split(".")
    except ValueError as error:
        raise ValueError("Malformed token") from error
    expected = _b64_encode(hmac.new(settings.auth_secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, signature):
        raise ValueError("Invalid token signature")
    data = json.loads(_b64_decode(payload))
    if int(data["exp"]) < int(datetime.now(UTC).timestamp()):
        raise ValueError("Token expired")
    return data


def create_refresh_token() -> str:
    return f"st_refresh_{token_urlsafe(24)}"


def create_jellyfin_token() -> str | None:
    if not settings.jellyfin_api_key:
        return None
    return settings.jellyfin_api_key
