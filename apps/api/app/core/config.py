from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "FilmDock"
    env: str = "development"
    db_path: str = "/data/swarttube.db"
    public_base: str = "http://localhost:5173"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    auth_secret: str = "change-me"
    access_token_ttl_seconds: int = 3600
    jellyfin_base_url: str | None = None
    jellyfin_api_key: str | None = None
    jellyfin_public_base_url: str | None = None
    jellyfin_admin_user_id: str | None = None
    qbittorrent_base_url: str = "http://qbittorrent:8080"
    qbittorrent_admin_username: str = "admin"
    qbittorrent_admin_password: str = "change-this-qb-password"
    rutracker_mirrors: list[str] = [
        "https://rutracker.org",
    ]
    rutracker_username: str | None = None
    rutracker_password: str | None = None
    rutracker_ru_mirrors: list[str] = [
        "https://rutracker.ru",
    ]
    rutor_mirrors: list[str] = [
        "https://rutor.info",
        "https://rutor.is",
    ]
    kinozal_mirrors: list[str] = [
        "https://kinozal.me",
        "https://kinozal.tv",
    ]
    kinozal_username: str | None = None
    kinozal_password: str | None = None
    nnmclub_mirrors: list[str] = [
        "https://nnmclub.to",
    ]
    anilibria_base_url: str = "https://anilibria.top"
    nyaa_base_url: str = "https://nyaa.si"
    yts_base_url: str = "https://yts.lt"
    animetosho_rss_url: str = "https://feed.animetosho.org/rss2"
    torrent_search_timeout_seconds: float = 12.0
    torrent_search_max_results: int = 300
    torrent_search_min_results: int = 24
    torrent_search_target_results: int = 200
    torrent_search_query_expansion_enabled: bool = True
    torrent_search_fallback_enabled: bool = True
    apibay_base_url: str = "https://apibay.org"

    model_config = SettingsConfigDict(env_prefix="SWARTTUBE_", extra="ignore")


settings = Settings()
