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
  "lesson.edit": "Lesson editor → editable",
  "quiz.question": "Quiz → question usable",
  "quiz.next": "Quiz answer → next question usable",
  "live.join": "Live game → joined",
} as const;
export type Journey = keyof typeof JOURNEYS;

const START = "chaos:start:", USABLE = "chaos:usable:";
/** `action`: measured from an in-app start mark (a click); `load`: from navigation start. */
export type JourneyOrigin = "action" | "load";
type Listener = (journey: Journey, ms: number, origin: JourneyOrigin) => void;
const listeners = new Set<Listener>();

/**
 * Later steps of a started journey, as a funnel: each step reports the time
 * since the journey's start mark (form.create: editor usable → first edit →
 * published). Steps are reported once per start.
 */
export const JOURNEY_STEPS = {
  "form.create": ["first_edit", "published"],
} as const satisfies Partial<Record<Journey, readonly string[]>>;
type StepListener = (journey: Journey, step: string, ms: number) => void;
const stepListeners = new Set<StepListener>();

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
  for (const listener of listeners) listener(journey, ms, pending ? "action" : "load");
  return ms;
}

/** Records a funnel step of the latest started journey; null when none was started or the step was already recorded. */
export function markStep<J extends keyof typeof JOURNEY_STEPS>(journey: J, step: (typeof JOURNEY_STEPS)[J][number]): number | null {
  if (typeof performance === "undefined") return null;
  const start = performance.getEntriesByName(`${START}${journey}`).at(-1);
  if (!start) return null;
  const name = `chaos:step:${journey}:${step}`;
  if (performance.getEntriesByName(name).some((m) => m.startTime >= start.startTime)) return null;
  const now = performance.now();
  const ms = Math.round(now - start.startTime);
  performance.mark(name, { startTime: now, detail: { ms } });
  for (const listener of stepListeners) listener(journey, step, ms);
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

export function onJourneyStep(listener: StepListener) {
  stepListeners.add(listener);
  return () => { stepListeners.delete(listener); };
}
