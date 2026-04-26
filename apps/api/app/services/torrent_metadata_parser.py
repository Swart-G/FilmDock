class TorrentMetadataParser:
    def parse(self, title: str) -> dict[str, str | None]:
        lowered = title.lower()
        return {
            "resolution": "1080p" if "1080" in lowered else None,
            "dub": "RU" if "ru" in lowered else None,
            "subtitles": "EN, JP" if "sub" in lowered else None,
        }

