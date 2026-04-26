class TorrentEnrichmentService:
    def enrich(self, info_hash: str) -> dict[str, str]:
        return {"info_hash": info_hash, "state": "enriched_stub"}

