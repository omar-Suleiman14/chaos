"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Language, Presentation, ThemePresetId } from "@/convex/formLogic";

/**
 * Creator preferences kept on this device, applied instantly (no Save button).
 * Library view and sort reuse the keys the library already reads.
 */
export interface Preferences {
  reduceMotion: boolean;
  /** Popup and menu opacity in percent; 100 is solid. */
  popupOpacity: number;
  newFormPreset: ThemePresetId;
  newFormMode: Presentation;
  newFormLanguage: Language;
  newFormSound: boolean;
  libraryView: "gallery" | "list";
  librarySort: "edited" | "name" | "responses" | "status";
}

export const defaultPreferences: Preferences = {
  reduceMotion: false,
  popupOpacity: 85,
  newFormPreset: "flow",
  newFormMode: "page",
  newFormLanguage: "en",
  newFormSound: false,
  libraryView: "gallery",
  librarySort: "edited",
};

export const popupOpacityRange = { min: 60, max: 100 } as const;
export const clampPopupOpacity = (value: unknown) => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : defaultPreferences.popupOpacity;
  return Math.min(popupOpacityRange.max, Math.max(popupOpacityRange.min, n));
};

const KEY = "chaos.ui.preferences";
const EVENT = "chaos-preferences-change";
// Keys the library has always used; kept so existing choices carry over.
const legacyKeys = { libraryView: "chaos-library-view", librarySort: "chaos-library-sort" } as const;

let cache: { raw: string; value: Preferences } | null = null;

function read(): Preferences {
  let raw = "";
  try {
    raw = [window.localStorage.getItem(KEY), window.localStorage.getItem(legacyKeys.libraryView), window.localStorage.getItem(legacyKeys.librarySort)].join("|");
  } catch { /* storage unavailable */ }
  if (cache?.raw === raw) return cache.value;
  let stored: Partial<Preferences> = {};
  try { stored = JSON.parse(window.localStorage.getItem(KEY) ?? "{}"); } catch { /* ignore */ }
  const value: Preferences = { ...defaultPreferences, ...stored };
  value.popupOpacity = clampPopupOpacity(value.popupOpacity);
  try {
    const view = window.localStorage.getItem(legacyKeys.libraryView);
    if (view === "gallery" || view === "list") value.libraryView = view;
    const sort = window.localStorage.getItem(legacyKeys.librarySort);
    if (sort === "edited" || sort === "name" || sort === "responses" || sort === "status") value.librarySort = sort;
  } catch { /* ignore */ }
  cache = { raw, value };
  return value;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  try {
    if (key in legacyKeys) window.localStorage.setItem(legacyKeys[key as keyof typeof legacyKeys], String(value));
    else {
      const current: Partial<Preferences> = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
      window.localStorage.setItem(KEY, JSON.stringify({ ...current, [key]: value }));
    }
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener("storage", onChange); };
}

export function usePreferences() {
  const preferences = useSyncExternalStore(subscribe, read, () => defaultPreferences);
  const set = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => setPreference(key, value), []);
  return { preferences, set };
}

/** Read once outside React, e.g. when creating a form. */
export const readPreferences = () => (typeof window === "undefined" ? defaultPreferences : read());
