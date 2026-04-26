from pydantic import BaseModel


class JellyfinIntegrationStatusOut(BaseModel):
    status: str
    reachable: bool
    auth_ok: bool
    api_key_configured: bool
    public_base_ok: bool
    user_provisioned: bool
    libraries_provisioned: bool
    message: str | None


class QBittorrentSessionOut(BaseModel):
    redirect_url: str
    message: str | None = None
