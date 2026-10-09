/**
 * Per-section playback speeds, kept per lesson on this device. Used only while narrating,
 * so they live outside the reader's first-load preferences module.
 */
import { clampSpeed, type ReaderPrefs } from "@/lib/learn/readerPrefs";

const speedsKey = (lessonId: string) => `chaos.learn.narration.speeds:${lessonId}`;

export function readSectionSpeeds(lessonId: string): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(speedsKey(lessonId)) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "number" && Number.isFinite(v)).map(([k, v]) => [k, clampSpeed(v)]));
  } catch { return {}; }
}

/** Saves (or with null, clears) one section's speed. Returns the new overrides. */
export function writeSectionSpeed(lessonId: string, sectionId: string, speed: number | null): Record<string, number> {
  const next = { ...readSectionSpeeds(lessonId) };
  if (speed === null) delete next[sectionId]; else next[sectionId] = clampSpeed(speed);
  try { localStorage.setItem(speedsKey(lessonId), JSON.stringify(next)); } catch { /* unavailable */ }
  return next;
}

/** The speed a section plays at: the lesson speed when one speed is used, else its own override. */
export function speedFor(prefs: Pick<ReaderPrefs, "speed" | "oneSpeed">, overrides: Record<string, number>, sectionId: string | undefined): number {
  if (prefs.oneSpeed || !sectionId) return prefs.speed;
  return overrides[sectionId] ?? prefs.speed;
}
