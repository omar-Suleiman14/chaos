"use client";
/**
 * Reading preferences, kept on this device (localStorage) and shared by every open lesson:
 * text size, line width, typeface, the outline sidebar and read-aloud settings. Unknown or
 * damaged values fall back to defaults so an old or edited store never breaks the reader.
 */
import { useSyncExternalStore } from "react";

export type FollowMode = "word" | "sentence" | "paragraph" | "off";
export const FOLLOW_MODES: readonly FollowMode[] = ["word", "sentence", "paragraph", "off"];
export const NARRATION_COLORS = ["gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;
export type NarrationColor = (typeof NARRATION_COLORS)[number];
export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface ReaderPrefs {
  size: "small" | "normal" | "large";
  width: "narrow" | "normal" | "wide";
  font: "sans" | "serif";
  /** Desktop outline sidebar. */
  outline: "open" | "closed";
  follow: FollowMode;
  narrationColor: NarrationColor;
  /** Whole-lesson speed. */
  speed: number;
  /** One speed for the whole lesson: per-section speeds are ignored while on. */
  oneSpeed: boolean;
  /** Chosen system voice (voiceURI) per language. */
  voices: { en?: string; ar?: string };
}

export const PREFS_KEY = "chaos.learn.reader";
export const DEFAULT_PREFS: ReaderPrefs = { size: "normal", width: "normal", font: "sans", outline: "open", follow: "sentence", narrationColor: "blue", speed: 1, oneSpeed: true, voices: {} };

const oneOf = <T,>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);
export const clampSpeed = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.min(2, Math.max(0.5, n)) : 1);

export function sanitizePrefs(raw: unknown): ReaderPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const voices = (r.voices && typeof r.voices === "object" ? r.voices : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFS;
  return {
    size: oneOf(r.size, ["small", "normal", "large"] as const, d.size),
    width: oneOf(r.width, ["narrow", "normal", "wide"] as const, d.width),
    font: oneOf(r.font, ["sans", "serif"] as const, d.font),
    outline: oneOf(r.outline, ["open", "closed"] as const, d.outline),
    follow: oneOf(r.follow, FOLLOW_MODES, d.follow),
    narrationColor: oneOf(r.narrationColor, NARRATION_COLORS, d.narrationColor),
    speed: r.speed === undefined ? d.speed : clampSpeed(r.speed),
    oneSpeed: typeof r.oneSpeed === "boolean" ? r.oneSpeed : d.oneSpeed,
    voices: { en: typeof voices.en === "string" ? voices.en : undefined, ar: typeof voices.ar === "string" ? voices.ar : undefined },
  };
}

let cache: { raw: string | null; value: ReaderPrefs } = { raw: null, value: DEFAULT_PREFS };
export function readPrefs(): ReaderPrefs {
  let raw: string | null = null;
  try { raw = localStorage.getItem(PREFS_KEY); } catch { /* unavailable */ }
  if (raw === cache.raw) return cache.value;
  let value = DEFAULT_PREFS;
  try { value = sanitizePrefs(raw ? JSON.parse(raw) : {}); } catch { /* damaged: defaults */ }
  cache = { raw, value };
  return value;
}

const EVENT = "chaos-reader-prefs";
export function writePrefs(patch: Partial<ReaderPrefs>) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch })); } catch { /* unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}
const subscribe = (cb: () => void) => {
  const onStorage = (e: StorageEvent) => { if (e.key === PREFS_KEY) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
};

export function useReaderPrefs(): [ReaderPrefs, (patch: Partial<ReaderPrefs>) => void] {
  return [useSyncExternalStore(subscribe, readPrefs, () => DEFAULT_PREFS), writePrefs];
}
