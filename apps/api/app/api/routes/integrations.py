from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.dependencies import require_user
from app.schemas.integrations import JellyfinIntegrationStatusOut, QBittorrentSessionOut
from app.services.jellyfin_client import JellyfinClient
from app.services.qbittorrent_client import QBittorrentClient

router = APIRouter()
jellyfin_client = JellyfinClient()
qbittorrent_client = QBittorrentClient()


@router.get("/jellyfin/status", response_model=JellyfinIntegrationStatusOut)
def jellyfin_status() -> JellyfinIntegrationStatusOut:
    return JellyfinIntegrationStatusOut.model_validate(jellyfin_client.status())


@router.post("/qbittorrent/session", response_model=QBittorrentSessionOut)
def qbittorrent_session(response: Response, _user=Depends(require_user)) -> QBittorrentSessionOut:
    try:
        sid = qbittorrent_client.create_webui_session()
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error

    response.set_cookie(
        key="SID",
        value=sid,
        httponly=True,
        samesite="lax",
        path="/qbittorrent/",
    )
    return QBittorrentSessionOut(
        redirect_url="/qbittorrent/",
        message="qBittorrent session prepared.",
    )
