class TorrentSourceResolver:
    def providers(self) -> list[str]:
        return ["rutracker", "rutor", "nyaa", "anidex", "subsplease"]

