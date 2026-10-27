import { useCallback, useState } from "react";
import type { CSSProperties } from "react";

type ThemeVars = {
  bg: string; bg2: string; surface: string; surfaceHi: string;
  text: string; muted: string; dim: string; border: string; borderHi: string;
  /** Status colours tuned for contrast against this palette's background. */
  ok: string; warn: string; err: string;
  /** Neutral fill for tracks / inset wells (slider rail, inputs). */
  track: string;
  grain: boolean; bgImg: string;
};

export type TweakDirection = "noir" | "aurora";
export type TweakAccent = "amber" | "magenta" | "electric";
export type TweakTheme = "dark" | "light";

export type Tweaks = {
  direction: TweakDirection; accent: TweakAccent;
  glow: number; radius: number; theme: TweakTheme;
};

export type SetTweak = <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;

const FONT_STACK = '"IBM Plex Sans", system-ui, sans-serif';

export const TWEAK_DEFAULTS: Tweaks = {
  direction: "noir", accent: "amber",
  glow: 60, radius: 14, theme: "dark",
};

const DARK_STATUS = { ok: "#86EFAC", warn: "#FDE68A", err: "#FCA5A5", track: "rgba(255,255,255,0.1)" };
const LIGHT_STATUS = { ok: "#15803D", warn: "#A16207", err: "#B91C1C", track: "rgba(0,0,0,0.1)" };

export const DIRECTIONS: Record<TweakDirection, { label: string; dark: ThemeVars; light: ThemeVars }> = {
  noir: {
    label: "Noir",
    dark: {
      bg: "#0B0B0F", bg2: "#141318",
      surface: "rgba(255,255,255,0.04)", surfaceHi: "rgba(255,255,255,0.07)",
      text: "#F4F1EA", muted: "rgba(244,241,234,0.62)", dim: "rgba(244,241,234,0.5)",
      border: "rgba(255,255,255,0.07)", borderHi: "rgba(255,255,255,0.14)",
      ...DARK_STATUS,
      grain: true,
      bgImg: `radial-gradient(1200px 700px at 88% -20%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 60%),
              radial-gradient(900px 600px at -10% 100%, color-mix(in oklab, var(--accent2) 14%, transparent), transparent 55%)`,
    },
    light: {
      bg: "#F5F2EC", bg2: "#EDE9DF",
      surface: "rgba(255,255,255,0.65)", surfaceHi: "rgba(255,255,255,0.88)",
      text: "#1C1917", muted: "rgba(28,25,23,0.66)", dim: "rgba(28,25,23,0.55)",
      border: "rgba(0,0,0,0.08)", borderHi: "rgba(0,0,0,0.16)",
      ...LIGHT_STATUS,
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
      text: "#EFF1FA", muted: "rgba(239,241,250,0.64)", dim: "rgba(239,241,250,0.5)",
      border: "rgba(255,255,255,0.08)", borderHi: "rgba(255,255,255,0.16)",
      ...DARK_STATUS,
      grain: false,
      bgImg: `radial-gradient(1400px 900px at 80% -10%, color-mix(in oklab, var(--accent) 32%, transparent), transparent 55%),
              radial-gradient(1100px 800px at -5% 110%, color-mix(in oklab, var(--accent2) 28%, transparent), transparent 60%),
              radial-gradient(700px 500px at 50% 50%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 70%)`,
    },
    light: {
      bg: "#EEF1FA", bg2: "#E3E9F7",
      surface: "rgba(255,255,255,0.65)", surfaceHi: "rgba(255,255,255,0.88)",
      text: "#0D1227", muted: "rgba(13,18,39,0.66)", dim: "rgba(13,18,39,0.55)",
      border: "rgba(0,0,0,0.08)", borderHi: "rgba(0,0,0,0.15)",
      ...LIGHT_STATUS,
      grain: false,
      bgImg: `radial-gradient(1400px 900px at 80% -10%, color-mix(in oklab, var(--accent) 20%, transparent), transparent 55%),
              radial-gradient(1100px 800px at -5% 110%, color-mix(in oklab, var(--accent2) 16%, transparent), transparent 60%)`,
    },
  },
};

export const ACCENTS: Record<TweakAccent, { hex: string; hex2: string; name: string }> = {
  amber:    { hex: "#FFB347", hex2: "#FF6E6E", name: "Янтарь"   },
  magenta:  { hex: "#E14ECC", hex2: "#7A5AE0", name: "Пурпур"   },
  electric: { hex: "#5AC8FA", hex2: "#7A5AE0", name: "Электрик" },
};

const TWEAKS_STORAGE_KEY = "filmdock-tweaks";

export function useTweaks(defaults: Tweaks): [Tweaks, SetTweak] {
  const [values, setValues] = useState<Tweaks>(() => {
    try {
      const raw = localStorage.getItem(TWEAKS_STORAGE_KEY);
      if (raw) return { ...defaults, ...JSON.parse(raw) as Partial<Tweaks> };
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
  const dir = DIRECTIONS[t.direction] ?? DIRECTIONS.noir;
  const acc = ACCENTS[t.accent] ?? ACCENTS.amber;
  const vars = dir[t.theme] ?? dir.dark;
  const style = {
    "--bg":         vars.bg,
    "--bg-2":       vars.bg2,
    "--surface":    vars.surface,
    "--surface-hi": vars.surfaceHi,
    "--text":       vars.text,
    "--muted":      vars.muted,
    "--dim":        vars.dim,
    "--border":     vars.border,
    "--border-hi":  vars.borderHi,
    "--ok":         vars.ok,
    "--warn":       vars.warn,
    "--err":        vars.err,
    "--track":      vars.track,
    "--accent":     acc.hex,
    "--accent2":    acc.hex2,
    "--radius":     `${t.radius}px`,
    "--radius-sm":  `${Math.max(6, t.radius - 6)}px`,
    "--radius-lg":  `${t.radius + 8}px`,
    "--glow":       String(t.glow / 100),
    "--font":       FONT_STACK,
    "--bg-img":     vars.bgImg,
    colorScheme:    t.theme,
  } as CSSProperties;
  return {
    style,
    grain: vars.grain,
    className: `fd-dir-${t.direction} fd-acc-${t.accent} fd-theme-${t.theme}`,
  };
}
