"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { useAnalyticsConsent } from "@/components/CookieConsent";

type VitalEvent = { type: "vital"; url: string; route?: string };

/**
 * Report only the route pattern (e.g. /f/[shareId]), never the real address: share ids,
 * usernames and query strings stay in the browser. Pages without a known route are dropped.
 */
export function speedInsightsEvent(event: VitalEvent): VitalEvent | null {
  if (!event.route) return null;
  return { ...event, url: new URL(event.route, new URL(event.url).origin).toString() };
}

/**
 * Vercel Speed Insights, like PostHog, loads only after the visitor allows analytics.
 * `enabled` is false off Vercel, where there is no collection endpoint.
 */
export default function ConsentedSpeedInsights({ enabled }: { enabled: boolean }) {
  const allowed = useAnalyticsConsent();
  return enabled && allowed ? <SpeedInsights beforeSend={speedInsightsEvent} /> : null;
}
