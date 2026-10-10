"use client";

import { useSyncExternalStore } from "react";
import { parseStoredJson } from "@/lib/storageJson";
import type { CardReview, LessonProgress, ProgressState } from "./types";

// Guest evidence is device-only and never mixed into an account's server evidence.
export const GUEST_STUDY_KEY = "chaos.learn.guest-study.v1";
const EVENT = "chaos-guest-study-change";
type State = { progress: Record<string, LessonProgress>; reviews: Record<string, CardReview[]> };
const EMPTY: State = { progress: {}, reviews: {} };
let cachedRaw: string | null | undefined;
let cached = EMPTY;
let memory: State | undefined;

function read(): State {
  if (typeof window === "undefined") return EMPTY;
  if (memory) return memory;
  let raw: string | null = null;
  try { raw = localStorage.getItem(GUEST_STUDY_KEY); } catch { return cached; }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  cached = parseStoredJson<State>(raw, () => EMPTY, (value): value is State =>
    value !== null && typeof value === "object"
    && "progress" in value && !!value.progress && typeof value.progress === "object"
    && "reviews" in value && !!value.reviews && typeof value.reviews === "object",
  );
  return cached;
}
function write(next: State) {
  cached = next;
  try { cachedRaw = JSON.stringify(next); localStorage.setItem(GUEST_STUDY_KEY, cachedRaw); memory = undefined; }
  catch { memory = next; }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === GUEST_STUDY_KEY || event.key === null) { memory = undefined; listener(); } };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", storage); };
}
export function useGuestStudy() { return useSyncExternalStore(subscribe, read, () => EMPTY); }

export function nextGuestProgress(lessonId: string, prior: LessonProgress | undefined, patch: { state?: ProgressState; percent?: number; lastBlockId?: string }, now = Date.now()): LessonProgress {
  if (patch.state === "not_started") return { lessonId, state: "not_started", percent: 0, updatedAt: now };
  const percent = patch.state === "completed" ? 100 : Math.max(prior?.percent ?? 0, Number.isFinite(patch.percent) ? Math.min(100, Math.max(0, patch.percent!)) : 0);
  return { lessonId, state: patch.state ?? (prior?.state === "completed" ? "completed" : "in_progress"), percent, ...(patch.lastBlockId ?? prior?.lastBlockId ? { lastBlockId: patch.lastBlockId ?? prior?.lastBlockId } : {}), updatedAt: now };
}
export function saveGuestProgress(lessonId: string, patch: Parameters<typeof nextGuestProgress>[2]) {
  const state = read();
  write({ ...state, progress: { ...state.progress, [lessonId]: nextGuestProgress(lessonId, state.progress[lessonId], patch) } });
}
export function saveGuestReview(setId: string, versionId: string, cardId: string, knewIt: boolean) {
  const state = read(), key = `${setId}:${versionId}`;
  const reviews = state.reviews[key] ?? [], prior = reviews.find(r => r.cardId === cardId);
  const review = { setId, cardId, box: knewIt ? Math.min(5, (prior?.box ?? 0) + 1) : 0, reviewedAt: Date.now() };
  write({ ...state, reviews: { ...state.reviews, [key]: [...reviews.filter(r => r.cardId !== cardId), review] } });
}
