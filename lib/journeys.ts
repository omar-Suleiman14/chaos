"use client";

import { useEffect } from "react";

/**
 * User journeys, each ending at the moment the page is usable, not merely
 * painted: the dashboard shows real items, the editor's first question can
 * be typed in, the joined player sees the lobby. The app marks those moments
 * with the User Timing API; Playwright journeys (perf/browser) and real-user
 * reporting read the same marks, so lab and field numbers mean the same thing.
 */
export const JOURNEYS = {
  dashboard: "Dashboard → usable",
  "form.create": "Create form → first question editable",
  "form.open": "Existing form → editable",
  "course.modules": "Course → module list usable",
  "lesson.read": "Lesson → readable and interactive",
  "quiz.question": "Quiz → question usable",
  "live.join": "Live game → joined",
} as const;
export type Journey = keyof typeof JOURNEYS;

const START = "chaos:start:", USABLE = "chaos:usable:";
type Listener = (journey: Journey, ms: number) => void;
const listeners = new Set<Listener>();

/** For journeys that begin with an in-app action (a click), not a page load. */
export function startJourney(journey: Journey) {
  if (typeof performance === "undefined") return;
  performance.clearMarks(`${START}${journey}`);
  performance.mark(`${START}${journey}`);
}

/** True while a started journey has not reached its usable mark yet. */
export function journeyPending(journey: Journey) {
  if (typeof performance === "undefined") return false;
  const start = performance.getEntriesByName(`${START}${journey}`).at(-1);
  const end = performance.getEntriesByName(`${USABLE}${journey}`).at(-1);
  return !!start && (!end || end.startTime < start.startTime);
}

/**
 * Marks a journey usable and returns its duration in ms: from its start mark
 * when one is pending, otherwise from navigation start. Marks once per start.
 */
export function markUsable(journey: Journey): number | null {
  if (typeof performance === "undefined") return null;
  const start = performance.getEntriesByName(`${START}${journey}`).at(-1);
  const pending = journeyPending(journey);
  if (!pending && performance.getEntriesByName(`${USABLE}${journey}`).length) return null;
  const now = performance.now();
  const ms = Math.round(now - (pending && start ? start.startTime : 0));
  // The duration rides on the mark, so browser benchmarks read exactly what real-user reporting sends.
  performance.mark(`${USABLE}${journey}`, { startTime: now, detail: { ms, path: location.pathname } });
  for (const listener of listeners) listener(journey, ms);
  return ms;
}

/** Marks the journey once, the first time `ready` is true. */
export function useUsableMark(journey: Journey, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    // After paint, so the mark means "visible and interactive", not "committed".
    const frame = requestAnimationFrame(() => markUsable(journey));
    return () => cancelAnimationFrame(frame);
  }, [journey, ready]);
}

/** Real-user reporting subscribes here (lib/analytics.ts). */
export function onJourney(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
