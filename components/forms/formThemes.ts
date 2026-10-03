import type { FormDefinition, FormTheme, ThemeBackdrop, ThemeButtons, ThemeChrome, ThemeCover, ThemeFont, ThemePresetId, ThemeSound } from "@/convex/formLogic";
import { chaosTheme, googleFormsTheme, microsoftFormsTheme, paperTheme } from "@/convex/formLogic";

type Palette = Omit<FormTheme, "version" | "preset" | "logoUrl">;

export interface ThemePreset { id: ThemePresetId; name: string; inspiration: string; theme: Palette }

export const themePresets: ThemePreset[] = [
  { id: "google-forms", name: "Lilac", inspiration: "A lilac page with separate white question cards.", theme: omitMeta(googleFormsTheme) },
  { id: "microsoft-forms", name: "Banner", inspiration: "A full-width title banner above a clean question column.", theme: omitMeta(microsoftFormsTheme) },
  { id: "paper", name: "Paper", inspiration: "Google Forms inspired", theme: { ...omitMeta(paperTheme), sound: "soft" } },
  { id: "chaos", name: "Evergreen", inspiration: "Bold green poster, the first Chaos look", theme: omitMeta(chaosTheme) },
  { id: "soft-grid", name: "Soft grid", inspiration: "Microsoft Forms inspired", theme: { accent: "#0f6cbd", background: "plain", font: "sans", radius: "large", pageColor: "#f3f6fb", surfaceColor: "#ffffff", textColor: "#17253a", layout: "card", cover: "minimal", backdrop: "dots", buttons: "soft", appearance: "auto", sound: "pop" } },
  { id: "spotlight", name: "Spotlight", inspiration: "Typeform inspired", theme: { accent: "#d65b2b", background: "plain", font: "sans", radius: "small", pageColor: "#fdf8f3", surfaceColor: "#fdf8f3", textColor: "#26201e", layout: "focus", cover: "split", backdrop: "none", buttons: "solid", appearance: "fixed", sound: "soft" } },
  { id: "terracotta", name: "Terracotta", inspiration: "Warm editorial", theme: { accent: "#a94e39", background: "plain", font: "serif", radius: "small", pageColor: "#f5e9df", surfaceColor: "#fffaf4", textColor: "#3b2923", layout: "card", cover: "editorial", backdrop: "noise", buttons: "outline", appearance: "fixed", sound: "wood" } },
  { id: "ocean", name: "Ocean", inspiration: "Calm and spacious", theme: { accent: "#126e79", background: "plain", font: "sans", radius: "large", pageColor: "#e9f5f4", surfaceColor: "#ffffff", textColor: "#183a40", layout: "card", cover: "classic", backdrop: "gradient", buttons: "pill", appearance: "auto", sound: "soft" } },
  { id: "midnight", name: "Midnight", inspiration: "Dark contrast", theme: { accent: "#a7d8e5", background: "dark", font: "sans", radius: "large", pageColor: "#0f1a25", surfaceColor: "#182a38", textColor: "#f4f8fa", layout: "card", cover: "split", backdrop: "gradient", buttons: "soft", appearance: "fixed", sound: "soft" } },
  { id: "garden", name: "Garden", inspiration: "Quiet natural tones", theme: { accent: "#366b4a", background: "plain", font: "serif", radius: "small", pageColor: "#eef2e8", surfaceColor: "#fbfcf6", textColor: "#263629", layout: "flat", cover: "minimal", backdrop: "dots", buttons: "outline", appearance: "auto", sound: "wood" } },
  { id: "neon", name: "Neon", inspiration: "Electric lime on black", theme: { accent: "#c6ff3d", background: "dark", font: "display", radius: "none", pageColor: "#0a0a0a", surfaceColor: "#151515", textColor: "#f2f2f2", layout: "flat", cover: "poster", backdrop: "grid", buttons: "solid", appearance: "fixed", sound: "pop" } },
  { id: "aurora", name: "Aurora", inspiration: "Northern lights glow", theme: { accent: "#9d8cff", background: "dark", font: "sans", radius: "large", pageColor: "#0d0b1e", surfaceColor: "#17142e", textColor: "#eeeaff", layout: "focus", cover: "classic", backdrop: "aurora", buttons: "pill", appearance: "fixed", sound: "soft" } },
  { id: "candy", name: "Candy", inspiration: "Playful and sweet", theme: { accent: "#d42a72", background: "plain", font: "rounded", radius: "large", pageColor: "#fff0f6", surfaceColor: "#ffffff", textColor: "#3a1030", layout: "card", cover: "poster", backdrop: "dots", buttons: "pill", appearance: "auto", sound: "pop" } },
  { id: "terminal", name: "Terminal", inspiration: "Green phosphor console", theme: { accent: "#39ff88", background: "dark", font: "mono", radius: "none", pageColor: "#050805", surfaceColor: "#0b120c", textColor: "#c8f7d4", layout: "flat", cover: "terminal", backdrop: "scanlines", buttons: "outline", appearance: "fixed", sound: "arcade" } },
  { id: "newsprint", name: "Newsprint", inspiration: "Front-page editorial", theme: { accent: "#d7261e", background: "plain", font: "editorial", radius: "none", pageColor: "#f4f0e6", surfaceColor: "#f4f0e6", textColor: "#151515", layout: "flat", cover: "editorial", backdrop: "noise", buttons: "brutal", appearance: "fixed", sound: "wood" } },
  { id: "arcade", name: "Arcade", inspiration: "Retro game night", theme: { accent: "#ffcc00", background: "dark", font: "display", radius: "none", pageColor: "#1a0b3d", surfaceColor: "#2a1466", textColor: "#ffffff", layout: "flat", cover: "arcade", backdrop: "grid", buttons: "brutal", appearance: "fixed", sound: "arcade" } },
  { id: "velvet", name: "Velvet", inspiration: "Quiet, dark and elegant", theme: { accent: "#d8c3a5", background: "dark", font: "elegant", radius: "large", pageColor: "#131110", surfaceColor: "#1d1917", textColor: "#f3eee8", layout: "focus", cover: "scroll", backdrop: "gradient", buttons: "outline", appearance: "fixed", sound: "soft" } },
  { id: "sunset", name: "Sunset", inspiration: "Warm gradient glow", theme: { accent: "#e4471f", background: "plain", font: "display", radius: "large", pageColor: "#fff4ea", surfaceColor: "#ffffff", textColor: "#2b1a14", layout: "focus", cover: "split", backdrop: "gradient", buttons: "pill", appearance: "auto", sound: "pop" } },
];

function omitMeta(theme: FormTheme): Palette {
  const { version: _v, preset: _p, logoUrl: _l, ...rest } = theme;
  return rest;
}

export function themeFromPreset(id: ThemePresetId, logoUrl?: string): FormTheme {
  const preset = themePresets.find((item) => item.id === id)!;
  return { version: 1, preset: id, ...preset.theme, ...(logoUrl ? { logoUrl } : {}) };
}

/**
 * An edited theme with every colour filled in. It keeps the preset it started
 * from, so it can show as "Paper · edited" and be reset to Paper.
 */
export function customTheme(theme: FormTheme): FormTheme {
  return {
    ...theme,
    version: 1,
    preset: theme.preset ?? "custom",
    pageColor: theme.pageColor ?? (theme.background === "dark" ? "#171717" : "#f5f4f0"),
    surfaceColor: theme.surfaceColor ?? (theme.background === "dark" ? "#242424" : "#ffffff"),
    textColor: theme.textColor ?? (theme.background === "dark" ? "#f5f5f5" : "#202020"),
    layout: theme.layout ?? "flat",
  };
}

// ── Colour maths ───────────────────────────────────────────────────────────
const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHex = (value: string | undefined): value is string => !!value && HEX.test(value);

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;
}
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
/** WCAG contrast ratio between two hex colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
export function mix(a: string, b: string, weightA: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  return toHex(ca.map((c, i) => c * weightA + cb[i] * (1 - weightA)));
}
export function onAccent(accent: string): string {
  return contrastRatio(accent, "#ffffff") >= contrastRatio(accent, "#111111") ? "#ffffff" : "#111111";
}

function hsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/** Dark palette derived from a light theme, used when appearance is "auto" and the respondent prefers dark. */
export function darkVariant(theme: FormTheme): { page: string; surface: string; text: string; accent: string } {
  const accent = isHex(theme.accent) ? theme.accent : "#3595e3";
  const [h, s, l] = hsl(accent);
  const liftedAccent = luminance(accent) < 0.12 ? fromHsl(h, Math.min(1, s + 0.05), Math.max(l, 0.62)) : accent;
  return {
    page: mix(accent, "#101010", 0.07),
    surface: mix(accent, "#1a1a1a", 0.08),
    text: "#ededeb",
    accent: liftedAccent,
  };
}

/** A pleasant random palette for the "Shuffle" button: harmonious accent, tinted page, readable text. */
export function randomPalette(dark: boolean, random: () => number = Math.random): Pick<FormTheme, "accent" | "pageColor" | "surfaceColor" | "textColor"> {
  const hue = Math.floor(random() * 360);
  const accent = fromHsl(hue, 0.62 + random() * 0.3, dark ? 0.62 : 0.48);
  if (dark) {
    return { accent, pageColor: fromHsl(hue, 0.35, 0.07), surfaceColor: fromHsl(hue, 0.3, 0.12), textColor: fromHsl(hue, 0.25, 0.93) };
  }
  return { accent, pageColor: fromHsl((hue + 20) % 360, 0.55, 0.96), surfaceColor: "#ffffff", textColor: fromHsl(hue, 0.35, 0.14) };
}

export interface ContrastIssue { label: string; ratio: number }
/** Colour pairs below WCAG AA (4.5:1 for text, 3:1 for the accent against the page). */
export function contrastIssues(theme: FormTheme): ContrastIssue[] {
  if (theme.version !== 1) return [];
  const page = isHex(theme.pageColor) ? theme.pageColor : "#f5f4f0";
  const surface = isHex(theme.surfaceColor) ? theme.surfaceColor : "#ffffff";
  const text = isHex(theme.textColor) ? theme.textColor : "#202020";
  const accent = isHex(theme.accent) ? theme.accent : "#3595e3";
  const checks: [string, number, number][] = [
    ["Text on page", contrastRatio(text, page), 4.5],
    ["Text on form surface", contrastRatio(text, surface), 4.5],
    ["Accent on page", contrastRatio(accent, page), 3],
    ["Button label on accent", contrastRatio(onAccent(accent), accent), 4.5],
  ];
  return checks.filter(([, ratio, min]) => ratio < min).map(([label, ratio]) => ({ label, ratio: Math.round(ratio * 10) / 10 }));
}

// ── Rendering helpers ──────────────────────────────────────────────────────
const radii = { none: "0px", small: "8px", large: "18px" } as const;

export function themeStyle(def: FormDefinition): React.CSSProperties {
  const theme = def.theme;
  const radius = { ["--form-radius" as string]: radii[theme.radius] };
  if (theme.version !== 1) {
    return { ...radius, ["--form-accent" as string]: theme.accent, ["--form-on-accent" as string]: isHex(theme.accent) ? onAccent(theme.accent) : "#ffffff" };
  }
  // Light (-l) and derived dark (-d) palettes; CSS picks one, so the theme can follow the respondent's mode.
  const accent = isHex(theme.accent) ? theme.accent : "#3595e3";
  const dark = darkVariant(theme);
  return {
    ...radius,
    ["--form-accent-l" as string]: accent,
    ["--form-page-l" as string]: isHex(theme.pageColor) ? theme.pageColor : "#f5f4f0",
    ["--form-surface-l" as string]: isHex(theme.surfaceColor) ? theme.surfaceColor : "#ffffff",
    ["--form-text-l" as string]: isHex(theme.textColor) ? theme.textColor : "#202020",
    ["--form-on-accent-l" as string]: onAccent(accent),
    ["--form-accent-d" as string]: dark.accent,
    ["--form-page-d" as string]: dark.page,
    ["--form-surface-d" as string]: dark.surface,
    ["--form-text-d" as string]: dark.text,
    ["--form-on-accent-d" as string]: onAccent(dark.accent),
  };
}

export function themeClass(def: FormDefinition): string {
  const theme = def.theme;
  if (theme.version !== 1) {
    const bg = theme.background === "dark" ? "bg-neutral-950 text-neutral-50" : theme.background === "tinted" ? "bg-[color-mix(in_srgb,var(--form-accent)_8%,var(--background))]" : "bg-background";
    return `form-legacy ${bg} form-font-${theme.font}`;
  }
  return [
    "form-theme",
    `form-preset-${theme.preset ?? "custom"}`,
    `form-font-${theme.font}`,
    `form-buttons-${theme.buttons ?? "solid"}`,
    `form-backdrop-${theme.backdrop ?? "none"}`,
    theme.appearance === "auto" ? "form-appearance-auto" : "",
    theme.chrome ? `form-chrome-${theme.chrome}` : "",
  ].filter(Boolean).join(" ");
}

/** Whether respondents can switch light/dark: legacy themes follow the site, "auto" themes derive a dark palette. */
export function themeFollowsAppearance(theme: FormTheme): boolean {
  return theme.version !== 1 || theme.appearance === "auto";
}

export function themeCover(def: FormDefinition): ThemeCover {
  return def.theme.version === 1 ? def.theme.cover ?? "none" : "none";
}
/** Card and banner chrome of the Google Forms / Microsoft Forms looks; undefined for every other theme. */
export function themeChrome(def: FormDefinition): ThemeChrome | undefined {
  return def.theme.version === 1 ? def.theme.chrome : undefined;
}
export function themeSound(def: FormDefinition): ThemeSound {
  return def.theme.sound ?? "soft";
}

// ── Labels for the theme studio ─────────────────────────────────────────────
export const fontOptions: { id: ThemeFont; label: string }[] = [
  { id: "sans", label: "Modern" }, { id: "display", label: "Grotesk" }, { id: "serif", label: "Serif" },
  { id: "editorial", label: "Editorial" }, { id: "elegant", label: "Elegant" }, { id: "rounded", label: "Rounded" }, { id: "mono", label: "Mono" },
  { id: "roboto", label: "Roboto" }, { id: "segoe", label: "Segoe UI" },
];
export const coverOptions: { id: ThemeCover; label: string }[] = [
  { id: "none", label: "No start screen" }, { id: "classic", label: "Centered" }, { id: "split", label: "Split" },
  { id: "poster", label: "Poster" }, { id: "minimal", label: "Minimal" }, { id: "editorial", label: "Editorial" },
  { id: "scroll", label: "Scroll" }, { id: "terminal", label: "Terminal" }, { id: "arcade", label: "Arcade" },
];
export const backdropOptions: { id: ThemeBackdrop; label: string }[] = [
  { id: "none", label: "Plain" }, { id: "dots", label: "Dots" }, { id: "grid", label: "Grid" }, { id: "gradient", label: "Glow" },
  { id: "aurora", label: "Aurora" }, { id: "noise", label: "Grain" }, { id: "stripes", label: "Stripes" }, { id: "scanlines", label: "Scanlines" },
];
export const buttonOptions: { id: ThemeButtons; label: string }[] = [
  { id: "solid", label: "Solid" }, { id: "soft", label: "Soft" }, { id: "pill", label: "Rounded" }, { id: "outline", label: "Outline" }, { id: "brutal", label: "Bold" },
];
export const soundOptions: { id: ThemeSound; label: string; hint: string }[] = [
  { id: "soft", label: "Glass", hint: "Gentle chimes" }, { id: "pop", label: "Pop", hint: "Bubbly and bright" },
  { id: "wood", label: "Wood", hint: "Warm marimba" }, { id: "arcade", label: "Arcade", hint: "8-bit blips" }, { id: "off", label: "Silent", hint: "No sounds" },
];

/** Heading font stacks for small previews that don't load the full theme CSS. Every var has a fallback. */
export const headingFontStacks: Record<ThemeFont, string> = {
  sans: "var(--font-inter, Inter), system-ui, sans-serif",
  display: "var(--font-grotesk, 'Space Grotesk'), var(--font-inter, Inter), system-ui, sans-serif",
  serif: "var(--font-fraunces, Fraunces), Georgia, serif",
  editorial: "var(--font-instrument, 'Instrument Serif'), var(--font-fraunces, Fraunces), Georgia, serif",
  elegant: "var(--font-instrument, 'Instrument Serif'), Georgia, serif",
  rounded: "var(--font-nunito, Nunito), system-ui, sans-serif",
  mono: "var(--font-space-mono, 'Space Mono'), ui-monospace, monospace",
  roboto: "var(--font-roboto, Roboto), var(--font-cairo, Cairo), system-ui, sans-serif",
  segoe: "\"Segoe UI\", \"Segoe UI Web\", -apple-system, system-ui, var(--font-cairo, Cairo), sans-serif",
};

/** What makes up a preset's look. Logo and sound are separate choices and survive a reset. */
const lookKeys = ["accent", "background", "font", "radius", "pageColor", "surfaceColor", "textColor", "layout", "cover", "backdrop", "buttons", "appearance", "chrome"] as const;

/** True when a preset-based theme has been changed from that preset. */
export function isThemeEdited(theme: FormTheme): boolean {
  const preset = themePresets.find((p) => p.id === theme.preset);
  return !!preset && lookKeys.some((key) => theme[key] !== preset.theme[key]);
}

/** Back to the preset's own look, keeping the logo and the sound choice. */
export function resetTheme(theme: FormTheme): FormTheme {
  const preset = themePresets.find((p) => p.id === theme.preset);
  if (!preset) return theme;
  return { ...themeFromPreset(preset.id, theme.logoUrl), ...(theme.sound ? { sound: theme.sound } : {}) };
}
