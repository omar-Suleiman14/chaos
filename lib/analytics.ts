import type { PostHog } from "posthog-js";
import { cleanAnalyticsPath } from "@/lib/analyticsPath";
import { onJourney, onJourneyStep } from "@/lib/journeys";
import { analyticsAllowed, subscribeCookieConsent } from "@/lib/cookieConsent";

/**
 * PostHog, loaded after the page is interactive instead of in the first-load bundle
 * (it is ~90 KB gzipped, the largest script every page shipped). Calls made before it
 * loads after consent are queued and replayed in order. Calls without consent are dropped:
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
  && !!process.env.NEXT_PUBLIC_POSTHOG_HOST
  && analyticsAllowed();

/** Remove this project's old identifiers without loading the SDK or touching app progress. */
function clearAnalyticsStorage() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token || typeof window === "undefined") return;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const store = window[name];
      for (let i = store.length - 1; i >= 0; i--) {
        const key = store.key(i);
        if (key?.startsWith(`ph_${token}_`) || key === `__ph_opt_in_out_${token}`) store.removeItem(key);
      }
    } catch { /* Storage may be blocked. */ }
  }
}

function syncConsent() {
  if (!enabled()) {
    queue = [];
    sdk?.opt_out_capturing();
    sdk?.reset();
    clearAnalyticsStorage();
  } else if (sdk) sdk.opt_in_capturing({ captureEventName: false });
  else void loadAnalytics();
}

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
    opt_out_capturing_by_default: true,
    opt_out_persistence_by_default: true,
    before_send: (event) => {
      if (!enabled()) return null;
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
  posthog.opt_in_capturing({ captureEventName: false });
  posthog.capture("$pageview");
}

/** Downloads and starts PostHog once; later calls return the same promise. */
export function loadAnalytics(): Promise<void> {
  if (!enabled()) return Promise.resolve();
  loading ??= import("posthog-js")
    .then(({ default: posthog }) => {
      // Consent may have been withdrawn while the module was downloading.
      if (!enabled()) { queue = []; loading = null; clearAnalyticsStorage(); return; }
      init(posthog);
      sdk = posthog;
      const pending = queue;
      queue = [];
      for (const call of pending) call(posthog);
    })
    .catch(() => {
      // Blocked by an extension or offline: analytics stays off, the app is unaffected.
      queue = [];
      loading = null;
    });
  return loading;
}

/** Starts PostHog once the browser is idle after load, so it never competes with first paint or input. */
export function scheduleAnalytics() {
  if (typeof window === "undefined") return;
  subscribeCookieConsent(syncConsent);
  if (!enabled()) { clearAnalyticsStorage(); return; }
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
  resetIfIdentified: () => run((p) => { if (p._isIdentified?.()) { p.reset(); p.opt_in_capturing({ captureEventName: false }); } }),
};

// Real-user journey timings: the same marks the browser benchmarks read (lib/journeys.ts).
// p50/p75/p95 per journey come from these events (scripts/production-health.ts).
if (typeof window !== "undefined") {
  onJourney((journey, ms, origin) => posthog.captureLater("journey_usable", { journey, ms, origin }));
  onJourneyStep((journey, step, ms) => posthog.captureLater("journey_step", { journey, step, ms }));
}

export default posthog;
