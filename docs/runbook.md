# FilmDock Runbook

## Ports

- `8080`: nginx
- `8080/jellyfin`: Jellyfin via nginx
- `8080/qbittorrent`: qBittorrent via nginx
- `8081`: qBittorrent direct Web UI
- `8096`: Jellyfin direct port
- `6881/tcp,udp`: qBittorrent torrent traffic
- `4173`: frontend preview
- `8000`: API
- `8001`: worker health

## Health checks

- `GET /api/health`
- `GET /api/integrations/jellyfin/status`
- `GET /health` on the worker

## Known gaps in the reconstruction

- SQLite is used directly for now instead of SQLAlchemy/Alembic
- no real qBittorrent authentication or mutation
- no real Jellyfin account provisioning yet
- no live Jellyfin item sync yet
- no real torrent scraping beyond stubbed providers

## Expected next implementation passes

1. Replace the in-memory repositories with SQLAlchemy models and a real database.
2. Implement provider adapters behind `torrent_search_service`.
3. Add qBittorrent and Jellyfin authentication wiring and integration tests.
4. Split the frontend mock state out of `App.tsx` into typed API clients and feature slices.
