import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Library,
  Loader2,
  LogOut,
  Search,
  Settings,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import "./App.css";
import { HomePage } from "./features/home/HomePage";
import type { TorrentAddState, TorrentResult, TorrentSortBy, TorrentSortOrder } from "./features/home/types";

// ─── Types ──────────────────────────────────────────────────────────────────

type AuthUser = { id: string; username: string; role: string; created_at: string };

type TokenPair = {
  access_token: string; refresh_token: string;
  jellyfin_access_token: string | null;
  jellyfin_status: "ok" | "degraded" | "misconfigured";
  jellyfin_message: string | null;
  token_type: string; user: AuthUser;
};

type StoredAuth = {
  accessToken: string; refreshToken: string;
  jellyfinAccessToken: string | null;
  jellyfinStatus: "ok" | "degraded" | "misconfigured";
  jellyfinMessage: string | null; user: AuthUser;
};

type JellyfinIntegrationStatus = {
  status: "ok" | "degraded" | "misconfigured"; reachable: boolean; auth_ok: boolean;
  api_key_configured: boolean; public_base_ok: boolean; user_provisioned: boolean;
  libraries_provisioned: boolean; message: string | null;
};

type MediaItem = {
  id: string; type: string; title: string; year: number | null;
  external_provider: string | null; external_id: string | null; parent_id: string | null;
  season_number: number | null; episode_number: number | null; created_at: string;
};

type MediaItemDetail = MediaItem & { children: MediaItem[] };

type LibraryItem = {
  asset_id: string; media_item_id: string; media_type: string; title: string;
  year: number | null; quality_profile: string | null; state: string;
  created_at: string; is_public?: boolean;
};

type LibraryTorrentItem = {
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

type PublicLibraryTorrentItem = LibraryTorrentItem & { owner_username: string };

type LibraryTorrentWatchOut = {
  info_hash: string; can_watch: boolean; redirect_url: string | null;
  watch_url: string | null; watch_reason: LibraryTorrentItem["watch_reason"]; message: string | null;
};

type LibraryTorrentDeleteOut = {
  info_hash: string; removed_mapping: boolean; removed_entitlement: boolean;
  removed_from_qb: boolean; deleted_files: boolean; shared_torrent: boolean; message: string | null;
};

type LibraryTorrentVisibilityOut = { info_hash: string; is_public: boolean; message: string | null };

type PlaySessionOut = {
  state: string; redirect_url: string | null; iframe_url: string | null;
  prev_asset_id: string | null; next_asset_id: string | null; message: string | null;
};

type TorrentSearchResponse = { query: string; count: number; details_enrichment_pending?: boolean; results: TorrentResult[] };
type AddTorrentResponse = { accepted: boolean; mapped: boolean; info_hash: string | null; message: string };
type ApiRequestOptions = { auth?: boolean; accessTokenOverride?: string };
type AdminUser = { id: string; username: string; role: string; created_at: string };

type Route =
  | { name: "home" }
  | { name: "detail"; mediaId: string }
  | { name: "watch"; assetId: string; mediaId: string | null; title: string | null }
  | { name: "library" }
  | { name: "settings" };

// ─── Theme system ──────────────────────────────────────────────────────────

type ThemeVars = {
  bg: string; bg2: string; surface: string; surfaceHi: string;
  text: string; muted: string; dim: string; border: string; borderHi: string;
  grain: boolean; bgImg: string;
};

type TweakDirection = "noir" | "aurora";
type TweakAccent = "amber" | "magenta" | "electric";
type TweakFont = "inter" | "plex" | "manrope";
type TweakTheme = "dark" | "light";

type Tweaks = {
  direction: TweakDirection; accent: TweakAccent; density: string;
  glow: number; radius: number; font: TweakFont; theme: TweakTheme;
};

const TWEAK_DEFAULTS: Tweaks = {
  direction: "noir", accent: "amber", density: "cozy",
  glow: 60, radius: 14, font: "inter", theme: "dark",
};

const DIRECTIONS: Record<TweakDirection, { label: string; dark: ThemeVars; light: ThemeVars }> = {
  noir: {
    label: "Noir",
    dark: {
      bg: "#0B0B0F", bg2: "#141318",
      surface: "rgba(255,255,255,0.04)", surfaceHi: "rgba(255,255,255,0.07)",
      text: "#F4F1EA", muted: "rgba(244,241,234,0.58)", dim: "rgba(244,241,234,0.4)",
      border: "rgba(255,255,255,0.07)", borderHi: "rgba(255,255,255,0.14)",
      grain: true,
      bgImg: `radial-gradient(1200px 700px at 88% -20%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 60%),
              radial-gradient(900px 600px at -10% 100%, color-mix(in oklab, var(--accent2) 14%, transparent), transparent 55%)`,
    },
    light: {
      bg: "#F5F2EC", bg2: "#EDE9DF",
      surface: "rgba(255,255,255,0.65)", surfaceHi: "rgba(255,255,255,0.88)",
      text: "#1C1917", muted: "rgba(28,25,23,0.60)", dim: "rgba(28,25,23,0.42)",
      border: "rgba(0,0,0,0.08)", borderHi: "rgba(0,0,0,0.16)",
      grain: true,
      bgImg: `radial-gradient(1200px 700px at 88% -20%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 60%),
              radial-gradient(900px 600px at -10% 100%, color-mix(in oklab, var(--accent2) 10%, transparent), transparent 55%)`,
    },
  },
  aurora: {
    label: "Aurora",
    dark: {
      bg: "#070912", bg2: "#0E1226",
      surface: "rgba(255,255,255,0.05)", surfaceHi: "rgba(255,255,255,0.09)",
      text: "#EFF1FA", muted: "rgba(239,241,250,0.6)", dim: "rgba(239,241,250,0.4)",
      border: "rgba(255,255,255,0.08)", borderHi: "rgba(255,255,255,0.16)",
      grain: false,
      bgImg: `radial-gradient(1400px 900px at 80% -10%, color-mix(in oklab, var(--accent) 32%, transparent), transparent 55%),
              radial-gradient(1100px 800px at -5% 110%, color-mix(in oklab, var(--accent2) 28%, transparent), transparent 60%),
              radial-gradient(700px 500px at 50% 50%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 70%)`,
    },
    light: {
      bg: "#EEF1FA", bg2: "#E3E9F7",
      surface: "rgba(255,255,255,0.65)", surfaceHi: "rgba(255,255,255,0.88)",
      text: "#0D1227", muted: "rgba(13,18,39,0.60)", dim: "rgba(13,18,39,0.40)",
      border: "rgba(0,0,0,0.08)", borderHi: "rgba(0,0,0,0.15)",
      grain: false,
      bgImg: `radial-gradient(1400px 900px at 80% -10%, color-mix(in oklab, var(--accent) 20%, transparent), transparent 55%),
              radial-gradient(1100px 800px at -5% 110%, color-mix(in oklab, var(--accent2) 16%, transparent), transparent 60%)`,
    },
  },
};

const ACCENTS: Record<TweakAccent, { hex: string; hex2: string; name: string }> = {
  amber:    { hex: "#FFB347", hex2: "#FF6E6E", name: "Янтарь"   },
  magenta:  { hex: "#E14ECC", hex2: "#7A5AE0", name: "Пурпур"   },
  electric: { hex: "#5AC8FA", hex2: "#7A5AE0", name: "Электрик" },
};

const FONTS: Record<TweakFont, { stack: string; label: string }> = {
  inter:   { stack: "Inter, system-ui, sans-serif", label: "Inter" },
  plex:    { stack: '"IBM Plex Sans", Inter, system-ui, sans-serif', label: "Plex" },
  manrope: { stack: "Manrope, system-ui, sans-serif", label: "Manrope" },
};

function useTweaks(defaults: Tweaks): [Tweaks, (key: keyof Tweaks, value: Tweaks[keyof Tweaks]) => void] {
  const [values, setValues] = useState<Tweaks>(() => {
    try {
      const raw = localStorage.getItem("filmdock-tweaks");
      if (raw) return { ...defaults, ...JSON.parse(raw) as Partial<Tweaks> };
    } catch { /* ignore */ }
    return defaults;
  });
  const setTweak = useCallback((key: keyof Tweaks, value: Tweaks[keyof Tweaks]) => {
    setValues(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem("filmdock-tweaks", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return [values, setTweak];
}

// ─── Toast system ──────────────────────────────────────────────────────────

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: string; title: string; body?: string; kind: ToastKind };

function Toast({ toast }: { toast: ToastItem }) {
  return (
    <div className={`fd-toast fd-toast-${toast.kind}`}>
      <div className="fd-toast-icon">
        {toast.kind === "success" ? <Check size={14} /> : toast.kind === "error" ? <X size={14} /> : <Film size={14} />}
      </div>
      <div className="fd-toast-body">
        <strong>{toast.title}</strong>
        {toast.body && <span>{toast.body}</span>}
      </div>
    </div>
  );
}

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fd-toasts">
      {toasts.map(t => <Toast key={t.id} toast={t} />)}
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────

type SidebarProps = {
  activeNav: string;
  onNavigate: (id: string) => void;
  username: string;
  onLogout: () => void;
};

function Sidebar({ activeNav, onNavigate, username, onLogout }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const items = [
    { id: "library",  label: "Библиотека", icon: <Library size={20} /> },
    { id: "search",   label: "Поиск",       icon: <Search size={20} /> },
    { id: "settings", label: "Настройки",   icon: <Settings size={20} /> },
  ];
  const avatarLetter = username[0]?.toUpperCase() ?? "?";
  return (
    <aside
      className={`fd-sidebar ${expanded ? "is-expanded" : ""}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="fd-sb-brand">
        <div className="fd-sb-mark">
          <Film size={20} />
        </div>
        <div className="fd-sb-name">
          <span>FilmDock</span>
          <em>media library</em>
        </div>
      </div>
      <nav className="fd-sb-nav">
        {items.map(it => {
          const active = it.id === activeNav;
          return (
            <button
              key={it.id}
              type="button"
              className={`fd-sb-item ${active ? "is-active" : ""}`}
              onClick={() => onNavigate(it.id)}
              title={it.label}
            >
              <span className="fd-sb-icon">{it.icon}</span>
              <span className="fd-sb-label">{it.label}</span>
              {active && <span className="fd-sb-dot" />}
            </button>
          );
        })}
      </nav>
      <div className="fd-sb-foot">
        <button type="button" className="fd-sb-item fd-sb-avatar" title={username} onClick={() => onNavigate("settings")}>
          <span className="fd-sb-icon">
            <span className="fd-sb-avatar-circle">{avatarLetter}</span>
          </span>
          <span className="fd-sb-label fd-sb-label-stack">
            <span>{username}</span>
            <em>FilmDock</em>
          </span>
        </button>
        <button type="button" className="fd-sb-item" title="Выйти" onClick={onLogout}>
          <span className="fd-sb-icon"><LogOut size={18} /></span>
          <span className="fd-sb-label">Выйти</span>
        </button>
      </div>
    </aside>
  );
}

// ─── Constants ─────────────────────────────────────────────────────────────

const AUTH_STORAGE_KEY = "swarttube.auth.v1";
const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
const RETRYABLE_AUTH_ERRORS = new Set(["Token expired", "Invalid token signature", "Malformed token"]);

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
  if (!auth) { localStorage.removeItem(AUTH_STORAGE_KEY); return; }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

async function readErrorMessage(response: Response): Promise<string> {
  let message = `Request failed: ${response.status}`;
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) message = payload.detail;
  } catch { /* keep fallback */ }
  return message;
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
  while (value >= 1024 && unitIndex < units.length - 1) { value /= 1024; unitIndex++; }
  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatAggregateDownloadSpeed(items: Array<LibraryTorrentItem | PublicLibraryTorrentItem>) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.download_speed ?? 0), 0);
  return formatDownloadSpeed(total);
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
  } catch { return null; }
}

function routeToNav(route: Route): string {
  if (route.name === "home") return "search";
  if (route.name === "settings") return "settings";
  return "library";
}

// ─── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [auth, setAuth] = useState<StoredAuth | null>(() => loadStoredAuth());
  const refreshAuthPromiseRef = useRef<Promise<StoredAuth | null> | null>(null);
  const [route, setRoute] = useState<Route>({ name: "library" });
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryTorrents, setLibraryTorrents] = useState<LibraryTorrentItem[]>([]);
  const [publicLibraryTorrents, setPublicLibraryTorrents] = useState<PublicLibraryTorrentItem[]>([]);
  const [jellyfinStatus, setJellyfinStatus] = useState<JellyfinIntegrationStatus | null>(null);
  const [detail, setDetail] = useState<MediaItemDetail | null>(null);
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
  const [addState, setAddState] = useState<TorrentAddState>({});
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const libraryPollingInFlightRef = useRef(false);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(cur => [...cur, { ...toast, id }]);
    setTimeout(() => setToasts(cur => cur.filter(x => x.id !== id)), 4000);
  }, []);

  // ── Theme computation ──────────────────────────────────────────────────

  const dir = DIRECTIONS[t.direction] ?? DIRECTIONS.noir;
  const acc = ACCENTS[t.accent] ?? ACCENTS.amber;
  const font = FONTS[t.font] ?? FONTS.inter;
  const theme = t.theme;
  const themeVars = dir[theme] ?? dir.dark;

  const cssVars: CSSProperties = {
    "--bg":         themeVars.bg,
    "--bg-2":       themeVars.bg2,
    "--surface":    themeVars.surface,
    "--surface-hi": themeVars.surfaceHi,
    "--text":       themeVars.text,
    "--muted":      themeVars.muted,
    "--dim":        themeVars.dim,
    "--border":     themeVars.border,
    "--border-hi":  themeVars.borderHi,
    "--accent":     acc.hex,
    "--accent2":    acc.hex2,
    "--radius":     `${t.radius}px`,
    "--radius-sm":  `${Math.max(6, t.radius - 6)}px`,
    "--radius-lg":  `${t.radius + 8}px`,
    "--glow":       String(t.glow / 100),
    "--font":       font.stack,
    "--bg-img":     themeVars.bgImg,
  } as CSSProperties;

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
    setPageLoading(true);
    const requests: Promise<unknown>[] = [
      requestJson<LibraryItem[]>("/library/my", {}, { accessTokenOverride: activeAuth.accessToken }),
      requestJson<LibraryTorrentItem[]>("/library/torrents", {}, { accessTokenOverride: activeAuth.accessToken }),
      requestJson<PublicLibraryTorrentItem[]>("/library/torrents/public", {}, { accessTokenOverride: activeAuth.accessToken }),
      requestJson<JellyfinIntegrationStatus>("/integrations/jellyfin/status", {}, { accessTokenOverride: activeAuth.accessToken }),
    ];
    const isAdmin = activeAuth.user.role === "admin";
    if (isAdmin) requests.push(requestJson<AdminUser[]>("/admin/users", {}, { accessTokenOverride: activeAuth.accessToken }));
    try {
      const [libraryPayload, libraryTorrentPayload, publicTorrentPayload, jellyfinPayload, adminUsersPayload] =
        await Promise.all(requests);
      setLibrary(libraryPayload as LibraryItem[]);
      setLibraryTorrents(libraryTorrentPayload as LibraryTorrentItem[]);
      setPublicLibraryTorrents(publicTorrentPayload as PublicLibraryTorrentItem[]);
      setJellyfinStatus(jellyfinPayload as JellyfinIntegrationStatus);
      setAdminUsers((adminUsersPayload as AdminUser[] | undefined) ?? []);
    } catch (reason: unknown) {
      pushToast({ title: "Ошибка загрузки", body: reason instanceof Error ? reason.message : "Не удалось загрузить данные.", kind: "error" });
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    loadDashboardData(auth).catch(() => undefined);
    return () => { cancelled = true; if (cancelled) { /* explicit cleanup */ } };
  }, [auth]);

  useEffect(() => {
    if (!auth || route.name !== "library") return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || libraryPollingInFlightRef.current) return;
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
    poll().catch(() => undefined);
    const intervalId = window.setInterval(() => poll().catch(() => undefined), 5000);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, [auth, route.name]);

  useEffect(() => {
    if (route.name !== "detail" || !auth) return;
    let cancelled = false;
    requestJson<MediaItemDetail>(`/catalog/media-items/${route.mediaId}`)
      .then(payload => { if (!cancelled) setDetail(payload); })
      .catch(() => { if (!cancelled) setDetail(null); });
    return () => { cancelled = true; };
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
    () => libraryTorrents.filter(item => item.status_group === "completed"),
    [libraryTorrents]
  );

  // ── Actions ────────────────────────────────────────────────────────────

  async function performAuth(mode: "login" | "register", username: string, password: string) {
    const response = await requestJson<TokenPair>(`/auth/${mode === "login" ? "login" : "register"}`, {
      method: "POST", body: JSON.stringify({ username, password }),
    }, { auth: false });
    const nextAuth = toStoredAuth(response, auth);
    persistStoredAuth(nextAuth);
    setAuth(nextAuth);
    pushToast({ title: mode === "login" ? `Добро пожаловать, ${response.user.username}!` : `Аккаунт ${response.user.username} создан`, kind: "success" });
    await loadDashboardData(nextAuth);
  }

  async function searchTorrents() {
    const trimmed = queryInput.trim();
    setQuery(trimmed);
    if (trimmed.length < 2) { setResults([]); return; }
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
      pushToast({ title: "Поиск не удался", body: reason instanceof Error ? reason.message : undefined, kind: "error" });
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
          media_type: targetMediaType === "auto" ? null : targetMediaType,
          info_hash: item.info_hash, magnet_url: magnetUrl,
          download_url: item.download_url ?? null,
          provider: item.provider,
          tags: item.tags,
        }),
      });
      setAddState(state => ({ ...state, [item.info_hash]: "done" }));
      pushToast({ title: "Загрузка добавлена", body: `${item.title} · ${item.size}`, kind: "success" });
      if (auth) loadDashboardData(auth).catch(() => undefined);
    } catch {
      setAddState(state => ({ ...state, [item.info_hash]: "error" }));
    }
  }

  async function addMagnetTorrent() {
    const trimmed = magnetInput.trim();
    if (!trimmed) { pushToast({ title: "Вставьте magnet ссылку", kind: "error" }); return; }
    if (!trimmed.toLowerCase().startsWith("magnet:?")) { pushToast({ title: "Некорректная magnet ссылка", kind: "error" }); return; }
    try {
      const payload = await requestJson<AddTorrentResponse>("/torrent/add", {
        method: "POST",
        body: JSON.stringify({ media_title: magnetDisplayName(trimmed) ?? "Magnet torrent", media_type: null, magnet_url: trimmed }),
      });
      setMagnetInput("");
      if (payload.message) pushToast({ title: payload.message, kind: "success" });
      if (auth) loadDashboardData(auth).catch(() => undefined);
    } catch (reason: unknown) {
      pushToast({ title: "Не удалось добавить", body: reason instanceof Error ? reason.message : undefined, kind: "error" });
    }
  }

  async function openTorrentWatch(item: LibraryTorrentItem | PublicLibraryTorrentItem) {
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
      if (item.asset_id) setRoute({ name: "watch", assetId: item.asset_id, mediaId: item.media_item_id, title: item.media_title });
    } catch (reason: unknown) {
      pushToast({ title: "Не удалось открыть просмотр", body: reason instanceof Error ? reason.message : undefined, kind: "error" });
    } finally { setWatchLoading(false); }
  }

  async function openAssetWatch(assetId: string, mediaId: string | null, title: string | null) {
    setWatchLoading(true);
    try {
      const session = await requestJson<PlaySessionOut>(`/watch/assets/${assetId}`);
      if (session.redirect_url) { window.location.assign(session.redirect_url); return; }
      setWatchSession(session);
      setRoute({ name: "watch", assetId, mediaId, title });
    } catch (reason: unknown) {
      pushToast({ title: "Не удалось открыть просмотр", body: reason instanceof Error ? reason.message : undefined, kind: "error" });
    } finally { setWatchLoading(false); }
  }

  async function toggleVisibility(infoHash: string) {
    try {
      const payload = await requestJson<LibraryTorrentVisibilityOut>(`/library/torrents/${infoHash}/visibility`, { method: "POST" });
      setLibraryTorrents(items => items.map(item => item.info_hash === payload.info_hash ? { ...item, is_public: payload.is_public } : item));
      if (payload.message) pushToast({ title: payload.message, kind: "success" });
      if (auth) loadDashboardData(auth).catch(() => undefined);
    } catch (reason: unknown) {
      pushToast({ title: "Ошибка", body: reason instanceof Error ? reason.message : undefined, kind: "error" });
    }
  }

  async function deleteTorrent(infoHash: string) {
    try {
      const payload = await requestJson<LibraryTorrentDeleteOut>(`/library/torrents/${infoHash}`, { method: "DELETE" });
      setLibraryTorrents(items => items.filter(item => item.info_hash !== payload.info_hash));
      if (payload.message) pushToast({ title: payload.message, kind: "success" });
      if (auth) loadDashboardData(auth).catch(() => undefined);
    } catch (reason: unknown) {
      pushToast({ title: "Ошибка удаления", body: reason instanceof Error ? reason.message : undefined, kind: "error" });
    }
  }

  async function createManagedUser(username: string, password: string, role: string) {
    await requestJson<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify({ username, password, role }) });
    pushToast({ title: `Пользователь ${username} создан.`, kind: "success" });
    if (auth) loadDashboardData(auth).catch(() => undefined);
  }

  function logout() {
    persistStoredAuth(null);
    setAuth(null);
    setRoute({ name: "library" });
    setWatchSession(null);
  }

  function handleNav(id: string) {
    if (id === "search") setRoute({ name: "home" });
    else if (id === "library") setRoute({ name: "library" });
    else if (id === "settings") setRoute({ name: "settings" });
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const rootClass = `fd-root fd-dir-${t.direction} fd-acc-${t.accent} fd-theme-${theme}`;
  const authRootClass = `fd-root-auth fd-dir-${t.direction} fd-acc-${t.accent} fd-theme-${theme}`;

  if (!auth) {
    return (
      <div className={authRootClass} style={cssVars}>
        <div className="fd-ambient" aria-hidden="true" />
        {themeVars.grain && <div className="fd-grain" aria-hidden="true" />}
        <AuthPage onAuthenticate={performAuth} />
        <ToastStack toasts={toasts} />
      </div>
    );
  }

  return (
    <div className={rootClass} style={cssVars}>
      <div className="fd-ambient" aria-hidden="true" />
      {themeVars.grain && <div className="fd-grain" aria-hidden="true" />}

      <Sidebar
        activeNav={routeToNav(route)}
        onNavigate={handleNav}
        username={auth.user.username}
        onLogout={logout}
      />

      <main className="fd-main">
        {route.name === "home" && (
          <HomePage
            queryInput={queryInput} magnetInput={magnetInput} query={query}
            resolution={resolution} dub={dub} subtitles={subtitles}
            sortBy={sortBy} sortOrder={sortOrder}
            results={results} loading={searchLoading} error={null} addState={addState}
            onQueryInputChange={setQueryInput} onMagnetInputChange={setMagnetInput}
            onSearch={searchTorrents} onAddByMagnet={addMagnetTorrent}
            onResolutionChange={setResolution} onDubChange={setDub} onSubtitlesChange={setSubtitles}
            onSortChange={(nextSortBy, nextSortOrder) => { setSortBy(nextSortBy); setSortOrder(nextSortOrder); }}
            onAdd={addTorrent}
          />
        )}

        {route.name === "library" && (
          <div className="fd-screen fd-screen-library">
            <LibraryPage
              loading={pageLoading} library={library}
              activeDownloads={activeDownloads} completedDownloads={completedDownloads}
              publicLibraryTorrents={publicLibraryTorrents}
              onOpenWatch={openAssetWatch} onOpenTorrentWatch={openTorrentWatch}
              onMakePublic={toggleVisibility} onDeleteTorrent={deleteTorrent}
            />
          </div>
        )}

        {route.name === "detail" && (
          <div className="fd-screen">
            <DetailPage
              detail={detail}
              onBack={() => setRoute({ name: "library" })}
              onRequestLibrary={() => setRoute({ name: "home" })}
            />
          </div>
        )}

        {route.name === "settings" && (
          <div className="fd-screen fd-screen-settings">
            <SettingsPage
              auth={auth} jellyfinStatus={jellyfinStatus}
              adminUsers={adminUsers} t={t} setTweak={setTweak}
              onBack={() => setRoute({ name: "library" })}
              onLogout={logout} onCreateUser={createManagedUser}
            />
          </div>
        )}

        {route.name === "watch" && (
          <WatchPage
            watchSession={watchSession} watchLoading={watchLoading}
            title={route.title} onBack={() => setRoute({ name: "library" })}
          />
        )}
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}

// ─── AuthPage ──────────────────────────────────────────────────────────────

function AuthPage({ onAuthenticate }: { onAuthenticate: (mode: "login" | "register", username: string, password: string) => Promise<void> }) {
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
            <span className="app-brand__icon"><Film size={18} /></span>
            <span>
              <div className="app-brand__title">FilmDock</div>
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
            <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => setMode("login")}>Вход</button>
            <button type="button" className={mode === "register" ? "is-active" : ""} onClick={() => setMode("register")}>Регистрация</button>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label className="auth-field">
              <span>Имя пользователя</span>
              <input value={username} onChange={e => setUsername(e.target.value)} minLength={3} maxLength={64} required />
            </label>
            <label className="auth-field">
              <span>Пароль</span>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" minLength={8} required />
            </label>
            {error && <div className="auth-error">{error}</div>}
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
      <div style={{ fontWeight: 700, color: "var(--text)" }}>{title}</div>
      <div style={{ marginTop: "0.35rem", color: "var(--muted)", fontSize: "0.88rem", lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

// ─── helpers for torrent cards ─────────────────────────────────────────────

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function stateBadgeClass(state: string) {
  if (isTorrentErrorState(state)) return "is-state-err";
  if (state === "AVAILABLE" || state === "COMPLETED") return "is-state-ok";
  if (state === "REQUESTED" || state === "DOWNLOADING") return "is-state-warn";
  return "";
}

// ─── Active download card (progress-heavy) ─────────────────────────────────

function ActiveTorrentCard({
  item, index = 0, onWatch, onMakePublic, onDelete,
}: {
  item: LibraryTorrentItem | PublicLibraryTorrentItem;
  index?: number;
  onWatch: (item: LibraryTorrentItem | PublicLibraryTorrentItem) => void;
  onMakePublic?: (infoHash: string) => void;
  onDelete?: (infoHash: string) => void;
}) {
  const isForeign = "owner_username" in item;
  const progress = Math.max(0, Math.min(100, Math.round(item.progress_percent)));
  const isDone = item.status_group === "completed";
  const hue = hashHue(item.info_hash);

  return (
    <article className="fd-active-card" style={{ animationDelay: `${index * 30}ms` }}>
      <div className="fd-active-card__header">
        <div className="fd-active-card__icon" style={{ "--ih": hue } as CSSProperties}>
          {isDone ? <Check size={16} /> : <Download size={16} />}
        </div>
        <div className="fd-active-card__title-wrap">
          <div className="fd-active-card__title">
            {item.media_title ?? item.torrent_title}
          </div>
          <div className="fd-active-card__sub">
            <span className={`fd-info-badge ${stateBadgeClass(item.state)}`}>{torrentStatusLabel(item)}</span>
            {item.is_public && <span className="fd-info-badge is-state-ok">Публичный</span>}
            {isForeign && <span className="fd-info-badge">{(item as PublicLibraryTorrentItem).owner_username}</span>}
          </div>
        </div>
      </div>

      <div className="fd-active-card__progress-wrap">
        <div
          className={`fd-active-card__progress-bar ${isDone ? "is-done" : ""}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="fd-active-card__meta">
        <div className="fd-active-card__meta-item">
          <span className="fd-active-card__meta-k">Прогресс</span>
          <span className="fd-active-card__meta-v">{progress}%</span>
        </div>
        <div className="fd-active-card__meta-item">
          <span className="fd-active-card__meta-k">Размер</span>
          <span className="fd-active-card__meta-v">{formatBytes(item.size_bytes)}</span>
        </div>
        {item.download_speed !== null && (
          <div className="fd-active-card__meta-item">
            <span className="fd-active-card__meta-k">Скорость</span>
            <span className="fd-active-card__meta-v">{formatDownloadSpeed(item.download_speed)}</span>
          </div>
        )}
        {item.eta_seconds !== null && (
          <div className="fd-active-card__meta-item">
            <span className="fd-active-card__meta-k">ETA</span>
            <span className="fd-active-card__meta-v">{formatEta(item.eta_seconds)}</span>
          </div>
        )}
        {item.added_at && (
          <div className="fd-active-card__meta-item">
            <span className="fd-active-card__meta-k">Добавлен</span>
            <span className="fd-active-card__meta-v">
              {new Date(item.added_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
            </span>
          </div>
        )}
      </div>

      <div className="fd-active-card__foot">
        <div style={{ fontSize: 11, color: "var(--dim)", fontFamily: "var(--font-mono)" }}>
          {item.torrent_title.length > 48 ? item.torrent_title.slice(0, 48) + "…" : item.torrent_title}
        </div>
        <div className="fd-active-card__actions">
          <button type="button" className="fd-icon-btn" onClick={() => onWatch(item)} title="Открыть в Jellyfin">
            <ExternalLink size={14} />
          </button>
          {!isForeign && onMakePublic && (
            <button type="button" className="fd-icon-btn" onClick={() => onMakePublic(item.info_hash)}
              title={item.is_public ? "Сделать приватным" : "Сделать публичным"}>
              {item.is_public ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
          {!isForeign && onDelete && (
            <button type="button" className="fd-icon-btn" onClick={() => onDelete(item.info_hash)} title="Удалить">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Completed torrent info-card (grid) ────────────────────────────────────

function CompletedTorrentCard({
  item, index = 0, onWatch, onMakePublic, onDelete,
}: {
  item: LibraryTorrentItem;
  index?: number;
  onWatch: (item: LibraryTorrentItem) => void;
  onMakePublic?: (infoHash: string) => void;
  onDelete?: (infoHash: string) => void;
}) {
  const hue = hashHue(item.info_hash);
  const isMovie = item.media_type === "movie";
  const addedStr = item.added_at
    ? new Date(item.added_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "недавно";

  return (
    <article
      className="fd-info-card"
      style={{ "--ih": hue, animationDelay: `${index * 18}ms` } as CSSProperties}
      onClick={() => onWatch(item)}
    >
      <div className="fd-info-accent" />
      <div className="fd-info-body">
        <div className="fd-info-top">
          <div className="fd-info-icon-wrap">
            {isMovie
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 7h18M3 12h18M3 17h18M8 3v18M16 3v18"/></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 4 14 8-14 8Z"/></svg>
            }
          </div>
          <h4 className="fd-info-title">{item.media_title ?? item.torrent_title}</h4>
          <span className={`fd-info-badge ${item.can_watch ? "is-state-ok" : ""}`}>
            {item.can_watch ? "Смотреть" : item.state}
          </span>
        </div>
        <div className="fd-info-meta">
          <span>{item.media_type ?? "torrent"}</span>
          <span className="fd-dot-sep" />
          <span className="fd-mono">{formatBytes(item.size_bytes)}</span>
          {item.is_public && <><span className="fd-dot-sep" /><span style={{ color: "var(--accent)" }}>публичный</span></>}
        </div>
        <div className="fd-info-date">{addedStr}</div>
      </div>
      <div className="fd-info-arrow" onClick={e => {
        e.stopPropagation();
        if (onMakePublic || onDelete) {
          /* handled inline */
        }
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {onMakePublic && (
            <button type="button" className="fd-icon-btn" style={{ width: 26, height: 26 }}
              onClick={e => { e.stopPropagation(); onMakePublic(item.info_hash); }}
              title={item.is_public ? "Сделать приватным" : "Публичный"}>
              {item.is_public ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          )}
          {onDelete && (
            <button type="button" className="fd-icon-btn" style={{ width: 26, height: 26 }}
              onClick={e => { e.stopPropagation(); onDelete(item.info_hash); }}
              title="Удалить">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Completed torrent list-row ─────────────────────────────────────────────

function CompletedTorrentRow({
  item, index = 0, onWatch, onMakePublic, onDelete,
}: {
  item: LibraryTorrentItem;
  index?: number;
  onWatch: (item: LibraryTorrentItem) => void;
  onMakePublic?: (infoHash: string) => void;
  onDelete?: (infoHash: string) => void;
}) {
  const addedStr = item.added_at
    ? new Date(item.added_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : "—";

  return (
    <button
      type="button"
      className="fd-row"
      onClick={() => onWatch(item)}
      style={{ animationDelay: `${index * 14}ms` }}
    >
      <div className="fd-row-title">
        <h4>{item.media_title ?? item.torrent_title}</h4>
        <div className="fd-row-meta">
          <span>{item.media_type ?? "torrent"}</span>
          <span className="fd-dot-sep" />
          <span className="fd-mono">{formatBytes(item.size_bytes)}</span>
          {item.is_public && <><span className="fd-dot-sep" /><span style={{ color: "var(--accent)" }}>публичный</span></>}
        </div>
      </div>
      <span className={`fd-row-badge ${item.can_watch ? "" : ""}`} style={item.can_watch ? { color: "#86EFAC", borderColor: "rgba(74,222,128,0.3)" } : {}}>
        {item.can_watch ? "Готов" : item.state}
      </span>
      <span className="fd-row-added">{addedStr}</span>
      <div className="fd-row-progress">
        <div className="fd-row-progress-wrap">
          <div className="fd-row-progress-bar" style={{ width: `${item.progress_percent}%` }} />
        </div>
      </div>
    </button>
  );
}

// ─── Public torrent card ────────────────────────────────────────────────────

function PublicTorrentCard({
  item, index = 0, onWatch,
}: {
  item: PublicLibraryTorrentItem;
  index?: number;
  onWatch: (item: PublicLibraryTorrentItem) => void;
}) {
  const hue = hashHue(item.info_hash);
  const addedStr = item.added_at
    ? new Date(item.added_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "недавно";

  return (
    <article
      className="fd-public-card"
      style={{ "--ih": hue, animationDelay: `${index * 18}ms` } as CSSProperties}
      onClick={() => onWatch(item)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onWatch(item)}
    >
      <div className="fd-public-card__body">
        <div className="fd-public-card__title">{item.media_title ?? item.torrent_title}</div>
        <div className="fd-public-card__meta">
          <span>{item.media_type ?? "торрент"}</span>
          <span className="fd-dot-sep" />
          <span className="fd-mono">{formatBytes(item.size_bytes)}</span>
          {item.can_watch && (
            <><span className="fd-dot-sep" /><span style={{ color: "#86EFAC" }}>готов</span></>
          )}
        </div>
        <div className="fd-public-card__owner">
          Владелец: <span style={{ color: "var(--accent)" }}>{item.owner_username}</span>
          {item.added_at && <span> · {addedStr}</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", padding: "0 14px", color: "var(--dim)" }}>
        <ExternalLink size={14} />
      </div>
    </article>
  );
}

// ─── LibraryPage (full redesign) ────────────────────────────────────────────

function LibraryPage({
  loading, library, activeDownloads, completedDownloads, publicLibraryTorrents,
  onOpenWatch, onOpenTorrentWatch, onMakePublic, onDeleteTorrent,
}: {
  loading: boolean; library: LibraryItem[];
  activeDownloads: Array<LibraryTorrentItem | PublicLibraryTorrentItem>;
  completedDownloads: LibraryTorrentItem[];
  publicLibraryTorrents: PublicLibraryTorrentItem[];
  onOpenWatch: (assetId: string, mediaId: string | null, title: string | null) => void;
  onOpenTorrentWatch: (item: LibraryTorrentItem | PublicLibraryTorrentItem) => void;
  onMakePublic: (infoHash: string) => void;
  onDeleteTorrent: (infoHash: string) => void;
}) {
  const [view, setView] = useState<"grid" | "list">("grid");

  const aggregateSpeed = formatAggregateDownloadSpeed(activeDownloads);
  const watchableCount = completedDownloads.filter(i => i.can_watch).length;
  const publicCount = publicLibraryTorrents.length + completedDownloads.filter(i => i.is_public).length;
  const totalCount = completedDownloads.length;

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <header className="fd-lib-hero">
        <div className="fd-lib-hero-l">
          <div className="fd-eyebrow"><span className="fd-eyebrow-dot" />Медиатека</div>
          <h1 className="fd-h1">
            <span className="fd-h1-count fd-mono">{totalCount}</span> единиц медиа,
            <br />
            <span className="fd-h1-soft">готовых к просмотру</span>
          </h1>
        </div>
        <div className="fd-lib-stats">
          <div className="fd-stat">
            <span className="fd-stat-k">Активные</span>
            <span className="fd-stat-v fd-mono">{activeDownloads.length}</span>
            {activeDownloads.length > 0 && (
              <span style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{aggregateSpeed}</span>
            )}
          </div>
          <div className="fd-stat-sep" />
          <div className="fd-stat">
            <span className="fd-stat-k">Готовые</span>
            <span className="fd-stat-v fd-mono">{completedDownloads.length}</span>
          </div>
          <div className="fd-stat-sep" />
          <div className="fd-stat">
            <span className="fd-stat-k">Публичные</span>
            <span className="fd-stat-v fd-mono">{publicCount}</span>
          </div>
          <div className="fd-stat-sep" />
          <div className="fd-stat">
            <span className="fd-stat-k">Jellyfin</span>
            <span className="fd-stat-v fd-mono">{watchableCount}</span>
          </div>
        </div>
      </header>

      {/* ── Active downloads ──────────────────────────────────────── */}
      {loading && (
        <div className="fd-empty" style={{ padding: "40px 0" }}>
          <div className="fd-empty-icon">
            <span className="fd-spinner" style={{ width: 24, height: 24 } as CSSProperties} />
          </div>
          <h3>Загружаем библиотеку…</h3>
        </div>
      )}

      {!loading && activeDownloads.length > 0 && (
        <section style={{ marginBottom: 48 }}>
          <div className="fd-section-label">
            Загружается
            <span className="fd-section-label-count">{activeDownloads.length}</span>
          </div>
          <div className="fd-active-grid">
            {activeDownloads.map((item, i) => (
              <ActiveTorrentCard
                key={item.info_hash} item={item} index={i}
                onWatch={onOpenTorrentWatch}
                onMakePublic={"owner_username" in item ? undefined : onMakePublic}
                onDelete={"owner_username" in item ? undefined : onDeleteTorrent}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Completed / Library ───────────────────────────────────── */}
      {!loading && (
        <>
          <div className="fd-lib-bar">
            <div className="fd-lib-bar-r">
              <div className="fd-view-toggle">
                <button type="button" className={view === "grid" ? "is-on" : ""} onClick={() => setView("grid")} title="Сетка">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </button>
                <button type="button" className={view === "list" ? "is-on" : ""} onClick={() => setView("list")} title="Список">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {completedDownloads.length === 0 ? (
            <div className="fd-empty">
              <div className="fd-empty-icon">
                <Library size={28} />
              </div>
              <h3>Ничего не найдено</h3>
              <p>Добавьте торрент через поиск или magnet-ссылку</p>
            </div>
          ) : view === "grid" ? (
            <div className="fd-info-grid">
              {completedDownloads.map((item, i) => (
                <CompletedTorrentCard
                  key={item.info_hash} item={item} index={i}
                  onWatch={onOpenTorrentWatch}
                  onMakePublic={onMakePublic}
                  onDelete={onDeleteTorrent}
                />
              ))}
            </div>
          ) : (
            <div className="fd-list">
              <div className="fd-list-h">
                <span>Название</span>
                <span>Качество</span>
                <span>Добавлено</span>
                <span>Прогресс</span>
              </div>
              {completedDownloads.map((item, i) => (
                <CompletedTorrentRow
                  key={item.info_hash} item={item} index={i}
                  onWatch={onOpenTorrentWatch}
                  onMakePublic={onMakePublic}
                  onDelete={onDeleteTorrent}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Public torrents section ───────────────────────────────── */}
      {!loading && publicLibraryTorrents.length > 0 && (
        <section style={{ marginTop: 56 }}>
          <div className="fd-section-label">
            Публичные торренты
            <span className="fd-section-label-count">{publicLibraryTorrents.length}</span>
          </div>
          <p style={{ marginBottom: 20, color: "var(--dim)", fontSize: 13 }}>
            Контент, который другие пользователи открыли для общего доступа
          </p>
          <div className="fd-public-grid">
            {publicLibraryTorrents.map((item, i) => (
              <PublicTorrentCard
                key={item.info_hash} item={item} index={i}
                onWatch={onOpenTorrentWatch}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ─── DetailPage ────────────────────────────────────────────────────────────

function DetailPage({ detail, onBack, onRequestLibrary }: { detail: MediaItemDetail | null; onBack: () => void; onRequestLibrary: () => void }) {
  return (
    <div className="page-stack">
      <button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={16} />Назад</button>
      {!detail && <div className="empty-panel">Детали ещё загружаются.</div>}
      {detail && (
        <section className="section-panel">
          <div className="section-panel__body detail-layout">
            <PosterPlaceholder title={detail.title} subtitle={mediaTypeLabel(detail.type)} />
            <div>
              <div className="section-kicker">{mediaTypeLabel(detail.type)}</div>
              <h1 style={{ margin: "0.4rem 0 0", fontSize: "clamp(1.8rem, 5vw, 3rem)", lineHeight: 1.02, color: "var(--text)" }}>{detail.title}</h1>
              <p style={{ color: "var(--muted)", lineHeight: 1.75 }}>Карточка медиа с основными деталями и быстрым переходом к поиску торрента.</p>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                {detail.year && <span className="tiny-pill">{detail.year}</span>}
                <span className="tiny-pill">{detail.external_provider ?? "catalog"}</span>
                {detail.children.length > 0 && <span className="tiny-pill">{detail.children.length} дочерних элементов</span>}
              </div>
              <button type="button" className="primary-button" onClick={onRequestLibrary}>Искать торрент</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── SettingsPage ──────────────────────────────────────────────────────────

function SettingsPage({
  auth, jellyfinStatus, adminUsers, t, setTweak, onBack, onLogout, onCreateUser,
}: {
  auth: StoredAuth; jellyfinStatus: JellyfinIntegrationStatus | null;
  adminUsers: AdminUser[]; t: Tweaks;
  setTweak: (key: keyof Tweaks, value: Tweaks[keyof Tweaks]) => void;
  onBack: () => void; onLogout: () => void;
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
      setUsername(""); setPassword(""); setRole("user");
    } finally { setSaving(false); }
  }

  const avatarLetter = auth.user.username[0]?.toUpperCase() ?? "?";
  const jfStatusKey = effectiveStatus === "ok" ? "fd-jf-ok" : effectiveStatus === "degraded" ? "fd-jf-degraded" : "fd-jf-error";
  const jfLabel = effectiveStatus === "ok" ? "Подключено" : effectiveStatus === "degraded" ? "Деградирован" : "Ошибка";
  const jfDotColor = effectiveStatus === "ok" ? "#4ADE80" : effectiveStatus === "degraded" ? "#FBBF24" : "#F87171";
  const glowPct = ((t.glow - 0) / (100 - 0)) * 100;
  const radiusPct = ((t.radius - 4) / (28 - 4)) * 100;

  return (
    <>
      <div className="fd-eyebrow"><span className="fd-eyebrow-dot" />Настройки</div>
      <h1 className="fd-h1">Персонализация<br /><span className="fd-h1-soft">и конфигурация FilmDock</span></h1>

      <div className="fd-settings">
        {/* Appearance */}
        <section className="fd-set-section">
          <h2 className="fd-set-section-h">Внешний вид</h2>
          <div className="fd-set-card">
            <div className="fd-set-row">
              <div className="fd-set-row-l">
                <span className="fd-set-label">Тема</span>
                <span className="fd-set-desc">Светлая или тёмная подложка</span>
              </div>
              <div className="fd-theme-seg">
                <button type="button" className={`fd-theme-btn ${t.theme !== "light" ? "is-on" : ""}`} onClick={() => setTweak("theme", "dark")}>
                  Тёмная
                </button>
                <button type="button" className={`fd-theme-btn ${t.theme === "light" ? "is-on" : ""}`} onClick={() => setTweak("theme", "light")}>
                  Светлая
                </button>
              </div>
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row">
              <div className="fd-set-row-l">
                <span className="fd-set-label">Стиль интерфейса</span>
                <span className="fd-set-desc">Визуальное направление</span>
              </div>
              <div className="fd-set-seg">
                {(["noir", "aurora"] as TweakDirection[]).map(d => (
                  <button key={d} type="button" className={`fd-set-seg-btn ${t.direction === d ? "is-on" : ""}`} onClick={() => setTweak("direction", d)}>{d === "noir" ? "Noir" : "Aurora"}</button>
                ))}
              </div>
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row">
              <div className="fd-set-row-l">
                <span className="fd-set-label">Акцентный цвет</span>
                <span className="fd-set-desc">Янтарь · Пурпур · Электрик</span>
              </div>
              <div className="fd-accent-picker">
                {(Object.entries(ACCENTS) as [TweakAccent, { hex: string; hex2: string; name: string }][]).map(([id, ac]) => (
                  <button key={id} type="button" className={`fd-accent-swatch ${t.accent === id ? "is-on" : ""}`} style={{ "--sw": ac.hex } as CSSProperties} onClick={() => setTweak("accent", id)} title={ac.name}>
                    {t.accent === id && <Check size={14} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row">
              <div className="fd-set-row-l">
                <span className="fd-set-label">Шрифт</span>
                <span className="fd-set-desc">Семейство символов интерфейса</span>
              </div>
              <div className="fd-set-seg">
                {(Object.entries(FONTS) as [TweakFont, { stack: string; label: string }][]).map(([id, f]) => (
                  <button key={id} type="button" className={`fd-set-seg-btn ${t.font === id ? "is-on" : ""}`} onClick={() => setTweak("font", id)}>{f.label}</button>
                ))}
              </div>
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row fd-set-row-v">
              <div className="fd-set-row-lh">
                <span className="fd-set-label">Свечение</span>
                <span className="fd-set-slider-val">{t.glow}%</span>
              </div>
              <input type="range" className="fd-set-slider" min={0} max={100} step={5} value={t.glow}
                style={{ "--pct": `${glowPct}%` } as CSSProperties}
                onChange={e => setTweak("glow", Number(e.target.value))} />
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row fd-set-row-v">
              <div className="fd-set-row-lh">
                <span className="fd-set-label">Радиус скругления</span>
                <span className="fd-set-slider-val">{t.radius}px</span>
              </div>
              <input type="range" className="fd-set-slider" min={4} max={28} step={2} value={t.radius}
                style={{ "--pct": `${radiusPct}%` } as CSSProperties}
                onChange={e => setTweak("radius", Number(e.target.value))} />
            </div>
          </div>
        </section>

        {/* Account */}
        <section className="fd-set-section">
          <h2 className="fd-set-section-h">Учётная запись</h2>
          <div className="fd-set-card">
            <div className="fd-set-profile">
              <div className="fd-set-avatar">{avatarLetter}</div>
              <div className="fd-set-profile-info">
                <span className="fd-set-label">{auth.user.username}</span>
                <span className="fd-set-desc">Роль: {auth.user.role}</span>
              </div>
              <button type="button" className="fd-set-btn-ghost" onClick={onLogout}>Выйти</button>
            </div>
          </div>
        </section>

        {/* Jellyfin */}
        <section className="fd-set-section">
          <h2 className="fd-set-section-h">
            Jellyfin
            <span className={`fd-jf-status ${jfStatusKey}`}>
              <span className="fd-jf-dot" style={{ background: jfDotColor, boxShadow: `0 0 8px ${jfDotColor}` }} />
              {jfLabel}
            </span>
          </h2>
          <div className="fd-set-card">
            <div className="fd-set-row">
              <span className="fd-set-desc" style={{ flex: 1 }}>
                {jellyfinStatus?.message ?? auth.jellyfinMessage ?? "Статус интеграции неизвестен."}
              </span>
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row">
              <span className="fd-set-desc">Доступ к просмотру контролируется FilmDock: пользователь видит своё и контент, который владелец пометил как публичный.</span>
            </div>
          </div>
        </section>

        {/* Admin */}
        {auth.user.role === "admin" && (
          <section className="fd-set-section">
            <h2 className="fd-set-section-h"><UserRound size={16} />Пользователи</h2>
            <div className="fd-set-card">
              <div className="fd-admin-users">
                {adminUsers.map(user => (
                  <div key={user.id} className="fd-admin-user-row">
                    <div>
                      <div className="fd-set-label">{user.username}</div>
                      <div className="fd-set-desc">Роль: {user.role}</div>
                    </div>
                    <span className="tiny-pill">{new Date(user.created_at).toLocaleDateString("ru-RU")}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={submitUser}>
                <div className="fd-admin-form">
                  <div className="fd-admin-form-field">
                    <label className="fd-set-desc">Имя пользователя</label>
                    <input className="fd-set-input" value={username} onChange={e => setUsername(e.target.value)} minLength={3} maxLength={64} required />
                  </div>
                  <div className="fd-admin-form-field">
                    <label className="fd-set-desc">Пароль</label>
                    <input className="fd-set-input" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
                  </div>
                  <div className="fd-admin-form-field">
                    <label className="fd-set-desc">Роль</label>
                    <select className="fd-set-input" value={role} onChange={e => setRole(e.target.value)}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <button type="submit" className="fd-set-btn-primary" disabled={saving} style={{ alignSelf: "flex-end" }}>
                    {saving ? <span className="fd-spinner" style={{ width: 14, height: 14 }} /> : null}
                    Создать
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

// ─── WatchPage ─────────────────────────────────────────────────────────────

function WatchPage({ watchSession, watchLoading, title, onBack }: { watchSession: PlaySessionOut | null; watchLoading: boolean; title: string | null; onBack: () => void }) {
  return (
    <div className="fd-screen">
      <button type="button" className="secondary-button" onClick={onBack} style={{ marginBottom: "1rem" }}><ArrowLeft size={16} />Назад</button>
      <section className="watch-stage">
        {watchSession?.iframe_url && <iframe title={title ?? "Плеер Jellyfin"} src={watchSession.iframe_url} allowFullScreen />}
        {(!watchSession?.iframe_url || watchLoading) && (
          <div className="watch-stage__overlay">
            <div className="notice">
              {watchLoading ? "Подготовка контента в Jellyfin..." : watchSession?.message ?? "Сессия воспроизведения отсутствует."}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── SectionPanel ──────────────────────────────────────────────────────────

function SectionPanel({ title, right, icon, children }: { title: string; right?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="section-panel">
      <div className="section-panel__header">
        <div className="section-panel__title">{icon}{title}</div>
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
        <div style={{ color: "var(--dim)", fontSize: "0.78rem" }}>{subtitle}</div>
        <div>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, lineHeight: 1.15, color: "var(--text)" }}>{title}</div>
          <div style={{ marginTop: "0.5rem", color: "var(--dim)", fontSize: "0.84rem" }}>FilmDock Library</div>
        </div>
      </div>
    </div>
  );
}
