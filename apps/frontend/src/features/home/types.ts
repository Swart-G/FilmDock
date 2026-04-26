export type TorrentSortBy = "relevance" | "seeders" | "leechers" | "date" | "size" | "quality";
export type TorrentSortOrder = "desc" | "asc";

export type TorrentResult = {
  info_hash: string;
  title: string;
  provider: string;
  seeders: number;
  leechers: number;
  size: string;
  size_bytes?: number | null;
  published_at: string;
  resolution?: string | null;
  dub?: string | null;
  subtitles?: string | null;
  tags: string[];
  download_url?: string | null;
};

export type TorrentAddState = Record<string, "idle" | "loading" | "done" | "error">;
