import { useCallback, useState } from "react";
import type { CSSProperties } from "react";

export type TweakTheme = "dark" | "light";
export type TweakAccent = "amber" | "blue" | "green";

export type Tweaks = { accent: TweakAccent; theme: TweakTheme };

export type SetTweak = <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;

export const TWEAK_DEFAULTS: Tweaks = { accent: "amber", theme: "dark" };

const FONT_STACK = '"IBM Plex Sans", system-ui, sans-serif';
const MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const PALETTES: Record<TweakTheme, Record<string, string>> = {
  dark: {
    bg: "#111113", surface: "#18181b", raised: "#202024",
    text: "#ececef", muted: "#a1a1aa", dim: "#8b8b95",
    border: "rgba(255,255,255,0.09)", borderHi: "rgba(255,255,255,0.17)",
    ok: "#4ade80", warn: "#fbbf24", err: "#f87171", track: "rgba(255,255,255,0.1)",
  },
  light: {
    bg: "#f5f5f3", surface: "#ffffff", raised: "#efefec",
    text: "#18181b", muted: "#52525b", dim: "#6b6b75",
    border: "rgba(0,0,0,0.1)", borderHi: "rgba(0,0,0,0.2)",
    ok: "#15803d", warn: "#a16207", err: "#b91c1c", track: "rgba(0,0,0,0.1)",
  },
};

/** `fill` paints buttons/progress, `ink` is text on top of it, `text` is the accent used as text on the page background. */
export const ACCENTS: Record<TweakAccent, { name: string; fill: string; ink: string; text: Record<TweakTheme, string> }> = {
  amber: { name: "Янтарь", fill: "#f2a33a", ink: "#1c1300", text: { dark: "#f2a33a", light: "#9a5b00" } },
  blue:  { name: "Синий",  fill: "#4c8dff", ink: "#04112e", text: { dark: "#6ba3ff", light: "#1d4ed8" } },
  green: { name: "Зелёный", fill: "#3fbf7f", ink: "#04150c", text: { dark: "#5bd497", light: "#15803d" } },
};

const TWEAKS_STORAGE_KEY = "filmdock-tweaks";

/** Keeps only known values, so settings saved by older versions (glow, radius, direction…) are ignored. */
function sanitize(raw: Partial<Record<keyof Tweaks, unknown>>): Tweaks {
  return {
    theme: raw.theme === "light" ? "light" : "dark",
    accent: typeof raw.accent === "string" && raw.accent in ACCENTS ? (raw.accent as TweakAccent) : TWEAK_DEFAULTS.accent,
  };
}

export function useTweaks(defaults: Tweaks): [Tweaks, SetTweak] {
  const [values, setValues] = useState<Tweaks>(() => {
    try {
      const raw = localStorage.getItem(TWEAKS_STORAGE_KEY);
      if (raw) return sanitize({ ...defaults, ...JSON.parse(raw) });
    } catch { /* ignore */ }
    return defaults;
  });
  const setTweak = useCallback<SetTweak>((key, value) => {
    setValues(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(TWEAKS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return [values, setTweak];
}

export function resolveTheme(t: Tweaks) {
  const p = PALETTES[t.theme];
  const acc = ACCENTS[t.accent];
  const style = {
    "--bg": p.bg, "--surface": p.surface, "--raised": p.raised,
    "--text": p.text, "--muted": p.muted, "--dim": p.dim,
    "--border": p.border, "--border-hi": p.borderHi,
    "--ok": p.ok, "--warn": p.warn, "--err": p.err, "--track": p.track,
    "--accent": acc.fill, "--accent-ink": acc.ink, "--accent-text": acc.text[t.theme],
    "--font": FONT_STACK, "--font-mono": MONO_STACK,
    colorScheme: t.theme,
  } as CSSProperties;
  return { style, className: t.theme === "light" ? "is-light" : "is-dark" };
}
