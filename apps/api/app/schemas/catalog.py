from pydantic import BaseModel


class MediaItemOut(BaseModel):
    id: str
    type: str
    title: str
    year: int | None
    external_provider: str | None
    external_id: str | None
    parent_id: str | None
    season_number: int | None
    episode_number: int | None
    created_at: str


class MediaItemDetailOut(MediaItemOut):
    children: list[MediaItemOut]


class LibraryRequestOut(BaseModel):
    state: str
    asset_id: str | None
    message: str | None

