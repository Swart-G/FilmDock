class TorrentStatusService:
    def watch_reason_label(self, reason: str | None) -> str:
        mapping = {
            "ready": "ready",
            "syncing": "syncing",
            "sync_failed": "sync_failed",
            "no_asset": "no_asset",
            "not_available": "not_available",
            "legacy_unlinked": "legacy_unlinked",
            "requires_reauth": "requires_reauth",
        }
        return mapping.get(reason, "unknown")

