"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Forms pinned to the sidebar, kept on this device. One small store so the
 * sidebar, the library menu and the builder agree without prop threading.
 */
const KEY = "chaos.ui.pinned";
const EVENT = "chaos-pinned-change";
const EMPTY: string[] = [];
let cache: { raw: string | null; ids: string[] } = { raw: null, ids: EMPTY };

function read(): string[] {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  if (raw === cache.raw) return cache.ids;
  let ids: string[] = EMPTY;
  try { const parsed = raw ? JSON.parse(raw) : []; if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === "string"); } catch { /* ignore */ }
  cache = { raw, ids };
  return ids;
}

function write(ids: string[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener("storage", onStorage); };
}

export function usePinned() {
  const pinned = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = useCallback((id: string) => {
    const current = read();
    write(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }, []);
  const isPinned = useCallback((id: string) => pinned.includes(id), [pinned]);
  return { pinned, toggle, isPinned };
}
