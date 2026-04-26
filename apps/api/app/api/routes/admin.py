from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import hash_password
from app.dependencies import require_admin
from app.repositories import create_user, get_user_by_username, list_jobs, list_users
from app.schemas.admin import AdminUserCreateIn, AdminUserOut
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


@router.get("/jobs")
def jobs(_: dict[str, object] = Depends(require_admin)) -> list[dict[str, object]]:
    return list_jobs()


@router.get("/users", response_model=list[AdminUserOut])
def users(_: dict[str, object] = Depends(require_admin)) -> list[AdminUserOut]:
    return [AdminUserOut.model_validate(item) for item in list_users()]


@router.post("/users", response_model=AdminUserOut)
def create_admin_user(payload: AdminUserCreateIn, _: dict[str, object] = Depends(require_admin)) -> AdminUserOut:
    if get_user_by_username(payload.username) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    try:
        jellyfin_account_service.ensure_user(payload.username, payload.password)
    except JellyfinAccountConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except JellyfinAccountConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except JellyfinAccountProvisionError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    created = create_user(payload.username, hash_password(payload.password), role=payload.role)
    try:
        jellyfin_access_service.sync_user_policy(created)
    except JellyfinConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except JellyfinNetworkError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    except JellyfinRequestError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Jellyfin policy update failed: HTTP {error.status_code}") from error
    return AdminUserOut.model_validate(created)
