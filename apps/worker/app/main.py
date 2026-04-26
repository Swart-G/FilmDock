from datetime import datetime, timezone

from fastapi import FastAPI


app = FastAPI(title="FilmDock Worker", version="0.1.0")


def current_jobs() -> list[dict[str, str]]:
    now = datetime.now(timezone.utc).isoformat()
    return [
        {
            "id": "worker-j1",
            "kind": "jellyfin_sync",
            "state": "running",
            "updated_at": now,
            "message": "Tracking reconstructed Jellyfin synchronization state.",
        },
        {
            "id": "worker-j2",
            "kind": "torrent_status",
            "state": "idle",
            "updated_at": now,
            "message": "Polling qBittorrent state is stubbed in the reconstructed baseline.",
        },
    ]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/jobs")
def jobs() -> list[dict[str, str]]:
    return current_jobs()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
