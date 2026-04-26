from pydantic import BaseModel, Field, model_validator


class TorrentResultOut(BaseModel):
    info_hash: str
    title: str
    provider: str
    seeders: int
    leechers: int
    size: str
    size_bytes: int | None = None
    published_at: str
    resolution: str | None = None
    dub: str | None = None
    subtitles: str | None = None
    tags: list[str] = Field(default_factory=list)
    download_url: str | None = None


class TorrentSearchResponseOut(BaseModel):
    query: str
    count: int
    details_enrichment_pending: bool = False
    results: list[TorrentResultOut]


class TorrentExclusionsResponseOut(BaseModel):
    info_hashes: list[str]


class AddTorrentIn(BaseModel):
    media_item_id: str | None = None
    media_title: str | None = None
    media_type: str | None = None
    info_hash: str | None = None
    magnet_url: str | None = None
    download_url: str | None = None

    @model_validator(mode="after")
    def validate_source(self) -> "AddTorrentIn":
        if self.info_hash or self.magnet_url or self.download_url:
            return self
        raise ValueError("Provide info_hash, magnet_url, or download_url.")


class AddTorrentResponseOut(BaseModel):
    accepted: bool
    mapped: bool
    info_hash: str | None
    message: str
