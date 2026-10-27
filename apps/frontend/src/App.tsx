import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./App.css";
import { MobileNav, Sidebar } from "./components/Navigation";
import type { NavId } from "./components/Navigation";
import { ToastStack } from "./components/Toasts";
import type { ToastItem } from "./components/Toasts";
import { AuthPage } from "./features/auth/AuthPage";
import { HomePage } from "./features/home/HomePage";
import type { TorrentAddState, TorrentResult, TorrentSortBy, TorrentSortOrder } from "./features/home/types";
import { LibraryPage } from "./features/library/LibraryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { WatchPage } from "./features/watch/WatchPage";
import { magnetDisplayName } from "./lib/format";
import { resolveTheme, TWEAK_DEFAULTS, useTweaks } from "./lib/theme";
import type {
  AddTorrentResponse, AdminUser, AnyLibraryTorrent, JellyfinIntegrationStatus, LibraryTorrentDeleteOut,
  LibraryTorrentItem, LibraryTorrentVisibilityOut, LibraryTorrentWatchOut, PlaySessionOut,
  PublicLibraryTorrentItem, StoredAuth, TokenPair,
} from "./lib/types";

type TorrentSearchResponse = { query: string; count: number; details_enrichment_pending?: boolean; results: TorrentResult[] };
type ApiRequestOptions = { auth?: boolean; accessTokenOverride?: string };

type Route =
  | { name: "home" }
  | { name: "watch"; assetId: string; mediaId: string | null; title: string | null }
  | { name: "library" }
  | { name: "settings" };

// ─── Constants ─────────────────────────────────────────────────────────────

const AUTH_STORAGE_KEY = "swarttube.auth.v1";
const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
const RETRYABLE_AUTH_ERRORS = new Set(["Token expired", "Invalid token signature", "Malformed token"]);
const LIBRARY_POLL_INTERVAL_MS = 3000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function toStoredAuth(payload: TokenPair, previous: StoredAuth | null = null): StoredAuth {
  return {
    accessToken: payload.access_token, refreshToken: payload.refresh_token,
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
  } catch { return null; }
}

function persistStoredAuth(auth: StoredAuth | null) {
  try {
    if (!auth) { localStorage.removeItem(AUTH_STORAGE_KEY); return; }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch { /* storage unavailable: session lives in memory only */ }
}

async function readErrorMessage(response: Response): Promise<string> {
  let message = `Request failed: ${response.status}`;
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string") message = payload.detail;
  } catch { /* keep fallback */ }
  return message;
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : undefined;
}

// Watch sessions cannot be restored from the URL, so only top-level screens are routable.
const HASH_ROUTES: Record<string, Route> = {
  "#/library": { name: "library" },
  "#/search": { name: "home" },
  "#/settings": { name: "settings" },
};

function routeFromHash(hash: string): Route {
  return HASH_ROUTES[hash] ?? { name: "library" };
}

function routeToHash(route: Route): string {
  if (route.name === "home") return "#/search";
  if (route.name === "settings") return "#/settings";
  if (route.name === "watch") return "#/watch";
  return "#/library";
}

function routeToNav(route: Route): NavId {
  if (route.name === "home") return "search";
  if (route.name === "settings") return "settings";
  return "library";
}

// ─── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [auth, setAuth] = useState<StoredAuth | null>(() => loadStoredAuth());
  const refreshAuthPromiseRef = useRef<Promise<StoredAuth | null> | null>(null);
  const [route, setRouteState] = useState<Route>(() => routeFromHash(window.location.hash));
  const [libraryTorrents, setLibraryTorrents] = useState<LibraryTorrentItem[]>([]);
  const [publicLibraryTorrents, setPublicLibraryTorrents] = useState<PublicLibraryTorrentItem[]>([]);
  const [jellyfinStatus, setJellyfinStatus] = useState<JellyfinIntegrationStatus | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [magnetInput, setMagnetInput] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TorrentResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [dub, setDub] = useState("");
  const [subtitles, setSubtitles] = useState("");
  const [sortBy, setSortBy] = useState<TorrentSortBy>("relevance");
  const [sortOrder, setSortOrder] = useState<TorrentSortOrder>("desc");
  const [searchLoading, setSearchLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchSession, setWatchSession] = useState<PlaySessionOut | null>(null);
  const [addState, setAddState] = useState<TorrentAddState>({});
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const libraryPollingInFlightRef = useRef(false);
  // The full-page spinner is only for the very first load; later refreshes are silent.
  const dashboardLoadedRef = useRef(false);

  const dismissToast = useCallback((id: string) => {
    setToasts(cur => cur.filter(x => x.id !== id));
  }, []);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(cur => [...cur.slice(-3), { ...toast, id }]);
    setTimeout(() => dismissToast(id), toast.kind === "error" ? 8000 : 4000);
  }, [dismissToast]);

  // ── Routing (hash-based so Back/refresh work) ──────────────────────────

  const navigate = useCallback((next: Route) => {
    setRouteState(next);
    const hash = routeToHash(next);
    if (window.location.hash !== hash) window.location.hash = hash;
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setRouteState(current => {
        const next = routeFromHash(window.location.hash);
        // Leaving the player via Back must also drop its session.
        if (current.name === "watch" && window.location.hash === "#/watch") return current;
        return next;
      });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // ── API helpers ────────────────────────────────────────────────────────

  async function refreshAuthTokens(currentAuth: StoredAuth): Promise<StoredAuth | null> {
    if (refreshAuthPromiseRef.current) return refreshAuthPromiseRef.current;
    const refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: currentAuth.refreshToken }),
        });
        if (!response.ok) return null;
        const payload = (await response.json()) as TokenPair;
        const nextAuth = toStoredAuth(payload, currentAuth);
        persistStoredAuth(nextAuth);
        setAuth(nextAuth);
        return nextAuth;
      } catch { return null; }
      finally { refreshAuthPromiseRef.current = null; }
    })();
    refreshAuthPromiseRef.current = refreshPromise;
    return refreshPromise;
  }

  async function requestJson<T>(path: string, init: RequestInit = {}, opts: ApiRequestOptions = { auth: true }): Promise<T> {
    const performRequest = async (accessToken: string | null): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      if (opts.auth !== false && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
      return fetch(`${API_BASE}${path}`, { ...init, headers });
    };
    const initialToken = opts.accessTokenOverride ?? auth?.accessToken ?? null;
    let response = await performRequest(initialToken);
    if (response.ok) return (await response.json()) as T;
    let message = await readErrorMessage(response);
    const shouldTryRefresh = opts.auth !== false && response.status === 401 && auth !== null && RETRYABLE_AUTH_ERRORS.has(message);
    if (shouldTryRefresh) {
      const refreshedAuth = await refreshAuthTokens(auth!);
      if (!refreshedAuth) {
        persistStoredAuth(null);
        setAuth(null);
        throw new Error("Сессия истекла. Войдите снова.");
      }
      response = await performRequest(refreshedAuth.accessToken);
      if (response.ok) return (await response.json()) as T;
      message = await readErrorMessage(response);
    }
    throw new Error(message);
  }

  async function loadDashboardData(activeAuth: StoredAuth) {
    const showSpinner = !dashboardLoadedRef.current;
    if (showSpinner) setPageLoading(true);
    const options = { accessTokenOverride: activeAuth.accessToken };
    const isAdmin = activeAuth.user.role === "admin";
    try {
      const [libraryTorrentPayload, publicTorrentPayload, jellyfinPayload, adminUsersPayload] = await Promise.all([
        requestJson<LibraryTorrentItem[]>("/library/torrents", {}, options),
        requestJson<PublicLibraryTorrentItem[]>("/library/torrents/public", {}, options),
        requestJson<JellyfinIntegrationStatus>("/integrations/jellyfin/status", {}, options),
        isAdmin ? requestJson<AdminUser[]>("/admin/users", {}, options) : Promise.resolve([] as AdminUser[]),
      ]);
      setLibraryTorrents(libraryTorrentPayload);
      setPublicLibraryTorrents(publicTorrentPayload);
      setJellyfinStatus(jellyfinPayload);
      setAdminUsers(adminUsersPayload);
      dashboardLoadedRef.current = true;
    } catch (reason: unknown) {
      pushToast({ title: "Ошибка загрузки", body: errorMessage(reason) ?? "Не удалось загрузить данные.", kind: "error" });
    } finally {
      if (showSpinner) setPageLoading(false);
    }
  }

  const refreshDashboard = () => {
    if (auth) loadDashboardData(auth).catch(() => undefined);
  };

  const authUserId = auth?.user.id ?? null;
  useEffect(() => {
    if (!auth) return;
    loadDashboardData(auth).catch(() => undefined);
    // Reload only when the signed-in user changes, not on every token refresh.
  }, [authUserId]);

  useEffect(() => {
    if (!auth || route.name !== "library") return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || document.hidden || libraryPollingInFlightRef.current) return;
      libraryPollingInFlightRef.current = true;
      try {
        const [libraryTorrentPayload, publicTorrentPayload] = await Promise.all([
          requestJson<LibraryTorrentItem[]>("/library/torrents", {}, { accessTokenOverride: auth.accessToken }),
          requestJson<PublicLibraryTorrentItem[]>("/library/torrents/public", {}, { accessTokenOverride: auth.accessToken }),
        ]);
        if (cancelled) return;
        setLibraryTorrents(libraryTorrentPayload);
        setPublicLibraryTorrents(publicTorrentPayload);
      } catch { /* keep last state */ }
      finally { libraryPollingInFlightRef.current = false; }
    };
    const intervalId = window.setInterval(() => poll().catch(() => undefined), LIBRARY_POLL_INTERVAL_MS);
    const onVisible = () => { if (!document.hidden) poll().catch(() => undefined); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [auth, route.name]);

  const activeDownloads = useMemo(() => {
    const merged: AnyLibraryTorrent[] = [];
    const seen = new Set<string>();
    const append = (item: AnyLibraryTorrent) => {
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
    () => libraryTorrents.filter(item => item.status_group === "completed"),
    [libraryTorrents]
  );

  // ── Actions ────────────────────────────────────────────────────────────

  async function performAuth(mode: "login" | "register", username: string, password: string) {
    const response = await requestJson<TokenPair>(`/auth/${mode}`, {
      method: "POST", body: JSON.stringify({ username, password }),
    }, { auth: false });
    const nextAuth = toStoredAuth(response, auth);
    dashboardLoadedRef.current = false;
    persistStoredAuth(nextAuth);
    setAuth(nextAuth);
    pushToast({ title: mode === "login" ? `Добро пожаловать, ${response.user.username}!` : `Аккаунт ${response.user.username} создан`, kind: "success" });
  }

  async function searchTorrents() {
    const trimmed = queryInput.trim();
    setSearchError(null);
    if (trimmed.length < 2) { setQuery(""); setResults([]); return; }
    setQuery(trimmed);
    setSearchLoading(true);
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
      setResults([]);
      setSearchError(errorMessage(reason) ?? "Не удалось выполнить поиск.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function addTorrent(item: TorrentResult) {
    setAddState(state => ({ ...state, [item.info_hash]: "loading" }));
    try {
      const magnetUrl = item.download_url?.startsWith("magnet:?") ? item.download_url : null;
      await requestJson<AddTorrentResponse>("/torrent/add", {
        method: "POST",
        body: JSON.stringify({
          media_item_id: null, media_title: item.title,
          media_type: null,
          info_hash: item.info_hash, magnet_url: magnetUrl,
          download_url: item.download_url ?? null,
          provider: item.provider,
          tags: item.tags,
        }),
      });
      setAddState(state => ({ ...state, [item.info_hash]: "done" }));
      pushToast({ title: "Загрузка добавлена", body: `${item.title} · ${item.size}`, kind: "success" });
      refreshDashboard();
    } catch (reason: unknown) {
      setAddState(state => ({ ...state, [item.info_hash]: "error" }));
      pushToast({ title: "Не удалось добавить", body: errorMessage(reason), kind: "error" });
    }
  }

  async function addMagnetTorrent(): Promise<boolean> {
    const trimmed = magnetInput.trim();
    if (!trimmed.toLowerCase().startsWith("magnet:?")) {
      pushToast({ title: "Некорректная magnet-ссылка", kind: "error" });
      return false;
    }
    try {
      const payload = await requestJson<AddTorrentResponse>("/torrent/add", {
        method: "POST",
        body: JSON.stringify({ media_title: magnetDisplayName(trimmed) ?? "Magnet torrent", media_type: null, magnet_url: trimmed }),
      });
      setMagnetInput("");
      pushToast({ title: "Загрузка добавлена", body: payload.message || undefined, kind: "success" });
      refreshDashboard();
      return true;
    } catch (reason: unknown) {
      pushToast({ title: "Не удалось добавить", body: errorMessage(reason), kind: "error" });
      return false;
    }
  }

  async function openTorrentWatch(item: AnyLibraryTorrent) {
    setWatchLoading(true);
    try {
      const payload = await requestJson<LibraryTorrentWatchOut>(`/library/torrents/${item.info_hash}/watch`, { method: "POST" });
      if (!payload.can_watch) { pushToast({ title: payload.message ?? "Контент ещё не готов к просмотру.", kind: "info" }); return; }
      if (payload.redirect_url) { window.location.assign(payload.redirect_url); return; }
      const watchPath = payload.watch_url?.startsWith("/api/") ? payload.watch_url.slice(4) : payload.watch_url ?? (item.asset_id ? `/watch/assets/${item.asset_id}` : null);
      if (!watchPath) { pushToast({ title: payload.message ?? "Сессия недоступна.", kind: "info" }); return; }
      const session = await requestJson<PlaySessionOut>(watchPath);
      if (session.redirect_url) { window.location.assign(session.redirect_url); return; }
      setWatchSession(session);
      if (item.asset_id) navigate({ name: "watch", assetId: item.asset_id, mediaId: item.media_item_id, title: item.media_title });
    } catch (reason: unknown) {
      pushToast({ title: "Не удалось открыть просмотр", body: errorMessage(reason), kind: "error" });
    } finally { setWatchLoading(false); }
  }

  async function toggleVisibility(infoHash: string) {
    try {
      const payload = await requestJson<LibraryTorrentVisibilityOut>(`/library/torrents/${infoHash}/visibility`, { method: "POST" });
      setLibraryTorrents(items => items.map(item => item.info_hash === payload.info_hash ? { ...item, is_public: payload.is_public } : item));
      if (payload.message) pushToast({ title: payload.message, kind: "success" });
      refreshDashboard();
    } catch (reason: unknown) {
      pushToast({ title: "Не удалось изменить доступ", body: errorMessage(reason), kind: "error" });
    }
  }

  async function deleteTorrent(infoHash: string) {
    try {
      const payload = await requestJson<LibraryTorrentDeleteOut>(`/library/torrents/${infoHash}`, { method: "DELETE" });
      setLibraryTorrents(items => items.filter(item => item.info_hash !== payload.info_hash));
      pushToast({ title: payload.message ?? "Торрент удалён", kind: "success" });
      refreshDashboard();
    } catch (reason: unknown) {
      pushToast({ title: "Ошибка удаления", body: errorMessage(reason), kind: "error" });
    }
  }

  async function createManagedUser(username: string, password: string, role: string) {
    // Errors propagate to the form, which shows them inline.
    await requestJson<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify({ username, password, role }) });
    pushToast({ title: `Пользователь ${username} создан`, kind: "success" });
    refreshDashboard();
  }

  function logout() {
    persistStoredAuth(null);
    setAuth(null);
    dashboardLoadedRef.current = false;
    setLibraryTorrents([]);
    setPublicLibraryTorrents([]);
    setAdminUsers([]);
    setWatchSession(null);
    navigate({ name: "library" });
  }

  function handleNav(id: NavId) {
    if (id === "search") navigate({ name: "home" });
    else if (id === "settings") navigate({ name: "settings" });
    else navigate({ name: "library" });
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const theme = resolveTheme(t);

  if (!auth) {
    return (
      <div className={`fd-root-auth ${theme.className}`} style={theme.style}>
        <div className="fd-ambient" aria-hidden="true" />
        {theme.grain && <div className="fd-grain" aria-hidden="true" />}
        <AuthPage onAuthenticate={performAuth} />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  // A reload on #/watch has no session to show.
  const effectiveRoute: Route = route.name === "watch" && !watchSession && !watchLoading ? { name: "library" } : route;

  return (
    <div className={`fd-root ${theme.className}`} style={theme.style}>
      <div className="fd-ambient" aria-hidden="true" />
      {theme.grain && <div className="fd-grain" aria-hidden="true" />}

      <Sidebar
        activeNav={routeToNav(effectiveRoute)}
        onNavigate={handleNav}
        username={auth.user.username}
        onLogout={logout}
      />

      <main className="fd-main">
        {effectiveRoute.name === "home" && (
          <HomePage
            queryInput={queryInput} magnetInput={magnetInput} query={query}
            resolution={resolution} dub={dub} subtitles={subtitles}
            sortBy={sortBy} sortOrder={sortOrder}
            results={results} loading={searchLoading} error={searchError} addState={addState}
            onQueryInputChange={setQueryInput} onMagnetInputChange={setMagnetInput}
            onSearch={searchTorrents} onAddByMagnet={addMagnetTorrent}
            onResolutionChange={setResolution} onDubChange={setDub} onSubtitlesChange={setSubtitles}
            onSortChange={(nextSortBy, nextSortOrder) => { setSortBy(nextSortBy); setSortOrder(nextSortOrder); }}
            onAdd={addTorrent}
          />
        )}

        {effectiveRoute.name === "library" && (
          <div className="fd-screen fd-screen-library">
            <LibraryPage
              loading={pageLoading}
              activeDownloads={activeDownloads} completedDownloads={completedDownloads}
              publicLibraryTorrents={publicLibraryTorrents}
              onOpenTorrentWatch={openTorrentWatch}
              onTogglePublic={toggleVisibility} onDeleteTorrent={deleteTorrent}
            />
          </div>
        )}

        {effectiveRoute.name === "settings" && (
          <div className="fd-screen fd-screen-settings">
            <SettingsPage
              auth={auth} jellyfinStatus={jellyfinStatus}
              adminUsers={adminUsers} t={t} setTweak={setTweak}
              onLogout={logout} onCreateUser={createManagedUser}
            />
          </div>
        )}

        {effectiveRoute.name === "watch" && (
          <WatchPage
            watchSession={watchSession} watchLoading={watchLoading}
            title={effectiveRoute.title} onBack={() => { setWatchSession(null); navigate({ name: "library" }); }}
          />
        )}
      </main>

      <MobileNav activeNav={routeToNav(effectiveRoute)} onNavigate={handleNav} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
