class JellyfinSyncStateService:
    def current_state(self) -> dict[str, str]:
        return {"state": "syncing", "message": "Синхронизация Jellyfin выполняется."}
