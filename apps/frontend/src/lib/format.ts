import type { AnyLibraryTorrent } from "./types";

export function formatBytes(value: number | null) {
  if (!value) return "—";
  const gb = value / 1024 ** 3;
  if (gb >= 1) return `${gb.toLocaleString("ru-RU", { maximumFractionDigits: gb >= 10 ? 0 : 1 })} ГБ`;
  const mb = value / 1024 ** 2;
  return `${mb.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} МБ`;
}

export function formatDownloadSpeed(bytesPerSecond: number | null) {
  if (bytesPerSecond === null || bytesPerSecond < 0) return "—";
  const units = ["Б/с", "КБ/с", "МБ/с", "ГБ/с"];
  let value = bytesPerSecond;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) { value /= 1024; unitIndex++; }
  const digits = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: digits })} ${units[unitIndex]}`;
}

export function formatAggregateDownloadSpeed(items: AnyLibraryTorrent[]) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.download_speed ?? 0), 0);
  return formatDownloadSpeed(total);
}

export function formatEta(seconds: number | null) {
  if (seconds === null || seconds < 0 || seconds >= 8_640_000) return "—";
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} д`);
  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0 && parts.length < 2) parts.push(`${minutes} мин`);
  if (parts.length === 0) parts.push(total === 0 ? "0 с" : "< 1 мин");
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

/** Provider sizes arrive as "3.4 GB"; show them the way the rest of the UI does ("3,4 ГБ"). */
export function localizeSize(size: string) {
  const units: Record<string, string> = { TB: "ТБ", TIB: "ТБ", GB: "ГБ", GIB: "ГБ", MB: "МБ", MIB: "МБ", KB: "КБ", KIB: "КБ", B: "Б" };
  return size.replace(/(\d+)\.(\d+)/, "$1,$2").replace(/\b(TiB|TB|GiB|GB|MiB|MB|KiB|KB|B)\b/i, unit => units[unit.toUpperCase()] ?? unit);
}
