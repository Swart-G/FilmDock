# FilmDock Architecture

## Recovered topology

FilmDock is a three-service monorepo:

- `frontend`: single-page dashboard
- `api`: application backend and orchestration layer
- `worker`: background sync and job processor

Infra components:

- `nginx`: public entrypoint and reverse proxy
- `Jellyfin`: playback target and media library source
- `qBittorrent`: torrent client
- local media storage

## Backend modules recovered from traces

Route groups:

- `/auth`
- `/catalog`
- `/library`
- `/torrent`
- `/watch`
- `/admin`
- `/integrations`

Domain entities recovered from file names and frontend types:

- `user`
- `media`
- `asset`
- `entitlement`
- `user_torrent`
- `jellyfin`
- `job`

Service names recovered from traces:

- `jellyfin_client`
- `jellyfin_account`
- `jellyfin_sync_state`
- `qbittorrent_client`
- `torrent_search_service`
- `torrent_source_resolver`
- `torrent_enrichment`
- `torrent_status`
- `torrent_metadata_parser`
- `torrent_identity`
- `media_paths`
- `watch`

Provider names recovered from traces:

- `rutracker`
- `rutor`
- `nyaa`
- `anidex`
- `subsplease`

## Data flow

1. User authenticates in the SPA and receives `access_token`, `refresh_token`, and optional `jellyfin_access_token`.
2. SPA queries catalog endpoints for media items and detail trees.
3. Torrent search aggregates results from multiple providers.
4. Add-to-library sends a torrent to qBittorrent and creates an asset or entitlement mapping.
5. Worker tracks torrent progress and synchronization state with Jellyfin.
6. Library and public torrent views expose watchability, visibility, and deletion flows.
7. Watch flow produces a Jellyfin redirect or iframe session.

## Reconstruction note

The current implementation keeps the recovered shape and contracts but uses mock repositories and in-memory state instead of the original persistent stack.
