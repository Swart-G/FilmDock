# FilmDock

Reconstructed and upgraded baseline of the lost home media server project.

The repository is rebuilt from recovered Codex sessions, Docker metadata, shell history, and frontend screenshots. It is not a byte-for-byte restore of the original codebase. It is now a runnable self-hosted baseline that preserves the recovered architecture:

- `apps/frontend`: React + TypeScript + Vite SPA
- `apps/api`: FastAPI service with recovered route groups
- `apps/worker`: background worker skeleton for sync and torrent tasks
- `infra/nginx`: reverse proxy for frontend and API

## Product shape

FilmDock is a home media dashboard for:

- catalog browsing
- torrent search and add flows
- download queue monitoring
- personal library management
- Jellyfin playback handoff

## Run locally

### Container-first run

```bash
cp .env.example .env
mkdir -p data downloads media
docker compose up --build
```

Open `http://localhost:8080`.

FilmDock does not bootstrap any local users. Create the first account from the registration form.

### Jellyfin configuration

Set these values in `.env`:

- `SWARTTUBE_JELLYFIN_BASE_URL`: internal URL visible from the API container
- `SWARTTUBE_JELLYFIN_PUBLIC_BASE_URL`: browser-facing Jellyfin URL
- `SWARTTUBE_JELLYFIN_API_KEY`: Jellyfin API key
- `SWARTTUBE_JELLYFIN_ADMIN_USER_ID`: optional, reserved for future provisioning work

### qBittorrent configuration

Set these values in `.env`:

- `SWARTTUBE_QBITTORRENT_BASE_URL`: internal URL visible from the API container
- `SWARTTUBE_QBITTORRENT_ADMIN_USERNAME`: qBittorrent WebUI admin username
- `SWARTTUBE_QBITTORRENT_ADMIN_PASSWORD`: qBittorrent WebUI admin password

`docker compose` applies `SWARTTUBE_QBITTORRENT_ADMIN_USERNAME/PASSWORD` to qBittorrent on startup via a custom init script, so the same credentials can be used by FilmDock services.

Bundled service ports in this compose:

- `8080`: FilmDock nginx
- `8080/jellyfin`: Jellyfin via nginx
- `8080/qbittorrent`: qBittorrent via nginx
- `18081`: qBittorrent direct Web UI
- `8096`: Jellyfin direct port
- `6881/tcp,udp`: qBittorrent torrent port

Current baseline enforces visibility and watch permission inside FilmDock: a user sees their own downloads and content explicitly made public by another user.

### API

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd apps/frontend
npm install
npm run dev
```

### Worker

```bash
cd apps/worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

### Docker Compose

```bash
docker compose up --build
```

## Recovered constraints

- dark glass dashboard UI
- top segmented navigation: `Библиотека` / `Найти`
- auth flow with local token storage `filmdock.auth.v1`
- route families: `auth`, `catalog`, `library`, `torrent`, `watch`, `admin`, `integrations`
- integrations: Jellyfin, qBittorrent, multiple torrent providers

## Status

This repo is a reconstruction baseline with persistent state. The service contracts, domain names, screens, auth, and access model are restored from evidence. Real torrent scraping, qBittorrent control, and full Jellyfin user/library provisioning are still partial and should be completed incrementally.
