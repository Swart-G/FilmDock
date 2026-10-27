export type AuthUser = { id: string; username: string; role: string; created_at: string };

export type JellyfinState = "ok" | "degraded" | "misconfigured";

export type TokenPair = {
  access_token: string; refresh_token: string;
  jellyfin_access_token: string | null;
  jellyfin_status: JellyfinState;
  jellyfin_message: string | null;
  token_type: string; user: AuthUser;
};

export type StoredAuth = {
  accessToken: string; refreshToken: string;
  jellyfinAccessToken: string | null;
  jellyfinStatus: JellyfinState;
  jellyfinMessage: string | null; user: AuthUser;
};

export type JellyfinIntegrationStatus = {
  status: JellyfinState; reachable: boolean; auth_ok: boolean;
  api_key_configured: boolean; public_base_ok: boolean; user_provisioned: boolean;
  libraries_provisioned: boolean; message: string | null;
};

export type LibraryTorrentItem = {
  info_hash: string; torrent_title: string; state: string;
  status_group: "downloading" | "completed" | "other";
  progress_percent: number; eta_seconds: number | null;
  download_speed: number | null; size_bytes: number | null; downloaded_bytes: number | null;
  added_at: string | null; completed_at: string | null;
  asset_id: string | null; media_item_id: string | null;
  media_type: string | null; media_title: string | null;
  can_watch: boolean; redirect_url: string | null; watch_url: string | null;
  watch_reason: "ready" | "syncing" | "sync_failed" | "no_asset" | "not_available" | "legacy_unlinked" | "requires_reauth" | null;
  is_public: boolean;
};

export type PublicLibraryTorrentItem = LibraryTorrentItem & { owner_username: string };

export type AnyLibraryTorrent = LibraryTorrentItem | PublicLibraryTorrentItem;

export type LibraryTorrentWatchOut = {
  info_hash: string; can_watch: boolean; redirect_url: string | null;
  watch_url: string | null; watch_reason: LibraryTorrentItem["watch_reason"]; message: string | null;
};

export type LibraryTorrentDeleteOut = {
  info_hash: string; removed_mapping: boolean; removed_entitlement: boolean;
  removed_from_qb: boolean; deleted_files: boolean; shared_torrent: boolean; message: string | null;
};

export type LibraryTorrentVisibilityOut = { info_hash: string; is_public: boolean; message: string | null };

export type PlaySessionOut = {
  state: string; redirect_url: string | null; iframe_url: string | null;
  prev_asset_id: string | null; next_asset_id: string | null; message: string | null;
};

export type AddTorrentResponse = { accepted: boolean; mapped: boolean; info_hash: string | null; message: string };
export type AdminUser = { id: string; username: string; role: string; created_at: string };

export function isForeignTorrent(item: AnyLibraryTorrent): item is PublicLibraryTorrentItem {
  return "owner_username" in item;
}
