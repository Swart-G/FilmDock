import type { AnyLibraryTorrent } from "./types";

export function formatBytes(value: number | null) {
  if (!value) return "n/a";
  const gb = value / 1024 / 1024 / 1024;
  return `${gb.toFixed(gb > 10 ? 0 : 1)} GB`;
}

export function formatDownloadSpeed(bytesPerSecond: number | null) {
  if (bytesPerSecond === null || bytesPerSecond < 0) return "n/a";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bytesPerSecond;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) { value /= 1024; unitIndex++; }
  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatAggregateDownloadSpeed(items: AnyLibraryTorrent[]) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.download_speed ?? 0), 0);
  return formatDownloadSpeed(total);
}

export function formatEta(seconds: number | null) {
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

export function formatDate(value: string | null, withYear = true) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ru-RU", withYear
    ? { day: "2-digit", month: "2-digit", year: "numeric" }
    : { day: "2-digit", month: "2-digit" });
}

/** Russian plural: plural(5, ["единица", "единицы", "единиц"]) → "единиц". */
export function plural(count: number, forms: [string, string, string]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function mediaTypeLabel(type: string | null) {
  if (type === "movie") return "Фильм";
  if (type === "series") return "Сериал";
  if (type === "season") return "Сезон";
  if (type === "episode") return "Эпизод";
  return type ?? "Торрент";
}

export function isTorrentErrorState(state: string) {
  const normalized = state.trim().toLowerCase();
  return normalized === "error" || normalized === "missing" || normalized.includes("missingfiles");
}

const STATE_LABELS: Record<string, string> = {
  downloading: "Загрузка",
  forceddl: "Загрузка",
  metadl: "Метаданные",
  forcedmetadl: "Метаданные",
  stalleddl: "Ждёт пиров",
  queueddl: "В очереди",
  pauseddl: "Пауза",
  stoppeddl: "Пауза",
  checkingdl: "Проверка",
  checkingup: "Проверка",
  checkingresumedata: "Проверка",
  allocating: "Подготовка",
  moving: "Перемещение",
  uploading: "Раздаётся",
  forcedup: "Раздаётся",
  stalledup: "Раздаётся",
  queuedup: "Раздаётся",
  pausedup: "Завершён",
  stoppedup: "Завершён",
  available: "Доступен",
  completed: "Завершён",
  requested: "Запрошен",
  error: "Ошибка",
  missing: "Ошибка",
  missingfiles: "Нет файлов",
  unknown: "Неизвестно",
};

export function torrentStateLabel(state: string) {
  return STATE_LABELS[state.trim().toLowerCase()] ?? state;
}

export type StateTone = "ok" | "warn" | "err" | "neutral";

export function torrentStateTone(state: string): StateTone {
  const normalized = state.trim().toLowerCase();
  if (isTorrentErrorState(normalized)) return "err";
  if (["available", "completed", "uploading", "stalledup", "forcedup", "queuedup", "pausedup", "stoppedup"].includes(normalized)) return "ok";
  if (["requested", "downloading", "forceddl", "metadl", "stalleddl", "queueddl"].includes(normalized)) return "warn";
  return "neutral";
}

export function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/** Entry animation delay, capped so long lists do not take seconds to appear. */
export function staggerDelay(index: number, stepMs: number) {
  return `${Math.min(index, 12) * stepMs}ms`;
}

export function magnetDisplayName(magnetUrl: string): string | null {
  try {
    const query = magnetUrl.includes("?") ? magnetUrl.slice(magnetUrl.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    const raw = params.get("dn");
    if (!raw) return null;
    const decoded = decodeURIComponent(raw.replaceAll("+", "%20")).trim();
    return decoded || null;
  } catch { return null; }
}

const PROVIDER_LABELS: Record<string, string> = {
  "apibay.org": "TPB",
  "rutracker.org": "RuTracker",
  "rutracker.ru": "RuTracker.RU",
  "rutor.info": "RuTor",
  "rutor.is": "RuTor",
  "kinozal.me": "Kinozal",
  "kinozal.tv": "Kinozal",
  "nnmclub.to": "NNM-Club",
  "nyaa.si": "Nyaa",
  "yts.lt": "YTS",
  "yts": "YTS",
  "animetosho": "AnimeTosho",
  "knaben": "Knaben",
  "torrents-csv": "Torrents-CSV",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider.toLowerCase()] ?? provider;
}
