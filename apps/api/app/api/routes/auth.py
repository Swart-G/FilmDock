from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, hash_password, verify_password
from app.schemas.auth import AuthUserOut, LoginIn, RefreshIn, TokenPairOut
from app.repositories import consume_refresh_token, create_user, get_user_by_username, persist_refresh_token
from app.services.jellyfin_account import (
    JellyfinAccountConfigurationError,
    JellyfinAccountConflictError,
    JellyfinAccountProvisionError,
    JellyfinAccountService,
)
from app.services.jellyfin_access import JellyfinAccessService
from app.services.jellyfin_client import JellyfinConfigurationError, JellyfinNetworkError, JellyfinRequestError

router = APIRouter()
jellyfin_account_service = JellyfinAccountService()
jellyfin_access_service = JellyfinAccessService()


def build_token_pair(user: dict[str, object]) -> TokenPairOut:
    refresh_token = create_refresh_token()
    persist_refresh_token(str(user["id"]), refresh_token)
    jellyfin_configured = bool(settings.jellyfin_base_url and settings.jellyfin_api_key)
    return TokenPairOut(
        access_token=create_access_token(str(user["id"]), str(user["username"]), str(user["role"])),
        refresh_token=refresh_token,
        jellyfin_access_token=None,
        jellyfin_status="ok" if jellyfin_configured else "misconfigured",
        jellyfin_message="Jellyfin credentials are configured." if jellyfin_configured else "Set SWARTTUBE_JELLYFIN_BASE_URL and SWARTTUBE_JELLYFIN_API_KEY.",
        user=AuthUserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenPairOut)
def login(payload: LoginIn) -> TokenPairOut:
    user = get_user_by_username(payload.username)
    if user is None or not verify_password(payload.password, str(user["password_hash"])):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    return build_token_pair(user)


@router.post("/register", response_model=TokenPairOut)
def register(payload: LoginIn) -> TokenPairOut:
    existing = get_user_by_username(payload.username)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    try:
        jellyfin_account_service.ensure_user(payload.username, payload.password)
    except JellyfinAccountConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except JellyfinAccountConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except JellyfinAccountProvisionError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    user = create_user(payload.username, hash_password(payload.password), role="user")
    try:
        jellyfin_access_service.sync_user_policy(user)
    except JellyfinConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except JellyfinNetworkError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    except JellyfinRequestError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Jellyfin policy update failed: HTTP {error.status_code}") from error
    return build_token_pair(user)


@router.post("/refresh", response_model=TokenPairOut)
def refresh(payload: RefreshIn) -> TokenPairOut:
    user = consume_refresh_token(payload.refresh_token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    return build_token_pair(user)
