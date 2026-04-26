import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowLeft,
  Film,
  Library,
  Loader2,
  Play,
  Search,
  Settings,
  UserRound,
} from "lucide-react";

import "./App.css";
import { HomePage } from "./features/home/HomePage";
import type { TorrentAddState, TorrentResult, TorrentSortBy, TorrentSortOrder } from "./features/home/types";

type AuthUser = {
  id: string;
  username: string;
  role: string;
  created_at: string;
};

type TokenPair = {
  access_token: string;
  refresh_token: string;
  jellyfin_access_token: string | null;
  jellyfin_status: "ok" | "degraded" | "misconfigured";
  jellyfin_message: string | null;
  token_type: string;
  user: AuthUser;
};

type StoredAuth = {
  accessToken: string;
  refreshToken: string;
  jellyfinAccessToken: string | null;
  jellyfinStatus: "ok" | "degraded" | "misconfigured";
  jellyfinMessage: string | null;
  user: AuthUser;
};

type JellyfinIntegrationStatus = {
  status: "ok" | "degraded" | "misconfigured";
  reachable: boolean;
  auth_ok: boolean;
  api_key_configured: boolean;
  public_base_ok: boolean;
  user_provisioned: boolean;
  libraries_provisioned: boolean;
  message: string | null;
};

type MediaItem = {
  id: string;
  type: string;
  title: string;
  year: number | null;
  external_provider: string | null;
  external_id: string | null;
  parent_id: string | null;
  season_number: number | null;
  episode_number: number | null;
  created_at: string;
};

type MediaItemDetail = MediaItem & {
  children: MediaItem[];
};

type LibraryItem = {
  asset_id: string;
  media_item_id: string;
  media_type: string;
  title: string;
  year: number | null;
  quality_profile: string | null;
  state: string;
  created_at: string;
  is_public?: boolean;
};

type LibraryTorrentItem = {
  info_hash: string;
  torrent_title: string;
  state: string;
  status_group: "downloading" | "completed" | "other";
  progress_percent: number;
  eta_seconds: number | null;
  download_speed: number | null;
  size_bytes: number | null;
  downloaded_bytes: number | null;
  added_at: string | null;
  completed_at: string | null;
  asset_id: string | null;
  media_item_id: string | null;
  media_type: string | null;
  media_title: string | null;
  can_watch: boolean;
  redirect_url: string | null;
  watch_url: string | null;
  watch_reason: "ready" | "syncing" | "sync_failed" | "no_asset" | "not_available" | "legacy_unlinked" | "requires_reauth" | null;
  is_public: boolean;
};

type PublicLibraryTorrentItem = LibraryTorrentItem & {
  owner_username: string;
};

type LibraryTorrentWatchOut = {
  info_hash: string;
  can_watch: boolean;
  redirect_url: string | null;
  watch_url: string | null;
  watch_reason: LibraryTorrentItem["watch_reason"];
  message: string | null;
};

type LibraryTorrentDeleteOut = {
  info_hash: string;
  removed_mapping: boolean;
  removed_entitlement: boolean;
  removed_from_qb: boolean;
  deleted_files: boolean;
  shared_torrent: boolean;
  message: string | null;
};

type LibraryTorrentVisibilityOut = {
  info_hash: string;
  is_public: boolean;
  message: string | null;
};

type PlaySessionOut = {
  state: string;
  redirect_url: string | null;
  iframe_url: string | null;
  prev_asset_id: string | null;
  next_asset_id: string | null;
  message: string | null;
};

type TorrentSearchResponse = {
  query: string;
  count: number;
  details_enrichment_pending?: boolean;
  results: TorrentResult[];
};

type AddTorrentResponse = {
  accepted: boolean;
  mapped: boolean;
  info_hash: string | null;
  message: string;
};

type ApiRequestOptions = {
  auth?: boolean;
  accessTokenOverride?: string;
};

type AdminUser = {
  id: string;
  username: string;
  role: string;
  created_at: string;
};

type Route =
  | { name: "home" }
  | { name: "detail"; mediaId: string }
  | { name: "watch"; assetId: string; mediaId: string | null; title: string | null }
  | { name: "library" }
  | { name: "settings" };

const AUTH_STORAGE_KEY = "swarttube.auth.v1";
const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
const RETRYABLE_AUTH_ERRORS = new Set(["Token expired", "Invalid token signature", "Malformed token"]);

function toStoredAuth(payload: TokenPair, previous: StoredAuth | null = null): StoredAuth {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    jellyfinAccessToken: payload.jellyfin_access_token ?? previous?.jellyfinAccessToken ?? null,
    jellyfinStatus: payload.jellyfin_status ?? previous?.jellyfinStatus ?? "degraded",
    jellyfinMessage: payload.jellyfin_message ?? previous?.jellyfinMessage ?? null,
    user: payload.user,
  };
}

function loadStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistStoredAuth(auth: StoredAuth | null) {
  if (!auth) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

async function readErrorMessage(response: Response): Promise<string> {
  let message = `Request failed: ${response.status}`;
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) message = payload.detail;
  } catch {
    // Keep fallback when payload is not JSON.
  }
  return message;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatBytes(value: number | null) {
  if (!value) return "n/a";
  const gb = value / 1024 / 1024 / 1024;
  return `${gb.toFixed(gb > 10 ? 0 : 1)} GB`;
}

function formatDownloadSpeed(bytesPerSecond: number | null) {
  if (bytesPerSecond === null || bytesPerSecond < 0) return "n/a";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bytesPerSecond;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatEta(seconds: number | null) {
  if (seconds === null || seconds < 0) return "n/a";
  if (seconds === 0) return "0s";

  const total = Math.floor(seconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && parts.length < 2) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${secs}s`);
  return parts.slice(0, 2).join(" ");
}

function mediaTypeLabel(type: string) {
  if (type === "movie") return "Фильм";
  if (type === "series") return "Сериал";
  if (type === "season") return "Сезон";
  if (type === "episode") return "Эпизод";
  return type;
}

function statusTone(state: string) {
  if (isTorrentErrorState(state)) return "is-error";
  if (state === "AVAILABLE" || state === "COMPLETED") return "is-good";
  if (state === "REQUESTED" || state === "DOWNLOADING") return "is-warn";
  return "";
}

function isTorrentErrorState(state: string) {
  const normalized = state.trim().toLowerCase();
  return normalized === "error" || normalized === "missing" || normalized.includes("missingfiles");
}

function torrentStatusLabel(item: LibraryTorrentItem | PublicLibraryTorrentItem) {
  if (item.status_group !== "completed" && isTorrentErrorState(item.state)) return "Ошибка";
  return item.state;
}

function magnetDisplayName(magnetUrl: string): string | null {
  try {
    const query = magnetUrl.includes("?") ? magnetUrl.slice(magnetUrl.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    const raw = params.get("dn");
    if (!raw) return null;
    const decoded = decodeURIComponent(raw.replaceAll("+", "%20")).trim();
    return decoded || null;
  } catch {
    return null;
  }
}

export default function App() {
  const [auth, setAuth] = useState<StoredAuth | null>(() => loadStoredAuth());
  const refreshAuthPromiseRef = useRef<Promise<StoredAuth | null> | null>(null);
  const [route, setRoute] = useState<Route>({ name: "library" });
  const [catalog, setCatalog] = useState<MediaItem[]>([]);
  const [detail, setDetail] = useState<MediaItemDetail | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryTorrents, setLibraryTorrents] = useState<LibraryTorrentItem[]>([]);
  const [publicLibraryTorrents, setPublicLibraryTorrents] = useState<PublicLibraryTorrentItem[]>([]);
  const [jellyfinStatus, setJellyfinStatus] = useState<JellyfinIntegrationStatus | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [magnetInput, setMagnetInput] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TorrentResult[]>([]);
  const [resolution, setResolution] = useState("");
  const [dub, setDub] = useState("");
  const [subtitles, setSubtitles] = useState("");
  const [sortBy, setSortBy] = useState<TorrentSortBy>("relevance");
  const [sortOrder, setSortOrder] = useState<TorrentSortOrder>("desc");
  const [targetMediaType, setTargetMediaType] = useState<"auto" | "movie" | "series">("auto");
  const [searchLoading, setSearchLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchSession, setWatchSession] = useState<PlaySessionOut | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addState, setAddState] = useState<TorrentAddState>({});
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const libraryPollingInFlightRef = useRef(false);

  async function refreshAuthTokens(currentAuth: StoredAuth): Promise<StoredAuth | null> {
    if (refreshAuthPromiseRef.current) {
      return refreshAuthPromiseRef.current;
    }
    const refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: currentAuth.refreshToken }),
        });
        if (!response.ok) {
          return null;
        }
        const payload = (await response.json()) as TokenPair;
        const nextAuth = toStoredAuth(payload, currentAuth);
        persistStoredAuth(nextAuth);
        setAuth(nextAuth);
        return nextAuth;
      } catch {
        return null;
      } finally {
        refreshAuthPromiseRef.current = null;
      }
    })();
    refreshAuthPromiseRef.current = refreshPromise;
    return refreshPromise;
  }

  async function requestJson<T>(path: string, init: RequestInit = {}, opts: ApiRequestOptions = { auth: true }): Promise<T> {
    const performRequest = async (accessToken: string | null): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      if (opts.auth !== false && accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }
      return fetch(`${API_BASE}${path}`, { ...init, headers });
    };

    const initialToken = opts.accessTokenOverride ?? auth?.accessToken ?? null;
    let response = await performRequest(initialToken);
    if (response.ok) {
      return (await response.json()) as T;
    }

    let message = await readErrorMessage(response);
    const shouldTryRefresh =
      opts.auth !== false
      && response.status === 401
      && auth !== null
      && RETRYABLE_AUTH_ERRORS.has(message);

    if (shouldTryRefresh) {
      const refreshedAuth = await refreshAuthTokens(auth);
      if (!refreshedAuth) {
        persistStoredAuth(null);
        setAuth(null);
        throw new Error("Сессия истекла. Войдите снова.");
      }
      response = await performRequest(refreshedAuth.accessToken);
      if (response.ok) {
        return (await response.json()) as T;
      }
      message = await readErrorMessage(response);
    }

    throw new Error(message);
  }

  async function loadDashboardData(activeAuth: StoredAuth) {
    setPageLoading(true);
    const requests: Promise<unknown>[] = [
      requestJson<MediaItem[]>("/catalog/media-items", {}, { accessTokenOverride: activeAuth.accessToken }),
      requestJson<LibraryItem[]>("/library/my", {}, { accessTokenOverride: activeAuth.accessToken }),
      requestJson<LibraryTorrentItem[]>("/library/torrents", {}, { accessTokenOverride: activeAuth.accessToken }),
      requestJson<PublicLibraryTorrentItem[]>("/library/torrents/public", {}, { accessTokenOverride: activeAuth.accessToken }),
      requestJson<JellyfinIntegrationStatus>("/integrations/jellyfin/status", {}, { accessTokenOverride: activeAuth.accessToken }),
    ];
    const isAdmin = activeAuth.user.role === "admin";
    if (isAdmin) requests.push(requestJson<AdminUser[]>("/admin/users", {}, { accessTokenOverride: activeAuth.accessToken }));
    try {
      const [catalogPayload, libraryPayload, libraryTorrentPayload, publicTorrentPayload, jellyfinPayload, adminUsersPayload] =
        await Promise.all(requests);
      setCatalog(catalogPayload as MediaItem[]);
      setLibrary(libraryPayload as LibraryItem[]);
      setLibraryTorrents(libraryTorrentPayload as LibraryTorrentItem[]);
      setPublicLibraryTorrents(publicTorrentPayload as PublicLibraryTorrentItem[]);
      setJellyfinStatus(jellyfinPayload as JellyfinIntegrationStatus);
      setAdminUsers((adminUsersPayload as AdminUser[] | undefined) ?? []);
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить данные.");
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (!auth) return;

    let cancelled = false;
    loadDashboardData(auth).catch(() => undefined);

    return () => {
      cancelled = true;
      if (cancelled) {
        // This keeps the cleanup explicit even though the current requests are not abortable yet.
      }
    };
  }, [auth]);

  useEffect(() => {
    if (!auth || route.name !== "library") return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled || libraryPollingInFlightRef.current) {
        return;
      }
      libraryPollingInFlightRef.current = true;
      try {
        const [libraryTorrentPayload, publicTorrentPayload] = await Promise.all([
          requestJson<LibraryTorrentItem[]>("/library/torrents", {}, { accessTokenOverride: auth.accessToken }),
          requestJson<PublicLibraryTorrentItem[]>("/library/torrents/public", {}, { accessTokenOverride: auth.accessToken }),
        ]);
        if (cancelled) {
          return;
        }
        setLibraryTorrents(libraryTorrentPayload);
        setPublicLibraryTorrents(publicTorrentPayload);
      } catch {
        // Keep the last successful state during transient polling failures.
      } finally {
        libraryPollingInFlightRef.current = false;
      }
    };

    poll().catch(() => undefined);
    const intervalId = window.setInterval(() => {
      poll().catch(() => undefined);
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [auth, route.name]);

  useEffect(() => {
    if (route.name !== "detail" || !auth) return;
    let cancelled = false;
    requestJson<MediaItemDetail>(`/catalog/media-items/${route.mediaId}`)
      .then((payload) => {
        if (!cancelled) setDetail(payload);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, route]);

  const activeDownloads = useMemo(() => {
    const merged: Array<LibraryTorrentItem | PublicLibraryTorrentItem> = [];
    const seen = new Set<string>();
    const append = (item: LibraryTorrentItem | PublicLibraryTorrentItem) => {
      if (item.status_group === "completed") return;
      if (seen.has(item.info_hash)) return;
      seen.add(item.info_hash);
      merged.push(item);
    };
    libraryTorrents.forEach(append);
    publicLibraryTorrents.forEach(append);
    return merged;
  }, [libraryTorrents, publicLibraryTorrents]);
  const completedDownloads = useMemo(
    () => libraryTorrents.filter((item) => item.status_group === "completed"),
    [libraryTorrents]
  );

  async function performAuth(mode: "login" | "register", username: string, password: string) {
    const response = await requestJson<TokenPair>(`/auth/${mode === "login" ? "login" : "register"}`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }, { auth: false });
    const nextAuth = toStoredAuth(response, auth);
    persistStoredAuth(nextAuth);
    setAuth(nextAuth);
    setNotice(mode === "login" ? `Вы вошли как ${response.user.username}` : `Аккаунт ${response.user.username} создан`);
    await loadDashboardData(nextAuth);
  }

  async function searchTorrents() {
    const trimmed = queryInput.trim();
    setQuery(trimmed);
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setSearchLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: trimmed });
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);
      if (resolution) params.set("resolution", resolution);
      if (dub) params.set("dub", dub);
      if (subtitles) params.set("subtitles", subtitles);
      const payload = await requestJson<TorrentSearchResponse>(`/torrent/search?${params.toString()}`);
      setResults(payload.results);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Поиск не удался.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function addTorrent(item: TorrentResult) {
    setAddState((state) => ({ ...state, [item.info_hash]: "loading" }));
    try {
      const magnetUrl = item.download_url?.startsWith("magnet:?") ? item.download_url : null;
      await requestJson<AddTorrentResponse>("/torrent/add", {
        method: "POST",
        body: JSON.stringify({
          media_item_id: null,
          media_title: item.title,
          media_type: targetMediaType === "auto" ? null : targetMediaType,
          info_hash: item.info_hash,
          magnet_url: magnetUrl,
          download_url: item.download_url ?? null,
          provider: item.provider,
          tags: item.tags,
        }),
      });
      setAddState((state) => ({ ...state, [item.info_hash]: "done" }));
      setNotice(`Торрент ${item.title} отправлен в очередь.`);
      if (auth) {
        await loadDashboardData(auth);
      }
    } catch {
      setAddState((state) => ({ ...state, [item.info_hash]: "error" }));
    }
  }

  async function addMagnetTorrent() {
    const trimmed = magnetInput.trim();
    if (!trimmed) {
      setError("Вставьте magnet ссылку.");
      return;
    }
    if (!trimmed.toLowerCase().startsWith("magnet:?")) {
      setError("Некорректная magnet ссылка.");
      return;
    }
    setError(null);
    try {
      const payload = await requestJson<AddTorrentResponse>("/torrent/add", {
        method: "POST",
        body: JSON.stringify({
          media_title: magnetDisplayName(trimmed) ?? "Magnet torrent",
          media_type: targetMediaType === "auto" ? null : targetMediaType,
          magnet_url: trimmed,
        }),
      });
      setMagnetInput("");
      setNotice(payload.message);
      if (auth) {
        await loadDashboardData(auth);
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Не удалось добавить торрент по magnet.");
    }
  }

  async function openTorrentWatch(item: LibraryTorrentItem | PublicLibraryTorrentItem) {
    setWatchLoading(true);
    try {
      const payload = await requestJson<LibraryTorrentWatchOut>(`/library/torrents/${item.info_hash}/watch`, {
        method: "POST",
      });
      if (!payload.can_watch) {
        setNotice(payload.message ?? "Контент ещё не готов к просмотру.");
        return;
      }
      if (payload.redirect_url) {
        window.location.assign(payload.redirect_url);
        return;
      }
      const watchPath = payload.watch_url?.startsWith("/api/")
        ? payload.watch_url.slice(4)
        : payload.watch_url ?? (item.asset_id ? `/watch/assets/${item.asset_id}` : null);
      if (!watchPath) {
        setNotice(payload.message ?? "Сессия просмотра пока недоступна.");
        return;
      }
      const session = await requestJson<PlaySessionOut>(watchPath);
      if (session.redirect_url) {
        window.location.assign(session.redirect_url);
        return;
      }
      setWatchSession(session);
      if (item.asset_id) {
        setRoute({ name: "watch", assetId: item.asset_id, mediaId: item.media_item_id, title: item.media_title });
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Не удалось открыть просмотр.");
    } finally {
      setWatchLoading(false);
    }
  }

  async function openAssetWatch(assetId: string, mediaId: string | null, title: string | null) {
    setWatchLoading(true);
    try {
      const session = await requestJson<PlaySessionOut>(`/watch/assets/${assetId}`);
      if (session.redirect_url) {
        window.location.assign(session.redirect_url);
        return;
      }
      setWatchSession(session);
      setRoute({ name: "watch", assetId, mediaId, title });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Не удалось открыть просмотр.");
    } finally {
      setWatchLoading(false);
    }
  }

  async function toggleVisibility(infoHash: string) {
    const payload = await requestJson<LibraryTorrentVisibilityOut>(`/library/torrents/${infoHash}/visibility`, {
      method: "POST",
    });
    setLibraryTorrents((items) =>
      items.map((item) => (item.info_hash === payload.info_hash ? { ...item, is_public: payload.is_public } : item))
    );
    setNotice(payload.message);
    if (auth) {
      await loadDashboardData(auth);
    }
  }

  async function deleteTorrent(infoHash: string) {
    const payload = await requestJson<LibraryTorrentDeleteOut>(`/library/torrents/${infoHash}`, {
      method: "DELETE",
    });
    setLibraryTorrents((items) => items.filter((item) => item.info_hash !== payload.info_hash));
    setNotice(payload.message);
    if (auth) {
      await loadDashboardData(auth);
    }
  }

  async function createManagedUser(username: string, password: string, role: string) {
    await requestJson<AdminUser>("/admin/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    });
    setNotice(`Пользователь ${username} создан.`);
    if (auth) {
      await loadDashboardData(auth);
    }
  }

  function logout() {
    persistStoredAuth(null);
    setAuth(null);
    setRoute({ name: "library" });
    setWatchSession(null);
  }

  if (!auth) {
    return <AuthPage onAuthenticate={performAuth} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-frame">
          <div className="app-header__inner">
            <button type="button" className="app-brand" onClick={() => setRoute({ name: "library" })}>
              <span className="app-brand__icon">
                <Film size={18} />
              </span>
              <span>
                <div className="app-brand__title">FilmDock</div>
                <div className="app-brand__subtitle">Домашний медиасервер</div>
              </span>
            </button>

            <nav className="app-nav">
              <button type="button" className={cn("app-nav__item", route.name === "library" && "is-active")} onClick={() => setRoute({ name: "library" })}>
                <Library size={16} />
                <span>Библиотека</span>
              </button>
              <button type="button" className={cn("app-nav__item", route.name === "home" && "is-active")} onClick={() => setRoute({ name: "home" })}>
                <Search size={16} />
                <span>Найти</span>
              </button>
            </nav>

            <button type="button" className="app-user-chip" onClick={() => setRoute({ name: "settings" })}>
              <UserRound size={16} />
              <span>{auth.user.username}</span>
            </button>
          </div>
          <div className="app-header__divider" />
        </div>
      </header>

      <main className="app-main">
        <div className="app-frame page-stack">
          {notice ? <div className="notice">{notice}</div> : null}
          {error ? <div className="error-panel">{error}</div> : null}

          {route.name === "home" ? (
            <HomePage
              queryInput={queryInput}
              magnetInput={magnetInput}
              query={query}
              resolution={resolution}
              dub={dub}
              subtitles={subtitles}
              sortBy={sortBy}
              sortOrder={sortOrder}
              targetMediaType={targetMediaType}
              results={results}
              loading={searchLoading}
              error={null}
              addState={addState}
              onQueryInputChange={setQueryInput}
              onMagnetInputChange={setMagnetInput}
              onSearch={searchTorrents}
              onAddByMagnet={addMagnetTorrent}
              onResolutionChange={setResolution}
              onDubChange={setDub}
              onSubtitlesChange={setSubtitles}
              onSortChange={(nextSortBy, nextSortOrder) => {
                setSortBy(nextSortBy);
                setSortOrder(nextSortOrder);
              }}
              onTargetMediaTypeChange={setTargetMediaType}
              onAdd={addTorrent}
            />
          ) : null}

          {route.name === "library" ? (
            <LibraryPage
              loading={pageLoading}
              library={library}
              activeDownloads={activeDownloads}
              completedDownloads={completedDownloads}
              publicLibraryTorrents={publicLibraryTorrents}
              onOpenWatch={openAssetWatch}
              onOpenTorrentWatch={openTorrentWatch}
              onMakePublic={toggleVisibility}
              onDeleteTorrent={deleteTorrent}
            />
          ) : null}

          {route.name === "detail" ? (
            <DetailPage
              detail={detail}
              onBack={() => setRoute({ name: "library" })}
              onRequestLibrary={() => setRoute({ name: "home" })}
            />
          ) : null}

          {route.name === "settings" ? (
            <SettingsPage
              auth={auth}
              jellyfinStatus={jellyfinStatus}
              adminUsers={adminUsers}
              onBack={() => setRoute({ name: "library" })}
              onLogout={logout}
              onCreateUser={createManagedUser}
            />
          ) : null}

          {route.name === "watch" ? (
            <WatchPage
              watchSession={watchSession}
              watchLoading={watchLoading}
              title={route.title}
              onBack={() => setRoute({ name: "library" })}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function AuthPage({
  onAuthenticate,
}: {
  onAuthenticate: (mode: "login" | "register", username: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onAuthenticate(mode, username, password);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-grid">
        <div className="auth-hero">
          <div className="app-brand">
            <span className="app-brand__icon">
              <Film size={18} />
            </span>
            <span>
              <div className="app-brand__title">FilmDock</div>
              <div className="app-brand__subtitle">Домашний медиасервер</div>
            </span>
          </div>
          <h1 className="auth-hero__title">Личная медиатека с доступом по запросу</h1>
          <p className="auth-hero__text">
            Вход в единый интерфейс для каталога, очереди загрузки, библиотеки и воспроизведения через Jellyfin.
          </p>
          <div className="auth-feature-grid">
            <FeatureCard title="Каталог" text="Поиск фильмов и сериалов из единого API." />
            <FeatureCard title="Доступ" text="Пользователь видит только своё и явно публичное." />
            <FeatureCard title="Торренты" text="Собственный поиск и отправка в qBittorrent." />
            <FeatureCard title="Просмотр" text="Запуск плеера через сессию воспроизведения." />
          </div>
        </div>

        <div className="auth-panel">
          <div className="auth-segment">
            <button type="button" className={cn(mode === "login" && "is-active")} onClick={() => setMode("login")}>
              Вход
            </button>
            <button type="button" className={cn(mode === "register" && "is-active")} onClick={() => setMode("register")}>
              Регистрация
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <label className="auth-field">
              <span>Имя пользователя</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={64} required />
            </label>
            <label className="auth-field">
              <span>Пароль</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required />
            </label>
            {error ? <div className="auth-error">{error}</div> : null}
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? <Loader2 className="is-spinning" size={16} /> : null}
              <span>{mode === "login" ? "Войти" : "Создать аккаунт"}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="auth-feature-card">
      <div style={{ fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: "0.35rem", color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

function LibraryPage({
  loading,
  library,
  activeDownloads,
  completedDownloads,
  publicLibraryTorrents,
  onOpenWatch,
  onOpenTorrentWatch,
  onMakePublic,
  onDeleteTorrent,
}: {
  loading: boolean;
  library: LibraryItem[];
  activeDownloads: Array<LibraryTorrentItem | PublicLibraryTorrentItem>;
  completedDownloads: LibraryTorrentItem[];
  publicLibraryTorrents: PublicLibraryTorrentItem[];
  onOpenWatch: (assetId: string, mediaId: string | null, title: string | null) => void;
  onOpenTorrentWatch: (item: LibraryTorrentItem | PublicLibraryTorrentItem) => void;
  onMakePublic: (infoHash: string) => void;
  onDeleteTorrent: (infoHash: string) => void;
}) {
  return (
    <div className="page-stack">
      <div className="library-grid library-grid--pipeline">
        <div className="stack">
          <SectionPanel title="Очередь загрузки" icon={<Library size={17} />} right={<span>{activeDownloads.length}</span>}>
            {loading ? <div className="empty-panel">Загружаем библиотеку...</div> : null}
            <div className="torrent-list">
              {activeDownloads.length === 0 ? (
                <div className="empty-panel">Сейчас нет активных задач.</div>
              ) : (
                activeDownloads.map((item) => (
                  <LibraryTorrentCard
                    key={item.info_hash}
                    item={item}
                    onWatch={onOpenTorrentWatch}
                    onMakePublic={onMakePublic}
                    onDelete={onDeleteTorrent}
                    mode="queue"
                  />
                ))
              )}
            </div>
          </SectionPanel>
        </div>

        <div className="stack">
          <SectionPanel title="Завершенные загрузки" right={<span>{completedDownloads.length}</span>}>
            <div className="torrent-list">
              {completedDownloads.length === 0 ? (
                <div className="empty-panel">Завершённых торрент-задач пока нет.</div>
              ) : (
                completedDownloads.map((item) => (
                  <LibraryTorrentCard
                    key={item.info_hash}
                    item={item}
                    onWatch={onOpenTorrentWatch}
                    onMakePublic={onMakePublic}
                    onDelete={onDeleteTorrent}
                    mode="history"
                  />
                ))
              )}
            </div>
          </SectionPanel>

          <SectionPanel title="Публичные торренты" right={<span>{publicLibraryTorrents.length}</span>}>
            <p className="library-flow__caption">Если владелец сделал торрент публичным, он появится в этом списке.</p>
            <div className="torrent-list">
              {publicLibraryTorrents.length === 0 ? (
                <div className="empty-panel">Публичных торрентов пока нет.</div>
              ) : (
                publicLibraryTorrents.map((item) => <LibraryTorrentCard key={item.info_hash} item={item} onWatch={onOpenTorrentWatch} mode="public" />)
              )}
            </div>
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}

function LibraryTorrentCard({
  item,
  onWatch,
  onMakePublic,
  onDelete,
  mode = "queue",
}: {
  item: LibraryTorrentItem | PublicLibraryTorrentItem;
  onWatch: (item: LibraryTorrentItem | PublicLibraryTorrentItem) => void;
  onMakePublic?: (infoHash: string) => void;
  onDelete?: (infoHash: string) => void;
  mode?: "queue" | "history" | "public";
}) {
  const isPublicList = mode === "public";
  const isForeignPublicInQueue = mode === "queue" && "owner_username" in item;
  const isQueue = mode === "queue";
  const progressValue = Math.max(0, Math.min(100, Math.round(item.progress_percent)));
  const metaItems = [
    { label: "Размер", value: formatBytes(item.size_bytes) },
    { label: "Прогресс", value: `${Math.round(item.progress_percent)}%` },
    ...(isQueue
      ? [
          { label: "Скорость", value: formatDownloadSpeed(item.download_speed) },
          { label: "ETA", value: formatEta(item.eta_seconds) },
        ]
      : []),
    ...("owner_username" in item ? [{ label: "Владелец", value: item.owner_username }] : []),
  ];

  return (
    <article className="library-torrent">
      <div className="library-torrent__top">
        <div className="library-torrent__title">{item.torrent_title}</div>
        <div className={cn("tiny-pill", statusTone(item.state))}>{torrentStatusLabel(item)}</div>
      </div>
      <div className="library-torrent__meta">
        {metaItems.map((entry) => (
          <div key={entry.label} className="library-torrent__meta-item">
            <span className="library-torrent__meta-label">{entry.label}</span>
            <span className="library-torrent__meta-value">{entry.value}</span>
          </div>
        ))}
      </div>
      {isQueue ? (
        <>
          <div className="library-progress__header">
            <span>Ход загрузки</span>
            <span>{progressValue}%</span>
          </div>
          <div className="library-progress">
            <div className="library-progress__bar" style={{ width: `${progressValue}%` }} />
          </div>
        </>
      ) : null}
      <div className="library-torrent__actions">
        <button type="button" className="secondary-button" onClick={() => onWatch(item)}>
          <Play size={15} />
          Открыть в Jellyfin
        </button>
        {!isPublicList && !isForeignPublicInQueue && onMakePublic ? (
          <button type="button" className="secondary-button" onClick={() => onMakePublic(item.info_hash)}>
            {item.is_public ? "Скрыть" : "Сделать публичным"}
          </button>
        ) : null}
        {!isPublicList && !isForeignPublicInQueue && onDelete ? (
          <button type="button" className="secondary-button" onClick={() => onDelete(item.info_hash)}>
            Удалить
          </button>
        ) : null}
      </div>
    </article>
  );
}

function DetailPage({
  detail,
  onBack,
  onRequestLibrary,
}: {
  detail: MediaItemDetail | null;
  onBack: () => void;
  onRequestLibrary: () => void;
}) {
  return (
    <div className="page-stack">
      <button type="button" className="secondary-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Назад
      </button>
      {!detail ? <div className="empty-panel">Детали еще загружаются.</div> : null}
      {detail ? (
        <section className="section-panel">
          <div className="section-panel__body detail-layout">
            <PosterPlaceholder title={detail.title} subtitle={mediaTypeLabel(detail.type)} />
            <div>
              <div className="section-kicker">{mediaTypeLabel(detail.type)}</div>
              <h1 style={{ margin: "0.4rem 0 0", fontSize: "clamp(1.8rem, 5vw, 3rem)", lineHeight: 1.02 }}>
                {detail.title}
              </h1>
              <p style={{ color: "var(--text-muted)", lineHeight: 1.75 }}>
                Карточка медиа с основными деталями и быстрым переходом к поиску торрента.
              </p>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                {detail.year ? <span className="tiny-pill">{detail.year}</span> : null}
                <span className="tiny-pill">{detail.external_provider ?? "catalog"}</span>
                {detail.children.length > 0 ? <span className="tiny-pill">{detail.children.length} дочерних элементов</span> : null}
              </div>
              <button type="button" className="primary-button" onClick={onRequestLibrary}>
                Искать торрент
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SettingsPage({
  auth,
  jellyfinStatus,
  adminUsers,
  onBack,
  onLogout,
  onCreateUser,
}: {
  auth: StoredAuth;
  jellyfinStatus: JellyfinIntegrationStatus | null;
  adminUsers: AdminUser[];
  onBack: () => void;
  onLogout: () => void;
  onCreateUser: (username: string, password: string, role: string) => Promise<void>;
}) {
  const effectiveStatus = jellyfinStatus?.status ?? auth.jellyfinStatus;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [saving, setSaving] = useState(false);

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await onCreateUser(username, password, role);
      setUsername("");
      setPassword("");
      setRole("user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <button type="button" className="secondary-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Назад
      </button>
      <section className="section-panel">
        <div className="section-panel__header">
          <div className="section-panel__title">
            <Settings size={18} />
            Настройки
          </div>
        </div>
        <div className="section-panel__body settings-grid">
          <div className="settings-card">
            <div style={{ fontWeight: 700 }}>Пользователь</div>
            <div style={{ marginTop: "0.55rem" }}>{auth.user.username}</div>
            <div style={{ marginTop: "0.3rem", color: "var(--text-muted)" }}>Роль: {auth.user.role}</div>
          </div>
          <div className="settings-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <div style={{ fontWeight: 700 }}>Jellyfin</div>
              <span className={cn("tiny-pill", effectiveStatus === "ok" ? "is-good" : "is-warn")}>
                {effectiveStatus === "ok" ? "Работает" : effectiveStatus === "misconfigured" ? "Нужна настройка" : "Ограничено"}
              </span>
            </div>
            <div style={{ marginTop: "0.6rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              {jellyfinStatus?.message ?? auth.jellyfinMessage ?? "Статус интеграции неизвестен."}
            </div>
            <div style={{ marginTop: "0.8rem", color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.55 }}>
              Доступ к просмотру контролируется FilmDock: пользователь видит своё и контент, который владелец пометил как публичный.
            </div>
          </div>
          <div className="settings-card">
            <div style={{ fontWeight: 700 }}>Сессия</div>
            <div style={{ marginTop: "0.6rem", color: "var(--text-muted)" }}>Очистить локальные токены доступа.</div>
            <div style={{ marginTop: "1rem" }}>
              <button type="button" className="secondary-button" onClick={onLogout}>
                Выйти
              </button>
            </div>
          </div>
        </div>
      </section>
      {auth.user.role === "admin" ? (
        <section className="section-panel">
          <div className="section-panel__header">
            <div className="section-panel__title">
              <UserRound size={18} />
              Пользователи
            </div>
          </div>
          <div className="section-panel__body">
            <div className="settings-users">
              {adminUsers.map((user) => (
                <div key={user.id} className="settings-user-row">
                  <div>
                    <div style={{ fontWeight: 700 }}>{user.username}</div>
                    <div style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>Роль: {user.role}</div>
                  </div>
                  <span className="tiny-pill">{new Date(user.created_at).toLocaleDateString("ru-RU")}</span>
                </div>
              ))}
            </div>

            <form className="settings-user-form" onSubmit={submitUser}>
              <label className="auth-field">
                <span>Новый пользователь</span>
                <input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={64} required />
              </label>
              <label className="auth-field">
                <span>Пароль</span>
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required />
              </label>
              <label className="auth-field">
                <span>Роль</span>
                <select value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? <Loader2 className="is-spinning" size={16} /> : null}
                Создать пользователя
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function WatchPage({
  watchSession,
  watchLoading,
  title,
  onBack,
}: {
  watchSession: PlaySessionOut | null;
  watchLoading: boolean;
  title: string | null;
  onBack: () => void;
}) {
  return (
    <div className="page-stack">
      <button type="button" className="secondary-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Назад
      </button>
      <section className="watch-stage">
        {watchSession?.iframe_url ? <iframe title={title ?? "Плеер Jellyfin"} src={watchSession.iframe_url} allowFullScreen /> : null}
        {!watchSession?.iframe_url || watchLoading ? (
          <div className="watch-stage__overlay">
            <div className="notice">
              {watchLoading ? "Подготовка контента в Jellyfin..." : watchSession?.message ?? "Сессия воспроизведения отсутствует."}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SectionPanel({
  title,
  right,
  icon,
  children,
}: {
  title: string;
  right?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section-panel">
      <div className="section-panel__header">
        <div className="section-panel__title">
          {icon}
          {title}
        </div>
        {right}
      </div>
      <div className="section-panel__body">{children}</div>
    </section>
  );
}

function PosterPlaceholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="poster-placeholder">
      <div className="poster-placeholder__frame">
        <div style={{ color: "rgba(232, 240, 251, 0.72)", fontSize: "0.78rem" }}>{subtitle}</div>
        <div>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, lineHeight: 1.15 }}>{title}</div>
          <div style={{ marginTop: "0.5rem", color: "rgba(232, 240, 251, 0.7)", fontSize: "0.84rem" }}>FilmDock Library</div>
        </div>
      </div>
    </div>
  );
}
