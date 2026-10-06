import type { PostHog } from "posthog-js";
import { cleanAnalyticsPath } from "@/lib/analyticsPath";
import { onJourney } from "@/lib/journeys";

/**
 * PostHog, loaded after the page is interactive instead of in the first-load bundle
 * (it is ~90 KB gzipped, the largest script every page shipped). Calls made before it
 * loads are queued and replayed in order, so callers use it like the SDK:
 * `import posthog from "@/lib/analytics"; posthog.capture("form_created", …)`.
 */

/** Address properties PostHog may keep, reduced to a clean path (see lib/analyticsPath.ts). */
const pathProperties = ["$current_url", "$pathname", "$initial_current_url", "$initial_pathname", "$prev_pageview_pathname"];
/** Properties that could carry a private link or a form's title; always dropped. */
const droppedProperties = ["$referrer", "$initial_referrer", "$host", "title", "$title"];
/** PostHog's own events we keep: page views and leaves (for page counts, bounce rate and session length), errors and identify. */
const keptBuiltIns = new Set(["$pageview", "$pageleave", "$exception", "$identify"]);

const MAX_QUEUED = 100;

type Call = (sdk: PostHog) => void;
let sdk: PostHog | null = null;
let loading: Promise<void> | null = null;
let queue: Call[] = [];

const enabled = () => typeof window !== "undefined"
  && !!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  && !!process.env.NEXT_PUBLIC_POSTHOG_HOST;

function init(posthog: PostHog) {
  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!projectToken || !host) return;
  posthog.init(projectToken, {
    api_host: host,
    defaults: "2026-05-30",
    // Page views with cleaned paths, a few named events and errors; no clicks, inputs, raw URLs or replays.
    // Only signed-in creators get a profile, keyed by their account id (see AnalyticsIdentity).
    autocapture: false,
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_exceptions: true,
    disable_session_recording: true,
    person_profiles: "identified_only",
    // No cookies: the anonymous id lives in localStorage so sessions and bounce rate survive a reload.
    persistence: "localStorage",
    respect_dnt: true,
    advanced_disable_feature_flags: true,
    before_send: (event) => {
      if (!event || (event.event.startsWith("$") && !keptBuiltIns.has(event.event))) return null;
      const props = event.properties;
      for (const key of droppedProperties) delete props[key];
      for (const key of pathProperties) {
        if (!(key in props)) continue;
        const clean = cleanAnalyticsPath(props[key], window.location.href);
        if (clean) props[key] = clean; else delete props[key];
      }
      return event;
    },
    debug: process.env.NODE_ENV === "development",
  });
}

/** Downloads and starts PostHog once; later calls return the same promise. */
export function loadAnalytics(): Promise<void> {
  if (!enabled()) return Promise.resolve();
  loading ??= import("posthog-js")
    .then(({ default: posthog }) => {
      init(posthog);
      sdk = posthog;
      const pending = queue;
      queue = [];
      for (const call of pending) call(posthog);
    })
    .catch(() => {
      // Blocked by an extension or offline: analytics stays off, the app is unaffected.
      queue = [];
    });
  return loading;
}

/** Starts PostHog once the browser is idle after load, so it never competes with first paint or input. */
export function scheduleAnalytics() {
  if (!enabled()) return;
  const start = () => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(() => void loadAnalytics(), { timeout: 3000 });
    else setTimeout(() => void loadAnalytics(), 1200);
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

/** `load: false` queues the call for when PostHog loads on its own schedule instead of loading it now. */
function run(call: Call, load = true) {
  if (!enabled()) return;
  if (sdk) return call(sdk);
  if (queue.length < MAX_QUEUED) queue.push(call);
  if (load) void loadAnalytics();
}

const posthog = {
  capture: (...args: Parameters<PostHog["capture"]>) => run((p) => p.capture(...args)),
  /** For timings: sent once PostHog has loaded after the page is idle, never pulling it into a load. */
  captureLater: (...args: Parameters<PostHog["capture"]>) => run((p) => p.capture(...args), false),
  captureException: (...args: Parameters<PostHog["captureException"]>) => run((p) => p.captureException(...args)),
  identify: (...args: Parameters<PostHog["identify"]>) => run((p) => p.identify(...args)),
  /** Forgets a signed-out person, only if someone was identified on this browser. */
  resetIfIdentified: () => run((p) => { if (p._isIdentified?.()) p.reset(); }),
};

// Real-user journey timings: the same marks the browser benchmarks read (lib/journeys.ts).
if (typeof window !== "undefined") onJourney((journey, ms) => posthog.captureLater("journey_usable", { journey, ms }));

export default posthog;
