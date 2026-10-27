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


PBKDF2_ITERATIONS = 390_000


def _legacy_hash_password(password: str) -> str:
    return hashlib.sha256(f"{settings.auth_secret}:{password}".encode()).hexdigest()


def hash_password(password: str) -> str:
    salt = token_urlsafe(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, password_hash: str) -> bool:
    if password_hash.startswith("pbkdf2_sha256$"):
        try:
            _, iterations, salt, expected = password_hash.split("$", 3)
            digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations)).hex()
        except ValueError:
            return False
        return hmac.compare_digest(digest, expected)
    return hmac.compare_digest(_legacy_hash_password(password), password_hash)


def password_needs_rehash(password_hash: str) -> bool:
    return not password_hash.startswith("pbkdf2_sha256$")


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
