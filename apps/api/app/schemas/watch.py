from pydantic import BaseModel


class PlaySessionOut(BaseModel):
    state: str
    redirect_url: str | None
    iframe_url: str | None
    prev_asset_id: str | None
    next_asset_id: str | None
    message: str | None

